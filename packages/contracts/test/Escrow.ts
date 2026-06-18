import { expect } from "chai";
import { ethers } from "hardhat";
import { Escrow, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Escrow", function () {
  let escrow: Escrow;
  let mockToken: MockERC20;
  let owner: SignerWithAddress;
  let registry: SignerWithAddress;
  let treasury: SignerWithAddress;
  let user: SignerWithAddress;
  let solver: SignerWithAddress;
  let emergencyRecipient: SignerWithAddress;
  let other: SignerWithAddress;

  const PROTOCOL_FEE_BPS = 10; // 0.1%
  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const LOCK_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, registry, treasury, user, solver, emergencyRecipient, other] = await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20Factory.deploy("Mock Token", "MOCK", INITIAL_SUPPLY);
    await mockToken.waitForDeployment();

    // Deploy Escrow
    const EscrowFactory = await ethers.getContractFactory("Escrow");
    escrow = await EscrowFactory.deploy(
      treasury.address,
      PROTOCOL_FEE_BPS,
      emergencyRecipient.address
    );
    await escrow.waitForDeployment();

    // Set registry
    await escrow.connect(owner).setRegistry(registry.address);

    // Add supported token
    await escrow.connect(owner).addSupportedToken(await mockToken.getAddress());

    // Fund user
    await mockToken.transfer(user.address, LOCK_AMOUNT * 2n);
    await mockToken.connect(user).approve(await escrow.getAddress(), LOCK_AMOUNT * 2n);
  });

  describe("Deployment", function () {
    it("Should set the correct treasury", async function () {
      expect(await escrow.treasury()).to.equal(treasury.address);
    });

    it("Should set the correct protocol fee", async function () {
      expect(await escrow.protocolFeeBps()).to.equal(PROTOCOL_FEE_BPS);
    });

    it("Should set the correct emergency recipient", async function () {
      expect(await escrow.emergencyRecipient()).to.equal(emergencyRecipient.address);
    });

    it("Should set the correct owner", async function () {
      expect(await escrow.owner()).to.equal(owner.address);
    });

    it("Should revert with zero treasury address", async function () {
      const EscrowFactory = await ethers.getContractFactory("Escrow");
      await expect(
        EscrowFactory.deploy(ethers.ZeroAddress, PROTOCOL_FEE_BPS, emergencyRecipient.address)
      ).to.be.revertedWith("Escrow: zero address");
    });

    it("Should revert with zero emergency recipient", async function () {
      const EscrowFactory = await ethers.getContractFactory("Escrow");
      await expect(
        EscrowFactory.deploy(treasury.address, PROTOCOL_FEE_BPS, ethers.ZeroAddress)
      ).to.be.revertedWith("Escrow: zero address");
    });

    it("Should revert with fee too high", async function () {
      const EscrowFactory = await ethers.getContractFactory("Escrow");
      await expect(
        EscrowFactory.deploy(treasury.address, 1001, emergencyRecipient.address)
      ).to.be.revertedWith("Escrow: fee too high");
    });
  });

  describe("Token Management", function () {
    it("Should add supported token", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20")).deploy("New", "NEW", INITIAL_SUPPLY);
      await escrow.connect(owner).addSupportedToken(await newToken.getAddress());
      expect(await escrow.isTokenSupported(await newToken.getAddress())).to.be.true;
    });

    it("Should emit SupportedTokenAdded event", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20")).deploy("New", "NEW", INITIAL_SUPPLY);
      await expect(escrow.connect(owner).addSupportedToken(await newToken.getAddress()))
        .to.emit(escrow, "SupportedTokenAdded")
        .withArgs(await newToken.getAddress());
    });

    it("Should revert when adding zero address", async function () {
      await expect(
        escrow.connect(owner).addSupportedToken(ethers.ZeroAddress)
      ).to.be.revertedWith("Escrow: zero address");
    });

    it("Should revert when adding duplicate token", async function () {
      await expect(
        escrow.connect(owner).addSupportedToken(await mockToken.getAddress())
      ).to.be.revertedWith("Escrow: token already supported");
    });

    it("Should remove supported token", async function () {
      await escrow.connect(owner).removeSupportedToken(await mockToken.getAddress());
      expect(await escrow.isTokenSupported(await mockToken.getAddress())).to.be.false;
    });

    it("Should revert when removing non-supported token", async function () {
      await expect(
        escrow.connect(owner).removeSupportedToken(await other.getAddress())
      ).to.be.revertedWith("Escrow: token not supported");
    });
  });

  describe("lockTokens", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-intent"));

    it("Should lock tokens successfully", async function () {
      const tokenAddress = await mockToken.getAddress();
      const escrowAddress = await escrow.getAddress();

      await escrow.connect(registry).lockTokens(tokenAddress, user.address, LOCK_AMOUNT, intentId);

      expect(await escrow.getBalance(tokenAddress, user.address, intentId)).to.equal(LOCK_AMOUNT);
      expect(await escrow.getTotalBalance(tokenAddress)).to.equal(LOCK_AMOUNT);
      expect(await mockToken.balanceOf(escrowAddress)).to.equal(LOCK_AMOUNT);
    });

    it("Should emit TokensLocked event", async function () {
      const tokenAddress = await mockToken.getAddress();

      await expect(
        escrow.connect(registry).lockTokens(tokenAddress, user.address, LOCK_AMOUNT, intentId)
      )
        .to.emit(escrow, "TokensLocked")
        .withArgs(tokenAddress, user.address, intentId, LOCK_AMOUNT);
    });

    it("Should revert when not called by registry", async function () {
      await expect(
        escrow.connect(other).lockTokens(await mockToken.getAddress(), user.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: caller is not registry");
    });

    it("Should revert with unsupported token", async function () {
      const unsupportedToken = await (await ethers.getContractFactory("MockERC20")).deploy("Unsupported", "UNSUP", INITIAL_SUPPLY);
      await expect(
        escrow.connect(registry).lockTokens(await unsupportedToken.getAddress(), user.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: token not supported");
    });

    it("Should revert with zero amount", async function () {
      await expect(
        escrow.connect(registry).lockTokens(await mockToken.getAddress(), user.address, 0, intentId)
      ).to.be.revertedWith("Escrow: zero amount");
    });

    it("Should revert with zero intentId", async function () {
      await expect(
        escrow.connect(registry).lockTokens(await mockToken.getAddress(), user.address, LOCK_AMOUNT, ethers.ZeroHash)
      ).to.be.revertedWith("Escrow: zero intentId");
    });

    it("Should revert with zero user address", async function () {
      await expect(
        escrow.connect(registry).lockTokens(await mockToken.getAddress(), ethers.ZeroAddress, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: zero address");
    });

    it("Should revert when intent already exists", async function () {
      const tokenAddress = await mockToken.getAddress();
      await escrow.connect(registry).lockTokens(tokenAddress, user.address, LOCK_AMOUNT, intentId);
      await expect(
        escrow.connect(registry).lockTokens(tokenAddress, user.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: intent already exists");
    });

    it("Should revert when paused", async function () {
      await escrow.connect(owner).pause();
      await expect(
        escrow.connect(registry).lockTokens(await mockToken.getAddress(), user.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("releaseTokens", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("release-intent"));

    beforeEach(async function () {
      await escrow.connect(registry).lockTokens(
        await mockToken.getAddress(),
        user.address,
        LOCK_AMOUNT,
        intentId
      );
    });

    it("Should release tokens with protocol fee", async function () {
      const tokenAddress = await mockToken.getAddress();
      const escrowAddress = await escrow.getAddress();
      const initialTreasuryBalance = await mockToken.balanceOf(treasury.address);

      const protocolFee = (LOCK_AMOUNT * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
      const solverAmount = LOCK_AMOUNT - protocolFee;

      await escrow.connect(registry).releaseTokens(tokenAddress, solver.address, LOCK_AMOUNT, intentId);

      expect(await escrow.getBalance(tokenAddress, user.address, intentId)).to.equal(0);
      expect(await escrow.getTotalBalance(tokenAddress)).to.equal(0);
      expect(await mockToken.balanceOf(escrowAddress)).to.equal(0);
      expect(await mockToken.balanceOf(solver.address)).to.equal(solverAmount);
      expect(await mockToken.balanceOf(treasury.address)).to.equal(initialTreasuryBalance + protocolFee);
    });

    it("Should emit TokensReleased event", async function () {
      const tokenAddress = await mockToken.getAddress();
      const protocolFee = (LOCK_AMOUNT * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
      const solverAmount = LOCK_AMOUNT - protocolFee;

      await expect(
        escrow.connect(registry).releaseTokens(tokenAddress, solver.address, LOCK_AMOUNT, intentId)
      )
        .to.emit(escrow, "TokensReleased")
        .withArgs(tokenAddress, solver.address, intentId, solverAmount, protocolFee);
    });

    it("Should revert when not called by registry", async function () {
      await expect(
        escrow.connect(other).releaseTokens(await mockToken.getAddress(), solver.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: caller is not registry");
    });

    it("Should revert with insufficient balance", async function () {
      await expect(
        escrow.connect(registry).releaseTokens(await mockToken.getAddress(), solver.address, LOCK_AMOUNT + 1n, intentId)
      ).to.be.revertedWith("Escrow: insufficient balance");
    });

    it("Should revert with zero amount", async function () {
      await expect(
        escrow.connect(registry).releaseTokens(await mockToken.getAddress(), solver.address, 0, intentId)
      ).to.be.revertedWith("Escrow: zero amount");
    });

    it("Should revert with zero recipient", async function () {
      await expect(
        escrow.connect(registry).releaseTokens(await mockToken.getAddress(), ethers.ZeroAddress, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: zero address");
    });

    it("Should revert when paused", async function () {
      await escrow.connect(owner).pause();
      await expect(
        escrow.connect(registry).releaseTokens(await mockToken.getAddress(), solver.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("refundTokens", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("refund-intent"));

    beforeEach(async function () {
      await escrow.connect(registry).lockTokens(
        await mockToken.getAddress(),
        user.address,
        LOCK_AMOUNT,
        intentId
      );
    });

    it("Should refund tokens successfully", async function () {
      const tokenAddress = await mockToken.getAddress();
      const initialUserBalance = await mockToken.balanceOf(user.address);

      await escrow.connect(registry).refundTokens(tokenAddress, user.address, LOCK_AMOUNT, intentId);

      expect(await escrow.getBalance(tokenAddress, user.address, intentId)).to.equal(0);
      expect(await escrow.getTotalBalance(tokenAddress)).to.equal(0);
      expect(await mockToken.balanceOf(user.address)).to.equal(initialUserBalance + LOCK_AMOUNT);
    });

    it("Should emit TokensRefunded event", async function () {
      const tokenAddress = await mockToken.getAddress();

      await expect(
        escrow.connect(registry).refundTokens(tokenAddress, user.address, LOCK_AMOUNT, intentId)
      )
        .to.emit(escrow, "TokensRefunded")
        .withArgs(tokenAddress, user.address, intentId, LOCK_AMOUNT);
    });

    it("Should revert when not called by registry", async function () {
      await expect(
        escrow.connect(other).refundTokens(await mockToken.getAddress(), user.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: caller is not registry");
    });

    it("Should revert with insufficient balance", async function () {
      await expect(
        escrow.connect(registry).refundTokens(await mockToken.getAddress(), user.address, LOCK_AMOUNT + 1n, intentId)
      ).to.be.revertedWith("Escrow: insufficient balance");
    });

    it("Should revert with zero amount", async function () {
      await expect(
        escrow.connect(registry).refundTokens(await mockToken.getAddress(), user.address, 0, intentId)
      ).to.be.revertedWith("Escrow: zero amount");
    });

    it("Should revert with zero user address", async function () {
      await expect(
        escrow.connect(registry).refundTokens(await mockToken.getAddress(), ethers.ZeroAddress, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Escrow: zero address");
    });

    it("Should revert when paused", async function () {
      await escrow.connect(owner).pause();
      await expect(
        escrow.connect(registry).refundTokens(await mockToken.getAddress(), user.address, LOCK_AMOUNT, intentId)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Admin Functions", function () {
    describe("setRegistry", function () {
      it("Should set registry by owner", async function () {
        await escrow.connect(owner).setRegistry(other.address);
        expect(await escrow.registry()).to.equal(other.address);
      });

      it("Should emit RegistryUpdated event", async function () {
        await expect(escrow.connect(owner).setRegistry(other.address))
          .to.emit(escrow, "RegistryUpdated")
          .withArgs(registry.address, other.address);
      });

      it("Should revert when not owner", async function () {
        await expect(
          escrow.connect(other).setRegistry(other.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should revert with zero address", async function () {
        await expect(
          escrow.connect(owner).setRegistry(ethers.ZeroAddress)
        ).to.be.revertedWith("Escrow: zero address");
      });
    });

    describe("setTreasury", function () {
      it("Should set treasury by owner", async function () {
        await escrow.connect(owner).setTreasury(other.address);
        expect(await escrow.treasury()).to.equal(other.address);
      });

      it("Should emit TreasuryUpdated event", async function () {
        await expect(escrow.connect(owner).setTreasury(other.address))
          .to.emit(escrow, "TreasuryUpdated")
          .withArgs(treasury.address, other.address);
      });

      it("Should revert when not owner", async function () {
        await expect(
          escrow.connect(other).setTreasury(other.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should revert with zero address", async function () {
        await expect(
          escrow.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWith("Escrow: zero address");
      });
    });

    describe("setProtocolFee", function () {
      it("Should set fee by owner", async function () {
        await escrow.connect(owner).setProtocolFee(50);
        expect(await escrow.protocolFeeBps()).to.equal(50);
      });

      it("Should emit ProtocolFeeUpdated event", async function () {
        await expect(escrow.connect(owner).setProtocolFee(50))
          .to.emit(escrow, "ProtocolFeeUpdated")
          .withArgs(PROTOCOL_FEE_BPS, 50);
      });

      it("Should revert when not owner", async function () {
        await expect(
          escrow.connect(other).setProtocolFee(50)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should revert with fee too high", async function () {
        await expect(
          escrow.connect(owner).setProtocolFee(1001)
        ).to.be.revertedWith("Escrow: fee too high");
      });
    });

    describe("pause/unpause", function () {
      it("Should pause by owner", async function () {
        await escrow.connect(owner).pause();
        expect(await escrow.paused()).to.be.true;
      });

      it("Should unpause by owner", async function () {
        await escrow.connect(owner).pause();
        await escrow.connect(owner).unpause();
        expect(await escrow.paused()).to.be.false;
      });

      it("Should revert pause when not owner", async function () {
        await expect(
          escrow.connect(other).pause()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should revert unpause when not owner", async function () {
        await expect(
          escrow.connect(other).unpause()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("Emergency Withdrawal", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("emergency-intent"));

    beforeEach(async function () {
      await escrow.connect(registry).lockTokens(
        await mockToken.getAddress(),
        user.address,
        LOCK_AMOUNT,
        intentId
      );
    });

    it("Should propose emergency withdrawal", async function () {
      const tokenAddress = await mockToken.getAddress();
      await escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT);

      const pending = await escrow.pendingEmergencyWithdrawal();
      expect(pending.token).to.equal(tokenAddress);
      expect(pending.amount).to.equal(LOCK_AMOUNT);
      expect(pending.recipient).to.equal(emergencyRecipient.address);
      expect(pending.executed).to.be.false;
    });

    it("Should emit EmergencyWithdrawalProposed event", async function () {
      const tokenAddress = await mockToken.getAddress();
      const executeAfter = (await ethers.provider.getBlock("latest"))!.timestamp + 48 * 60 * 60;

      await expect(escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT))
        .to.emit(escrow, "EmergencyWithdrawalProposed")
        .withArgs(tokenAddress, LOCK_AMOUNT, emergencyRecipient.address, executeAfter + 1);
    });

    it("Should execute after timelock", async function () {
      const tokenAddress = await mockToken.getAddress();
      await escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT);

      // Advance time by 48 hours + 1 second
      await ethers.provider.send("evm_increaseTime", [48 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      await escrow.connect(owner).executeEmergencyWithdrawal();

      expect(await mockToken.balanceOf(emergencyRecipient.address)).to.equal(LOCK_AMOUNT);
      expect(await escrow.getTotalBalance(tokenAddress)).to.equal(0);
    });

    it("Should emit EmergencyWithdrawalExecuted event", async function () {
      const tokenAddress = await mockToken.getAddress();
      await escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT);

      await ethers.provider.send("evm_increaseTime", [48 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      await expect(escrow.connect(owner).executeEmergencyWithdrawal())
        .to.emit(escrow, "EmergencyWithdrawalExecuted")
        .withArgs(tokenAddress, LOCK_AMOUNT, emergencyRecipient.address);
    });

    it("Should cancel pending withdrawal", async function () {
      const tokenAddress = await mockToken.getAddress();
      await escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT);
      await escrow.connect(owner).cancelEmergencyWithdrawal();

      const pending = await escrow.pendingEmergencyWithdrawal();
      expect(pending.token).to.equal(ethers.ZeroAddress);
    });

    it("Should revert execute before timelock", async function () {
      const tokenAddress = await mockToken.getAddress();
      await escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT);

      await expect(
        escrow.connect(owner).executeEmergencyWithdrawal()
      ).to.be.revertedWith("Escrow: timelock not expired");
    });

    it("Should revert with insufficient balance", async function () {
      const tokenAddress = await mockToken.getAddress();
      await expect(
        escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT + 1n)
      ).to.be.revertedWith("Escrow: insufficient balance");
    });

    it("Should revert when pending withdrawal exists", async function () {
      const tokenAddress = await mockToken.getAddress();
      await escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT);
      await expect(
        escrow.connect(owner).proposeEmergencyWithdrawal(tokenAddress, LOCK_AMOUNT)
      ).to.be.revertedWith("Escrow: pending withdrawal exists");
    });
  });

  describe("View Functions", function () {
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("view-intent"));

    beforeEach(async function () {
      await escrow.connect(registry).lockTokens(
        await mockToken.getAddress(),
        user.address,
        LOCK_AMOUNT,
        intentId
      );
    });

    it("Should return correct balance", async function () {
      expect(await escrow.getBalance(await mockToken.getAddress(), user.address, intentId)).to.equal(LOCK_AMOUNT);
    });

    it("Should return correct total balance", async function () {
      expect(await escrow.getTotalBalance(await mockToken.getAddress())).to.equal(LOCK_AMOUNT);
    });

    it("Should return correct token support status", async function () {
      expect(await escrow.isTokenSupported(await mockToken.getAddress())).to.be.true;
      expect(await escrow.isTokenSupported(await other.getAddress())).to.be.false;
    });

    it("Should calculate correct protocol fee", async function () {
      const amount = ethers.parseEther("1000");
      const expectedFee = (amount * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
      expect(await escrow.calculateProtocolFee(amount)).to.equal(expectedFee);
    });
  });
});
