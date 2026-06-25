import { expect } from "chai";
import { ethers } from "hardhat";
import { BatchAuctionSettlement, IntentRegistry, Escrow, PaymentVerifier, PriceOracle, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("BatchAuctionSettlement", function () {
  let batchAuction: BatchAuctionSettlement;
  let intentRegistry: IntentRegistry;
  let escrow: Escrow;
  let paymentVerifier: PaymentVerifier;
  let priceOracle: PriceOracle;
  let mockToken: MockERC20;

  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let solver1: SignerWithAddress;
  let solver2: SignerWithAddress;
  let treasury: SignerWithAddress;

  const BATCH_ID = ethers.keccak256(ethers.toUtf8Bytes("test-batch"));
  const INTENT_ID_1 = ethers.keccak256(ethers.toUtf8Bytes("intent-1"));
  const INTENT_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("intent-2"));
  const AMOUNT = ethers.parseEther("100");
  const PROTOCOL_FEE_BPS = 100;

  async function getExpiry() {
    const latestBlock = await ethers.provider.getBlock('latest');
    return Number(latestBlock!.timestamp) + 86400;
  }

  beforeEach(async function () {
    [owner, user, solver1, solver2, treasury] = await ethers.getSigners();

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

    // Deploy PriceOracle
    const PriceOracleFactory = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracleFactory.deploy(500, 300);
    await priceOracle.waitForDeployment();

    // Deploy IntentRegistry
    const IntentRegistryFactory = await ethers.getContractFactory("IntentRegistry");
    intentRegistry = await IntentRegistryFactory.deploy(
      await escrow.getAddress(),
      await paymentVerifier.getAddress(),
      await priceOracle.getAddress()
    );
    await intentRegistry.waitForDeployment();

    // Set registry in escrow
    await escrow.setRegistry(await intentRegistry.getAddress());

    // Deploy BatchAuctionSettlement
    const BatchAuctionFactory = await ethers.getContractFactory("BatchAuctionSettlement");
    batchAuction = await BatchAuctionFactory.deploy(await intentRegistry.getAddress());
    await batchAuction.waitForDeployment();

    // Add supported token to escrow
    await escrow.addSupportedToken(await mockToken.getAddress());

    // Mint and approve tokens for user
    await mockToken.mint(user.address, ethers.parseEther("10000"));
    await mockToken.connect(user).approve(await intentRegistry.getAddress(), ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct intent registry", async function () {
      expect(await batchAuction.intentRegistry()).to.equal(await intentRegistry.getAddress());
    });

    it("Should set the correct auction duration", async function () {
      expect(await batchAuction.auctionDuration()).to.equal(300); // 5 minutes
    });

    it("Should set the correct min price improvement", async function () {
      expect(await batchAuction.minPriceImprovementBps()).to.equal(10); // 0.1%
    });

    it("Should set the correct max batch size", async function () {
      expect(await batchAuction.maxBatchSize()).to.equal(50);
    });
  });

  describe("Batch Creation", function () {
    it("Should create a batch with valid intents", async function () {
      const expiry = await getExpiry();

      // Create intents first
      await intentRegistry.connect(user).createIntent(INTENT_ID_1, await mockToken.getAddress(), AMOUNT, expiry);
      await intentRegistry.connect(user).createIntent(INTENT_ID_2, await mockToken.getAddress(), AMOUNT, expiry);

      const intentIds = [INTENT_ID_1, INTENT_ID_2];

      const tx = await batchAuction.connect(owner).createBatch(BATCH_ID, intentIds);
      await tx.wait();
      
      const batch = await batchAuction.batches(BATCH_ID);
      expect(batch.batchId).to.equal(BATCH_ID);
      expect(batch.status).to.equal(0); // BatchStatus.Open
      
      // Get intent IDs from batch
      const batchIntentIds = await batchAuction.getBatchDetails(BATCH_ID);
      expect(batchIntentIds.intentIds.length).to.equal(2);
    });

    it("Should revert with zero batch id", async function () {
      await expect(batchAuction.connect(owner).createBatch(ethers.ZeroHash, []))
        .to.be.revertedWith("BatchAuction: zero batch id");
    });

    it("Should revert with empty batch", async function () {
      await expect(batchAuction.connect(owner).createBatch(BATCH_ID, []))
        .to.be.revertedWith("BatchAuction: empty batch");
    });

    it("Should revert when batch exists", async function () {
      const expiry = await getExpiry();
      await intentRegistry.connect(user).createIntent(INTENT_ID_1, await mockToken.getAddress(), AMOUNT, expiry);

      await batchAuction.connect(owner).createBatch(BATCH_ID, [INTENT_ID_1]);
      
      await expect(batchAuction.connect(owner).createBatch(BATCH_ID, [INTENT_ID_1]))
        .to.be.revertedWith("BatchAuction: batch exists");
    });

    it("Should revert when intent is expired", async function () {
      const expiry = await getExpiry();
      // Create intent that will expire soon
      await intentRegistry.connect(user).createIntent(INTENT_ID_1, await mockToken.getAddress(), AMOUNT, expiry);
      
      // Fast forward past expiry
      await ethers.provider.send("evm_increaseTime", [90000]); // 25 hours
      await ethers.provider.send("evm_mine", []);

      await expect(batchAuction.connect(owner).createBatch(BATCH_ID, [INTENT_ID_1]))
        .to.be.revertedWith("BatchAuction: intent expired");
    });
  });

  describe("Bid Submission", function () {
    beforeEach(async function () {
      const expiry = await getExpiry();
      await intentRegistry.connect(user).createIntent(INTENT_ID_1, await mockToken.getAddress(), AMOUNT, expiry);
      await batchAuction.connect(owner).createBatch(BATCH_ID, [INTENT_ID_1]);
    });

    it("Should submit a valid bid", async function () {
      const bidProof = ethers.toUtf8Bytes("bid-proof");
      
      await expect(batchAuction.connect(solver1).submitBid(BATCH_ID, 50, bidProof))
        .to.emit(batchAuction, "BidSubmitted")
        .withArgs(BATCH_ID, solver1.address, 50);

      const bids = await batchAuction.getBatchBids(BATCH_ID);
      expect(bids.length).to.equal(1);
      expect(bids[0].solver).to.equal(solver1.address);
      expect(bids[0].priceImprovementBps).to.equal(50);
    });

    it("Should revert with bid too low", async function () {
      await expect(batchAuction.connect(solver1).submitBid(BATCH_ID, 5, ethers.toUtf8Bytes("")))
        .to.be.revertedWith("BatchAuction: bid too low");
    });

    it("Should revert when already bid", async function () {
      await batchAuction.connect(solver1).submitBid(BATCH_ID, 50, ethers.toUtf8Bytes(""));
      
      await expect(batchAuction.connect(solver1).submitBid(BATCH_ID, 60, ethers.toUtf8Bytes("")))
        .to.be.revertedWith("BatchAuction: already bid");
    });

    it("Should revert when auction ended", async function () {
      // Fast forward past auction duration
      await ethers.provider.send("evm_increaseTime", [400]);
      await ethers.provider.send("evm_mine", []);

      await expect(batchAuction.connect(solver1).submitBid(BATCH_ID, 50, ethers.toUtf8Bytes("")))
        .to.be.revertedWith("BatchAuction: auction ended");
    });
  });

  describe("Batch Settlement", function () {
    beforeEach(async function () {
      const expiry = await getExpiry();
      await intentRegistry.connect(user).createIntent(INTENT_ID_1, await mockToken.getAddress(), AMOUNT, expiry);
      await intentRegistry.connect(user).createIntent(INTENT_ID_2, await mockToken.getAddress(), AMOUNT, expiry);
      await batchAuction.connect(owner).createBatch(BATCH_ID, [INTENT_ID_1, INTENT_ID_2]);
    });

    it("Should settle batch with winning bid", async function () {
      // Submit bids
      await batchAuction.connect(solver1).submitBid(BATCH_ID, 50, ethers.toUtf8Bytes(""));
      await batchAuction.connect(solver2).submitBid(BATCH_ID, 100, ethers.toUtf8Bytes(""));

      // Fast forward past auction duration
      await ethers.provider.send("evm_increaseTime", [400]);
      await ethers.provider.send("evm_mine", []);

      await expect(batchAuction.settleBatch(BATCH_ID))
        .to.emit(batchAuction, "BatchSettled")
        .withArgs(BATCH_ID, solver2.address, 100);

      const batch = await batchAuction.batches(BATCH_ID);
      expect(batch.status).to.equal(2); // BatchStatus.Settled
      expect(batch.winningSolver).to.equal(solver2.address);
      expect(batch.winningBid).to.equal(100);
    });

    it("Should revert when no bids", async function () {
      await ethers.provider.send("evm_increaseTime", [400]);
      await ethers.provider.send("evm_mine", []);

      await expect(batchAuction.settleBatch(BATCH_ID))
        .to.be.revertedWith("BatchAuction: no bids");
    });

    it("Should revert when auction not ended", async function () {
      await batchAuction.connect(solver1).submitBid(BATCH_ID, 50, ethers.toUtf8Bytes(""));

      await expect(batchAuction.settleBatch(BATCH_ID))
        .to.be.revertedWith("BatchAuction: auction not ended");
    });
  });

  describe("Batch Cancellation", function () {
    beforeEach(async function () {
      const expiry = await getExpiry();
      await intentRegistry.connect(user).createIntent(INTENT_ID_1, await mockToken.getAddress(), AMOUNT, expiry);
      await batchAuction.connect(owner).createBatch(BATCH_ID, [INTENT_ID_1]);
    });

    it("Should cancel batch with no bids", async function () {
      await expect(batchAuction.connect(owner).cancelBatch(BATCH_ID))
        .to.emit(batchAuction, "BatchCancelled")
        .withArgs(BATCH_ID);

      const batch = await batchAuction.batches(BATCH_ID);
      expect(batch.status).to.equal(3); // BatchStatus.Cancelled
    });

    it("Should revert when has bids", async function () {
      await batchAuction.connect(solver1).submitBid(BATCH_ID, 50, ethers.toUtf8Bytes(""));

      await expect(batchAuction.connect(owner).cancelBatch(BATCH_ID))
        .to.be.revertedWith("BatchAuction: has bids");
    });
  });

  describe("Admin Functions", function () {
    it("Should update auction duration", async function () {
      await expect(batchAuction.connect(owner).setAuctionDuration(600))
        .to.emit(batchAuction, "AuctionDurationUpdated")
        .withArgs(300, 600);

      expect(await batchAuction.auctionDuration()).to.equal(600);
    });

    it("Should update min price improvement", async function () {
      await expect(batchAuction.connect(owner).setMinPriceImprovement(20))
        .to.emit(batchAuction, "MinPriceImprovementUpdated")
        .withArgs(10, 20);

      expect(await batchAuction.minPriceImprovementBps()).to.equal(20);
    });

    it("Should update max batch size", async function () {
      await expect(batchAuction.connect(owner).setMaxBatchSize(100))
        .to.emit(batchAuction, "MaxBatchSizeUpdated")
        .withArgs(50, 100);

      expect(await batchAuction.maxBatchSize()).to.equal(100);
    });

    it("Should revert setAuctionDuration when not owner", async function () {
      await expect(batchAuction.connect(user).setAuctionDuration(600))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
