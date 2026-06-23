import { expect } from "chai";
import { ethers } from "hardhat";
import { IntentRegistry, Escrow, PaymentVerifier, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("IntentRegistry", function () {
  let registry: IntentRegistry;
  let escrow: Escrow;
  let verifier: PaymentVerifier;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let solver: SignerWithAddress;
  let signer: SignerWithAddress;
  let other: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INTENT_ID = ethers.keccak256(ethers.toUtf8Bytes("test-intent"));
  const AMOUNT = ethers.parseEther("1000");
  // Helper to get dynamic expiry
  // Helper to get dynamic expiry using blockchain time (not Date.now())
  async function getExpiry() {
    const latestBlock = await ethers.provider.getBlock('latest');
    return Number(latestBlock!.timestamp) + 86400; // 24 hours from block timestamp
  }

  beforeEach(async function () {
    [owner, user, solver, signer, other, treasury] = await ethers.getSigners();

    // Deploy MockERC20
    const MockTokenFactory = await ethers.getContractFactory("MockERC20");
    mockToken = await MockTokenFactory.deploy("Mock Token", "MTK", ethers.parseEther("1000000"));
    await mockToken.waitForDeployment();

    // Deploy Escrow
    const EscrowFactory = await ethers.getContractFactory("Escrow");
    escrow = await EscrowFactory.deploy(
      treasury.address,
      10, // 0.1% protocol fee
      owner.address // emergency recipient
    );
    await escrow.waitForDeployment();

    // Deploy PaymentVerifier
    const PaymentVerifierFactory = await ethers.getContractFactory("PaymentVerifier");
    verifier = await PaymentVerifierFactory.deploy();
    await verifier.waitForDeployment();
    await verifier.connect(owner).addSigner(signer.address);

    // Deploy IntentRegistry
    const IntentRegistryFactory = await ethers.getContractFactory("IntentRegistry");
    registry = await IntentRegistryFactory.deploy(
      await escrow.getAddress(),
      await verifier.getAddress()
    );
    await registry.waitForDeployment();

    // Set registry in escrow
    await escrow.connect(owner).setRegistry(await registry.getAddress());

    // Add supported token to escrow
    await escrow.connect(owner).addSupportedToken(await mockToken.getAddress());

    // Mint tokens to user and approve registry
    await mockToken.mint(user.address, ethers.parseEther("10000"));
    await mockToken.connect(user).approve(await registry.getAddress(), ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should set the correct escrow", async function () {
      expect(await registry.escrow()).to.equal(await escrow.getAddress());
    });

    it("Should set the correct payment verifier", async function () {
      expect(await registry.paymentVerifier()).to.equal(await verifier.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe("createIntent", function () {
    it("Should create intent successfully", async function () {
      const expiry = await getExpiry();
      
      // Debug: Check balance and allowance
      const balance = await mockToken.balanceOf(user.address);
      const allowance = await mockToken.allowance(user.address, await registry.getAddress());
      console.log("User balance:", balance.toString());
      console.log("Allowance:", allowance.toString());
      console.log("Registry address:", await registry.getAddress());
      console.log("Escrow address:", await escrow.getAddress());

      await expect(
        registry.connect(user).createIntent(
          INTENT_ID,
          await mockToken.getAddress(),
          AMOUNT,
          expiry
        )
      )
        .to.emit(registry, "IntentCreated")
        .withArgs(INTENT_ID, user.address, await mockToken.getAddress(), AMOUNT, AMOUNT / 1000n, expiry);

      const intent = await registry.getIntent(INTENT_ID);
      expect(intent.user).to.equal(user.address);
      expect(intent.token).to.equal(await mockToken.getAddress());
      expect(intent.amount).to.equal(AMOUNT);
      expect(intent.status).to.equal(0); // Pending
    });

    it("Should lock tokens in escrow", async function () {
      const expiry = await getExpiry();

      await registry.connect(user).createIntent(
        INTENT_ID,
        await mockToken.getAddress(),
        AMOUNT,
        expiry
      );

      const balance = await escrow.getBalance(await mockToken.getAddress(), user.address, INTENT_ID);
      expect(balance).to.equal(AMOUNT);
    });

    it("Should revert with zero intent id", async function () {
      await expect(
        registry.connect(user).createIntent(
          ethers.ZeroHash,
          await mockToken.getAddress(),
          AMOUNT,
          await getExpiry()
        )
      ).to.be.revertedWith("IntentRegistry: zero intent id");
    });

    it("Should revert with zero token", async function () {
      await expect(
        registry.connect(user).createIntent(
          INTENT_ID,
          ethers.ZeroAddress,
          AMOUNT,
          await getExpiry()
        )
      ).to.be.revertedWith("IntentRegistry: zero token");
    });

    it("Should revert with amount too small", async function () {
      await expect(
        registry.connect(user).createIntent(
          INTENT_ID,
          await mockToken.getAddress(),
          1,
          await getExpiry()
        )
      ).to.be.revertedWith("IntentRegistry: amount too small");
    });

    it("Should revert with expiry in past", async function () {
      await expect(
        registry.connect(user).createIntent(
          INTENT_ID,
          await mockToken.getAddress(),
          AMOUNT,
          Math.floor(Date.now() / 1000) - 1
        )
      ).to.be.revertedWith("IntentRegistry: expiry in past");
    });

    it("Should revert with expiry too far", async function () {
      const now = await ethers.provider.getBlock("latest").then(b => b!.timestamp);
      await expect(
        registry.connect(user).createIntent(
          INTENT_ID,
          await mockToken.getAddress(),
          AMOUNT,
          now + 31 * 24 * 60 * 60 // 31 days from now
        )
      ).to.be.revertedWith("IntentRegistry: expiry too far");
    });

    it("Should revert when intent exists", async function () {
      const expiry = await getExpiry();
      await registry.connect(user).createIntent(
        INTENT_ID,
        await mockToken.getAddress(),
        AMOUNT,
        expiry
      );

      await expect(
        registry.connect(user).createIntent(
          INTENT_ID,
          await mockToken.getAddress(),
          AMOUNT,
          expiry
        )
      ).to.be.revertedWith("IntentRegistry: intent exists");
    });

    it("Should revert when paused", async function () {
      await registry.connect(owner).pause();
      await expect(
        registry.connect(user).createIntent(
          INTENT_ID,
          await mockToken.getAddress(),
          AMOUNT,
          await getExpiry()
        )
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("fulfillIntent", function () {
    beforeEach(async function () {
      const expiry = await getExpiry();
      await registry.connect(user).createIntent(
        INTENT_ID,
        await mockToken.getAddress(),
        AMOUNT,
        expiry
      );
    });

    it("Should fulfill intent successfully", async function () {
      const expiry = await getExpiry();
      const protocolFee = await escrow.calculateProtocolFee(AMOUNT);

      // Create payment proof
      const domain = {
        name: "XDCIntentPayment",
        version: "1",
        chainId: 31337,
        verifyingContract: await verifier.getAddress(),
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
        intentId: INTENT_ID,
        solver: solver.address,
        token: await mockToken.getAddress(),
        amount: AMOUNT,
        protocolFee: protocolFee,
        expiryTimestamp: expiry,
        chainId: 31337,
      };

      const signature = await signer.signTypedData(domain, types, proof);

      await expect(
        registry.connect(solver).fulfillIntentWithBytes(
          INTENT_ID,
          solver.address,
          signature
        )
      )
        .to.emit(registry, "IntentFulfilled")
        .withArgs(INTENT_ID, solver.address, AMOUNT, protocolFee, await ethers.provider.getBlock("latest").then(b => b!.timestamp + 1));

      const intent = await registry.getIntent(INTENT_ID);
      expect(intent.status).to.equal(1); // Fulfilled
      expect(intent.solver).to.equal(solver.address);
    });

    it("Should revert with zero solver", async function () {
      await expect(
        registry.connect(solver).fulfillIntentWithBytes(
          INTENT_ID,
          ethers.ZeroAddress,
          "0x"
        )
      ).to.be.revertedWith("IntentRegistry: zero solver");
    });

    it("Should revert when intent expired", async function () {
      // Get current block timestamp
      const block = await ethers.provider.getBlock("latest");
      const shortExpiry = block!.timestamp + 2; // 2 seconds from now
      
      const shortExpiryId = ethers.keccak256(ethers.toUtf8Bytes("short-expiry"));
      
      await registry.connect(user).createIntent(
        shortExpiryId,
        await mockToken.getAddress(),
        AMOUNT,
        shortExpiry
      );

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 3000));

      const protocolFee = await escrow.calculateProtocolFee(AMOUNT);

      // Create a valid proof
      const domain = {
        name: "XDCIntent",
        version: "1",
        chainId: 31337,
        verifyingContract: await verifier.getAddress(),
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
        intentId: shortExpiryId,
        solver: solver.address,
        token: await mockToken.getAddress(),
        amount: AMOUNT,
        protocolFee: protocolFee,
        expiryTimestamp: await getExpiry(),
        chainId: 31337,
      };

      const signature = await signer.signTypedData(domain, types, proof);

      await expect(
        registry.connect(solver).fulfillIntentWithBytes(
          shortExpiryId,
          solver.address,
          signature
        )
      ).to.be.revertedWith("IntentRegistry: intent expired");
    });
  });

  describe("cancelIntent", function () {
    beforeEach(async function () {
      const expiry = await getExpiry();
      await registry.connect(user).createIntent(
        INTENT_ID,
        await mockToken.getAddress(),
        AMOUNT,
        expiry
      );
    });

    it("Should cancel intent successfully", async function () {
      const userBalanceBefore = await mockToken.balanceOf(user.address);

      await expect(registry.connect(user).cancelIntent(INTENT_ID))
        .to.emit(registry, "IntentCancelled")
        .withArgs(INTENT_ID, user.address, AMOUNT, await ethers.provider.getBlock("latest").then(b => b!.timestamp + 1));

      const intent = await registry.getIntent(INTENT_ID);
      expect(intent.status).to.equal(2); // Cancelled

      const userBalanceAfter = await mockToken.balanceOf(user.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore + AMOUNT);
    });

    it("Should revert when not intent owner", async function () {
      await expect(
        registry.connect(other).cancelIntent(INTENT_ID)
      ).to.be.revertedWith("IntentRegistry: not intent owner");
    });

    it("Should revert when already fulfilled", async function () {
      // First fulfill the intent
      const expiry = await getExpiry();
      const protocolFee = await escrow.calculateProtocolFee(AMOUNT);

      const domain = {
        name: "XDCIntentPayment",
        version: "1",
        chainId: 31337,
        verifyingContract: await verifier.getAddress(),
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
        intentId: INTENT_ID,
        solver: solver.address,
        token: await mockToken.getAddress(),
        amount: AMOUNT,
        protocolFee: protocolFee,
        expiryTimestamp: expiry,
        chainId: 31337,
      };

      const signature = await signer.signTypedData(domain, types, proof);

      await registry.connect(solver).fulfillIntentWithBytes(
        INTENT_ID,
        solver.address,
        signature
      );

      await expect(
        registry.connect(user).cancelIntent(INTENT_ID)
      ).to.be.revertedWith("IntentRegistry: not pending");
    });
  });

  describe("expireIntent", function () {
    it("Should expire intent after expiry", async function () {
      const block = await ethers.provider.getBlock("latest");
      const shortExpiry = block!.timestamp + 2;
      const shortExpiryId = ethers.keccak256(ethers.toUtf8Bytes("expire-test"));

      await registry.connect(user).createIntent(
        shortExpiryId,
        await mockToken.getAddress(),
        AMOUNT,
        shortExpiry
      );

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 3000));

      const userBalanceBefore = await mockToken.balanceOf(user.address);

      const tx = await registry.connect(other).expireIntent(shortExpiryId);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.undefined;
      
      const intentAfter = await registry.getIntent(shortExpiryId);
      expect(intentAfter.status).to.equal(3); // Expired

      const userBalanceAfter = await mockToken.balanceOf(user.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore + AMOUNT);
    });

    it("Should revert before expiry", async function () {
      const expiry = await getExpiry();
      await registry.connect(user).createIntent(
        INTENT_ID,
        await mockToken.getAddress(),
        AMOUNT,
        expiry
      );

      await expect(
        registry.connect(other).expireIntent(INTENT_ID)
      ).to.be.revertedWith("IntentRegistry: not expired yet");
    });
  });

  describe("Admin Functions", function () {
    it("Should set escrow by owner", async function () {
      const newEscrow = await (await ethers.getContractFactory("Escrow")).deploy(
        treasury.address,
        10,
        owner.address
      );
      await newEscrow.waitForDeployment();

      await expect(registry.connect(owner).setEscrow(await newEscrow.getAddress()))
        .to.emit(registry, "EscrowUpdated")
        .withArgs(await newEscrow.getAddress());

      expect(await registry.escrow()).to.equal(await newEscrow.getAddress());
    });

    it("Should set payment verifier by owner", async function () {
      const newVerifier = await (await ethers.getContractFactory("PaymentVerifier")).deploy();
      await newVerifier.waitForDeployment();

      await expect(registry.connect(owner).setPaymentVerifier(await newVerifier.getAddress()))
        .to.emit(registry, "PaymentVerifierUpdated")
        .withArgs(await newVerifier.getAddress());

      expect(await registry.paymentVerifier()).to.equal(await newVerifier.getAddress());
    });

    it("Should revert set escrow when not owner", async function () {
      await expect(
        registry.connect(other).setEscrow(await escrow.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert set payment verifier when not owner", async function () {
      await expect(
        registry.connect(other).setPaymentVerifier(await verifier.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const expiry = await getExpiry();
      await registry.connect(user).createIntent(
        INTENT_ID,
        await mockToken.getAddress(),
        AMOUNT,
        expiry
      );
    });

    it("Should return correct intent details", async function () {
      const intent = await registry.getIntent(INTENT_ID);
      expect(intent.user).to.equal(user.address);
      expect(intent.token).to.equal(await mockToken.getAddress());
      expect(intent.amount).to.equal(AMOUNT);
    });

    it("Should return user intents", async function () {
      const intents = await registry.getUserIntents(user.address);
      expect(intents).to.include(INTENT_ID);
    });

    it("Should return correct pending status", async function () {
      expect(await registry.isIntentPending(INTENT_ID)).to.be.true;
      expect(await registry.isIntentFulfilled(INTENT_ID)).to.be.false;
    });

    it("Should return correct total intents", async function () {
      expect(await registry.getTotalIntents()).to.equal(1);
    });
  });
});