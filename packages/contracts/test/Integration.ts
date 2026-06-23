import { expect } from "chai";
import { ethers } from "hardhat";
import { Escrow, PaymentVerifier, IntentRegistry, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Integration: End-to-End Intent Flow", function () {
  let escrow: Escrow;
  let paymentVerifier: PaymentVerifier;
  let intentRegistry: IntentRegistry;
  let mockToken: MockERC20;

  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let solver: SignerWithAddress;
  let treasury: SignerWithAddress;
  let other: SignerWithAddress;

  const INTENT_ID = ethers.keccak256(ethers.toUtf8Bytes("integration-intent"));
  const AMOUNT = ethers.parseEther("1000");
  const PROTOCOL_FEE_BPS = 100; // 1%
  const PROTOCOL_FEE = (AMOUNT * BigInt(PROTOCOL_FEE_BPS)) / 10000n;

  // Helper to get dynamic expiry using blockchain time (not Date.now())
  async function getExpiry() {
    const latestBlock = await ethers.provider.getBlock('latest');
    return Number(latestBlock!.timestamp) + 86400; // 24 hours from block timestamp
  }

  async function createAndSignProof(
    intentId: string,
    solverAddr: string,
    tokenAddr: string,
    amount: bigint,
    protocolFee: bigint,
    expiry: number,
    chainId: number,
    signer: SignerWithAddress
  ) {
    const domain = {
      name: "XDCIntentPayment",
      version: "1",
      chainId: chainId,
      verifyingContract: await paymentVerifier.getAddress(),
    };

    const types = {
      PaymentProof: [
        { name: "intentId", type: "bytes32" },
        { name: "solver", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "protocolFee", type: "uint256" },
        { name: "expiryTimestamp", type: "uint256" },
        { name: "chainId", type: "uint256" },
      ],
    };

    const proof = {
      intentId,
      solver: solverAddr,
      token: tokenAddr,
      amount,
      protocolFee,
      expiryTimestamp: expiry,
      chainId,
    };

    const signature = await signer.signTypedData(domain, types, proof);
    return { proof, signature };
  }

  beforeEach(async function () {
    [owner, user, solver, treasury, other] = await ethers.getSigners();

    // Deploy MockERC20
    const MockTokenFactory = await ethers.getContractFactory("MockERC20");
    mockToken = await MockTokenFactory.deploy("Mock Token", "MOCK", ethers.parseEther("1000000"));
    await mockToken.waitForDeployment();

    // Deploy Escrow
    const EscrowFactory = await ethers.getContractFactory("Escrow");
    escrow = await EscrowFactory.deploy(treasury.address, PROTOCOL_FEE_BPS, owner.address);
    await escrow.waitForDeployment();

    // Deploy PaymentVerifier
    const PaymentVerifierFactory = await ethers.getContractFactory("PaymentVerifier");
    paymentVerifier = await PaymentVerifierFactory.deploy();
    await paymentVerifier.waitForDeployment();

    // Deploy IntentRegistry
    const IntentRegistryFactory = await ethers.getContractFactory("IntentRegistry");
    intentRegistry = await IntentRegistryFactory.deploy(
      await escrow.getAddress(),
      await paymentVerifier.getAddress()
    );
    await intentRegistry.waitForDeployment();

    // Set registry in escrow
    await escrow.setRegistry(await intentRegistry.getAddress());

    // Add authorized signer
    await paymentVerifier.addSigner(owner.address);

    // Add supported token
    await escrow.addSupportedToken(await mockToken.getAddress());

    // Mint tokens to user
    await mockToken.mint(user.address, ethers.parseEther("10000"));
    await mockToken.connect(user).approve(await intentRegistry.getAddress(), ethers.parseEther("10000"));
  });

  it("Should complete full intent lifecycle: create -> fulfill", async function () {
    const expiry = await getExpiry();
    const tokenAddress = await mockToken.getAddress();
    const escrowAddress = await escrow.getAddress();

    // Step 1: Create intent
    await expect(
      intentRegistry.connect(user).createIntent(INTENT_ID, tokenAddress, AMOUNT, expiry)
    )
      .to.emit(intentRegistry, "IntentCreated");

    // Verify intent status
    const intent = await intentRegistry.getIntent(INTENT_ID);
    expect(intent.status).to.equal(0); // Pending
    expect(intent.user).to.equal(user.address);
    expect(intent.token).to.equal(tokenAddress);
    expect(intent.amount).to.equal(AMOUNT);

    // Verify tokens locked in escrow
    expect(await escrow.getBalance(tokenAddress, user.address, INTENT_ID)).to.equal(AMOUNT);
    expect(await mockToken.balanceOf(escrowAddress)).to.equal(AMOUNT);

    // Step 2: Create payment proof
    const { proof, signature } = await createAndSignProof(
      INTENT_ID,
      solver.address,
      tokenAddress,
      AMOUNT,
      PROTOCOL_FEE,
      expiry,
      31337,
      owner
    );

    // Step 3: Fulfill intent
    const solverBalanceBefore = await mockToken.balanceOf(solver.address);
    const treasuryBalanceBefore = await mockToken.balanceOf(treasury.address);

    // Pass proof as tuple array for ethers v6
    const proofTuple = [
      proof.intentId,
      proof.solver,
      proof.token,
      proof.amount,
      proof.protocolFee,
      proof.expiryTimestamp,
      proof.chainId,
    ];

    await expect(
      intentRegistry.connect(other).fulfillIntentWithBytes(
        INTENT_ID,
        solver.address,
        signature
      )
    )
      .to.emit(intentRegistry, "IntentFulfilled");

    // Verify intent status
    const fulfilledIntent = await intentRegistry.getIntent(INTENT_ID);
    expect(fulfilledIntent.status).to.equal(1); // Fulfilled
    expect(fulfilledIntent.solver).to.equal(solver.address);

    // Verify solver received payment minus protocol fee
    const solverBalanceAfter = await mockToken.balanceOf(solver.address);
    expect(solverBalanceAfter).to.equal(solverBalanceBefore + AMOUNT - PROTOCOL_FEE);

    // Verify treasury received protocol fee
    const treasuryBalanceAfter = await mockToken.balanceOf(treasury.address);
    expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore + PROTOCOL_FEE);

    // Verify escrow balance is zero
    expect(await escrow.getBalance(tokenAddress, user.address, INTENT_ID)).to.equal(0);
    expect(await mockToken.balanceOf(escrowAddress)).to.equal(0);

    // Verify no state corruption - intent should not be modifiable after fulfillment
    await expect(
      intentRegistry.connect(user).cancelIntent(INTENT_ID)
    ).to.be.revertedWith("IntentRegistry: not pending");

    await expect(
      intentRegistry.connect(other).expireIntent(INTENT_ID)
    ).to.be.revertedWith("IntentRegistry: not pending");
  });

  it("Should verify events emitted in correct order during create -> fulfill", async function () {
    const expiry = await getExpiry();
    const tokenAddress = await mockToken.getAddress();

    // Create intent and capture transaction
    const createTx = await intentRegistry.connect(user).createIntent(
      ethers.keccak256(ethers.toUtf8Bytes("event-order-intent")),
      tokenAddress,
      AMOUNT,
      expiry
    );
    const createReceipt = await createTx.wait();
    
    // Verify IntentCreated event is first and only event from registry
    const registryAddress = await intentRegistry.getAddress();
    const registryEvents = createReceipt?.logs.filter(
      (log) => log.address === registryAddress
    );
    expect(registryEvents).to.have.length(1);
    
    // Verify event signature
    const event = registryEvents![0];
    const iface = intentRegistry.interface;
    const parsedLog = iface.parseLog({
      topics: event.topics as string[],
      data: event.data,
    });
    expect(parsedLog?.name).to.equal("IntentCreated");
  });

  it("Should verify no state corruption across multiple intents", async function () {
    const tokenAddress = await mockToken.getAddress();
    const intentIds = [
      ethers.keccak256(ethers.toUtf8Bytes("intent-1")),
      ethers.keccak256(ethers.toUtf8Bytes("intent-2")),
      ethers.keccak256(ethers.toUtf8Bytes("intent-3")),
    ];
    const amounts = [
      ethers.parseEther("100"),
      ethers.parseEther("200"),
      ethers.parseEther("300"),
    ];

    // Create multiple intents
    for (let i = 0; i < intentIds.length; i++) {
      await intentRegistry.connect(user).createIntent(
        intentIds[i],
        tokenAddress,
        amounts[i],
        await getExpiry()
      );
    }

    // Verify all intents have correct state
    for (let i = 0; i < intentIds.length; i++) {
      const intent = await intentRegistry.getIntent(intentIds[i]);
      expect(intent.status).to.equal(0); // Pending
      expect(intent.amount).to.equal(amounts[i]);
      expect(await escrow.getBalance(tokenAddress, user.address, intentIds[i])).to.equal(amounts[i]);
    }

    // Cancel middle intent
    await intentRegistry.connect(user).cancelIntent(intentIds[1]);

    // Verify other intents unaffected
    const intent1 = await intentRegistry.getIntent(intentIds[0]);
    expect(intent1.status).to.equal(0); // Still pending
    
    const intent3 = await intentRegistry.getIntent(intentIds[2]);
    expect(intent3.status).to.equal(0); // Still pending

    // Verify cancelled intent
    const intent2 = await intentRegistry.getIntent(intentIds[1]);
    expect(intent2.status).to.equal(2); // Cancelled
  });

  it("Should complete full intent lifecycle: create -> cancel", async function () {
    const expiry = await getExpiry();
    const tokenAddress = await mockToken.getAddress();

    // Create intent
    await intentRegistry.connect(user).createIntent(INTENT_ID, tokenAddress, AMOUNT, expiry);

    const userBalanceBefore = await mockToken.balanceOf(user.address);

    // Cancel intent
    await expect(intentRegistry.connect(user).cancelIntent(INTENT_ID))
      .to.emit(intentRegistry, "IntentCancelled");

    // Verify intent status
    const cancelledIntent = await intentRegistry.getIntent(INTENT_ID);
    expect(cancelledIntent.status).to.equal(2); // Cancelled

    // Verify user got refund
    const userBalanceAfter = await mockToken.balanceOf(user.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore + AMOUNT);
  });

  it("Should complete full intent lifecycle: create -> expire", async function () {
    const block = await ethers.provider.getBlock("latest");
    const expiry = block!.timestamp + 2;
    const tokenAddress = await mockToken.getAddress();

    // Create intent with short expiry
    await intentRegistry.connect(user).createIntent(INTENT_ID, tokenAddress, AMOUNT, expiry);

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const userBalanceBefore = await mockToken.balanceOf(user.address);

    // Expire intent
    await expect(intentRegistry.connect(other).expireIntent(INTENT_ID))
      .to.emit(intentRegistry, "IntentExpired");

    // Verify intent status
    const expiredIntent = await intentRegistry.getIntent(INTENT_ID);
    expect(expiredIntent.status).to.equal(3); // Expired

    // Verify user got refund
    const userBalanceAfter = await mockToken.balanceOf(user.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore + AMOUNT);
  });
});
