import { expect } from "chai";
import { ethers } from "hardhat";
import { IntentRegistry, Escrow, PaymentVerifier, MockERC20, SolverRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { IIntentRegistry } from "../typechain-types/contracts/IntentRegistry";

const INTENT_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes(
    "Intent(uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destChainId,address destToken,uint256 minDestAmount,uint256 maxSolverFee,uint256 expiry,uint256 nonce)"
  )
);

describe("IntentRegistry (plan-aligned)", function () {
  let registry: IntentRegistry;
  let escrow: Escrow;
  let verifier: PaymentVerifier;
  let solverRegistry: SolverRegistry;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let solver: SignerWithAddress;
  let facilitator: SignerWithAddress;

  async function getExpiry() {
    const block = await ethers.provider.getBlock("latest");
    return block!.timestamp + 86400;
  }

  function buildIntentParams(overrides: Partial<IIntentRegistry.IntentParamsStruct> = {}): IIntentRegistry.IntentParamsStruct {
    return {
      sourceChainId: 31337,
      sourceToken: overrides.sourceToken || token.target,
      sourceAmount: overrides.sourceAmount || ethers.parseEther("1000"),
      destChainId: overrides.destChainId || 31337,
      destToken: overrides.destToken || token.target,
      minDestAmount: overrides.minDestAmount || ethers.parseEther("990"),
      maxSolverFee: overrides.maxSolverFee || ethers.parseEther("10"),
      expiry: overrides.expiry || 0,
      nonce: overrides.nonce || 1,
      allowedSolvers: overrides.allowedSolvers || [],
    } as IIntentRegistry.IntentParamsStruct;
  }

  async function signIntent(params: IIntentRegistry.IntentParamsStruct, signer: SignerWithAddress) {
    const domain = {
      name: "XDCIntents",
      version: "1",
      chainId: 31337,
      verifyingContract: await registry.getAddress(),
    };

    const types = {
      Intent: [
        { name: "sourceChainId", type: "uint256" },
        { name: "sourceToken", type: "address" },
        { name: "sourceAmount", type: "uint256" },
        { name: "destChainId", type: "uint256" },
        { name: "destToken", type: "address" },
        { name: "minDestAmount", type: "uint256" },
        { name: "maxSolverFee", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    };

    return signer.signTypedData(domain, types, params);
  }

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

    const SolverRegistryFactory = await ethers.getContractFactory("SolverRegistry");
    solverRegistry = await SolverRegistryFactory.deploy();
    await solverRegistry.waitForDeployment();

    const RegistryFactory = await ethers.getContractFactory("IntentRegistry");
    registry = await RegistryFactory.deploy(await escrow.getAddress(), await verifier.getAddress(), await solverRegistry.getAddress());
    await registry.waitForDeployment();

    await escrow.setRegistry(await registry.getAddress());
    await escrow.addAllowedToken(await token.getAddress());
    await verifier.registerFacilitator(facilitator.address);
    await verifier.registerFacilitator(await registry.getAddress());
    await solverRegistry.connect(solver).registerSolver("TestSolver", 30, [31337, 51]);

    await token.mint(user.address, ethers.parseEther("10000"));
    await token.connect(user).approve(await escrow.getAddress(), ethers.parseEther("10000"));
  });

  it("Should submit and fulfill an intent end-to-end", async function () {
    const expiry = await getExpiry();
    const params = buildIntentParams({ expiry });
    const signature = await signIntent(params, user);

    const intentId = await registry.connect(user).submitIntent.staticCall(params, signature);

    await expect(registry.connect(user).submitIntent(params, signature))
      .to.emit(registry, "IntentSubmitted")
      .withArgs(
        intentId,
        user.address,
        params.sourceToken,
        params.sourceAmount,
        params.destToken,
        params.minDestAmount,
        expiry
      );

    const stored = await registry.getIntent(intentId);
    expect(stored.user).to.equal(user.address);
    expect(stored.status).to.equal(0); // Open

    const paymentTxHash = ethers.keccak256(ethers.toUtf8Bytes("payment-tx-3"));

    // The registry calls verifyPayment itself during fulfillIntent via the registered facilitator.
    await expect(registry.connect(solver).fulfillIntent(intentId, params.minDestAmount, paymentTxHash, solver.address))
      .to.emit(registry, "IntentFulfilled")
      .withArgs(intentId, solver.address, params.minDestAmount, paymentTxHash)
      .to.emit(verifier, "PaymentVerified")
      .withArgs(intentId, solver.address, params.maxSolverFee);

    const fulfilled = await registry.getIntent(intentId);
    expect(fulfilled.status).to.equal(1); // Fulfilled
    expect(fulfilled.solver).to.equal(solver.address);
  });

  it("Should cancel an expired intent", async function () {
    const block = await ethers.provider.getBlock("latest");
    const expiry = block!.timestamp + 2;
    const params = buildIntentParams({ expiry, nonce: 2 });
    const signature = await signIntent(params, user);

    const tx = await registry.connect(user).submitIntent(params, signature);
    const receipt = await tx.wait();
    const log = receipt!.logs.find((l: any) => l.fragment?.name === "IntentSubmitted");
    const intentId = log!.args[0];

    await new Promise((r) => setTimeout(r, 3000));

    await expect(registry.connect(solver).cancelIntent(intentId))
      .to.emit(registry, "IntentCancelled")
      .withArgs(intentId, user.address, params.sourceAmount);
  });

  it("Should batch cancel expired intents", async function () {
    const block = await ethers.provider.getBlock("latest");
    const expiry = block!.timestamp + 3;
    const params1 = buildIntentParams({ expiry, nonce: 3 });
    const params2 = buildIntentParams({ expiry, nonce: 4 });

    const tx1 = await registry.connect(user).submitIntent(params1, await signIntent(params1, user));
    const tx2 = await registry.connect(user).submitIntent(params2, await signIntent(params2, user));

    const id1 = (await (await tx1.wait())!.logs.find((l: any) => l.fragment?.name === "IntentSubmitted")!.args[0]);
    const id2 = (await (await tx2.wait())!.logs.find((l: any) => l.fragment?.name === "IntentSubmitted")!.args[0]);

    await new Promise((r) => setTimeout(r, 4000));

    await expect(registry.connect(solver).cancelExpiredIntents([id1, id2]))
      .to.emit(registry, "IntentCancelled")
      .withArgs(id1, user.address, params1.sourceAmount);
  });
});
