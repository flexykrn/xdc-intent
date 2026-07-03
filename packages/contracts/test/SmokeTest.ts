import { expect } from "chai";
import { ethers } from "hardhat";
import { IntentRegistry, Escrow, PaymentVerifier, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";

describe("Smoke test: SDK + contracts end-to-end", function () {
  let registry: IntentRegistry;
  let escrow: Escrow;
  let verifier: PaymentVerifier;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let solver: SignerWithAddress;
  let facilitator: SignerWithAddress;

  beforeEach(async function () {
    [owner, user, solver, facilitator] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    token = await TokenFactory.deploy("Mock USDC", "MUSDC", ethers.parseEther("1000000"));
    await token.waitForDeployment();

    const EscrowFactory = await ethers.getContractFactory("Escrow");
    escrow = await EscrowFactory.deploy();
    await escrow.waitForDeployment();

    const VerifierFactory = await ethers.getContractFactory("PaymentVerifier");
    verifier = await VerifierFactory.deploy(ethers.ZeroAddress);
    await verifier.waitForDeployment();

    const RegistryFactory = await ethers.getContractFactory("IntentRegistry");
    registry = await RegistryFactory.deploy(await escrow.getAddress(), await verifier.getAddress());
    await registry.waitForDeployment();

    await escrow.setRegistry(await registry.getAddress());
    await escrow.addAllowedToken(await token.getAddress());
    await verifier.registerFacilitator(facilitator.address);
    await verifier.registerFacilitator(await registry.getAddress());

    await token.mint(user.address, ethers.parseEther("10000"));
    await token.connect(user).approve(await escrow.getAddress(), ethers.parseEther("10000"));
  });

  it("creates and fulfills an intent through the SDK", async function () {
    const block = await ethers.provider.getBlock("latest");
    const expiry = block!.timestamp + 30 * 86400;

    const contractAddresses = {
      escrow: await escrow.getAddress(),
      paymentVerifier: await verifier.getAddress(),
      intentRegistry: await registry.getAddress(),
    };

    const userSDK = new XDCIntentSDK({
      provider: ethers.provider,
      signer: user,
      chainId: 31337,
      contractAddresses,
    });

    const params: IntentParams = {
      sourceChainId: 31337,
      sourceToken: await token.getAddress(),
      sourceAmount: ethers.parseEther("1000"),
      destChainId: 31337,
      destToken: await token.getAddress(),
      minDestAmount: ethers.parseEther("990"),
      maxSolverFee: ethers.parseEther("10"),
      expiry,
      nonce: 1n,
      allowedSolvers: [solver.address],
    };

    const signed = await userSDK.signIntent(user.address, params);
    const submitTx = await userSDK.submitIntent(signed);
    await submitTx.wait();

    const stored = await userSDK.getIntent(signed.intentId);
    expect(stored.status).to.equal(0); // Open

    // Simulate solver-side payment and fulfillment.
    const solverSDK = new XDCIntentSDK({
      provider: ethers.provider,
      signer: solver,
      chainId: 31337,
      contractAddresses,
    });

    const destAmount = ethers.parseEther("995");
    const paymentTxHash = ethers.keccak256(ethers.toUtf8Bytes("mock-payment-tx"));

    const fulfillTx = await solverSDK.fulfillIntent(signed.intentId, destAmount, paymentTxHash);
    await fulfillTx.wait();

    const fulfilled = await userSDK.getIntent(signed.intentId);
    expect(fulfilled.status).to.equal(1); // Fulfilled
    expect(fulfilled.solver).to.equal(solver.address);
    expect(fulfilled.fulfilledAmount).to.equal(destAmount);
    expect(fulfilled.paymentTxHash).to.equal(paymentTxHash);
  });
});
