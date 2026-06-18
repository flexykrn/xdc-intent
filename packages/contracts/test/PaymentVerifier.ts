import { expect } from "chai";
import { ethers } from "hardhat";
import { PaymentVerifier } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PaymentVerifier", function () {
  let verifier: PaymentVerifier;
  let owner: SignerWithAddress;
  let signer: SignerWithAddress;
  let solver: SignerWithAddress;
  let other: SignerWithAddress;

  const INTENT_ID = ethers.keccak256(ethers.toUtf8Bytes("test-intent"));
  const TOKEN = "0x0000000000000000000000000000000000000001";
  const AMOUNT = ethers.parseEther("1000");
  const PROTOCOL_FEE = ethers.parseEther("1");

  // Helper to get dynamic expiry (far future to avoid coverage issues)
  function getExpiry() {
    return Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
  }

  // Helper function to create and sign a payment proof
  async function createAndSignProof(
    intentId: string,
    solverAddr: string,
    tokenAddr: string,
    amount: bigint,
    protocolFee: bigint,
    expiry: number,
    chainId: number,
    signerToUse: SignerWithAddress
  ) {
    const domain = {
      name: "XDCIntentPayment",
      version: "1",
      chainId: chainId,
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

    const value = {
      intentId,
      solver: solverAddr,
      token: tokenAddr,
      amount,
      protocolFee,
      expiryTimestamp: expiry,
      chainId,
    };

    const signature = await signerToUse.signTypedData(domain, types, value);
    return { proof: value, signature };
  }

  beforeEach(async function () {
    [owner, signer, solver, other] = await ethers.getSigners();

    const PaymentVerifierFactory = await ethers.getContractFactory("PaymentVerifier");
    verifier = await PaymentVerifierFactory.deploy();
    await verifier.waitForDeployment();

    // Add authorized signer
    await verifier.connect(owner).addSigner(signer.address);
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await verifier.owner()).to.equal(owner.address);
    });

    it("Should have zero initial signers (except beforeEach)", async function () {
      expect(await verifier.isAuthorizedSigner(signer.address)).to.be.true;
      expect(await verifier.isAuthorizedSigner(other.address)).to.be.false;
    });

    it("Should have correct EIP-712 domain separator", async function () {
      const domain = await verifier.getDomainSeparator();
      expect(domain).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Signer Management", function () {
    it("Should add signer by owner", async function () {
      await verifier.connect(owner).addSigner(other.address);
      expect(await verifier.isAuthorizedSigner(other.address)).to.be.true;
    });

    it("Should emit SignerAdded event", async function () {
      await expect(verifier.connect(owner).addSigner(other.address))
        .to.emit(verifier, "SignerAdded")
        .withArgs(other.address);
    });

    it("Should revert add signer with zero address", async function () {
      await expect(
        verifier.connect(owner).addSigner(ethers.ZeroAddress)
      ).to.be.revertedWith("PaymentVerifier: zero address");
    });

    it("Should revert add duplicate signer", async function () {
      await expect(
        verifier.connect(owner).addSigner(signer.address)
      ).to.be.revertedWith("PaymentVerifier: already authorized");
    });

    it("Should revert add signer when not owner", async function () {
      await expect(
        verifier.connect(other).addSigner(other.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should remove signer by owner", async function () {
      await verifier.connect(owner).removeSigner(signer.address);
      expect(await verifier.isAuthorizedSigner(signer.address)).to.be.false;
    });

    it("Should emit SignerRemoved event", async function () {
      await expect(verifier.connect(owner).removeSigner(signer.address))
        .to.emit(verifier, "SignerRemoved")
        .withArgs(signer.address);
    });

    it("Should revert remove non-authorized signer", async function () {
      await expect(
        verifier.connect(owner).removeSigner(other.address)
      ).to.be.revertedWith("PaymentVerifier: not authorized");
    });

    it("Should revert remove signer when not owner", async function () {
      await expect(
        verifier.connect(other).removeSigner(signer.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("verifyPayment", function () {
    it("Should verify valid payment", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );

      await expect(verifier.verifyPayment(proof, signature))
        .to.emit(verifier, "PaymentVerified")
        .withArgs(INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, proof.expiryTimestamp);

      expect(await verifier.isIntentVerified(INTENT_ID)).to.be.true;
      expect(await verifier.getTotalIntentsVerified()).to.equal(1);
      expect(await verifier.getTotalFeesVerified()).to.equal(PROTOCOL_FEE);
    });

    it("Should emit TotalFeesUpdated and TotalIntentsUpdated", async function () {
      const newIntentId = ethers.keccak256(ethers.toUtf8Bytes("emit-test-intent"));
      const { proof, signature } = await createAndSignProof(
        newIntentId, solver.address, TOKEN, ethers.parseEther("100"), ethers.parseEther("0.1"), getExpiry(), 31337, signer
      );

      await expect(verifier.verifyPayment(proof, signature))
        .to.emit(verifier, "TotalFeesUpdated")
        .withArgs(ethers.parseEther("0.1"));

      await expect(verifier.verifyPayment(proof, signature))
        .to.be.revertedWith("PaymentVerifier: intent already verified");
    });

    it("Should revert with expired proof", async function () {
      const expiredTime = Math.floor(Date.now() / 1000) - 100;
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, expiredTime, 31337, signer
      );

      await expect(
        verifier.verifyPayment(proof, signature)
      ).to.be.revertedWith("PaymentVerifier: proof expired");
    });

    it("Should revert with already verified intent", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );

      await verifier.verifyPayment(proof, signature);

      await expect(
        verifier.verifyPayment(proof, signature)
      ).to.be.revertedWith("PaymentVerifier: intent already verified");
    });

    it("Should revert with zero solver", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, ethers.ZeroAddress, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );

      await expect(
        verifier.verifyPayment(proof, signature)
      ).to.be.revertedWith("PaymentVerifier: zero solver");
    });

    it("Should revert with zero token", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, ethers.ZeroAddress, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );

      await expect(
        verifier.verifyPayment(proof, signature)
      ).to.be.revertedWith("PaymentVerifier: zero token");
    });

    it("Should revert with zero amount", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, 0, PROTOCOL_FEE, getExpiry(), 31337, signer
      );

      await expect(
        verifier.verifyPayment(proof, signature)
      ).to.be.revertedWith("PaymentVerifier: zero amount");
    });

    it("Should revert with wrong chain ID", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 999, signer
      );

      await expect(
        verifier.verifyPayment(proof, signature)
      ).to.be.revertedWith("PaymentVerifier: wrong chain");
    });

    it("Should revert with invalid signer", async function () {
      const { proof } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );
      // Sign with unauthorized signer (other)
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
      const invalidSignature = await other.signTypedData(domain, types, proof);

      await expect(
        verifier.verifyPayment(proof, invalidSignature)
      ).to.be.revertedWith("PaymentVerifier: invalid signer");
    });

    it("Should revert when paused", async function () {
      await verifier.connect(owner).pause();
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );

      await expect(
        verifier.verifyPayment(proof, signature)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("verifyPaymentBatch", function () {
    it("Should verify batch of payments", async function () {
      const intentId1 = ethers.keccak256(ethers.toUtf8Bytes("batch-intent-1"));
      const intentId2 = ethers.keccak256(ethers.toUtf8Bytes("batch-intent-2"));

      const { proof: proof1, signature: sig1 } = await createAndSignProof(
        intentId1, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );
      const { proof: proof2, signature: sig2 } = await createAndSignProof(
        intentId2, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );

      const tx = await verifier.verifyPaymentBatch([proof1, proof2], [sig1, sig2]);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.undefined;

      expect(await verifier.isIntentVerified(intentId1)).to.be.true;
      expect(await verifier.isIntentVerified(intentId2)).to.be.true;
    });

    it("Should revert with length mismatch", async function () {
      await expect(
        verifier.verifyPaymentBatch([], [])
      ).to.be.revertedWith("PaymentVerifier: empty batch");
    });

    it("Should revert with batch too large", async function () {
      const proofs = Array(51).fill({
        intentId: INTENT_ID,
        solver: solver.address,
        token: TOKEN,
        amount: AMOUNT,
        protocolFee: PROTOCOL_FEE,
        expiryTimestamp: getExpiry(),
        chainId: 31337,
      });
      const signatures = Array(51).fill("0x");

      await expect(
        verifier.verifyPaymentBatch(proofs, signatures)
      ).to.be.revertedWith("PaymentVerifier: batch too large");
    });
  });

  describe("View Functions", function () {
    it("Should return correct intent verification status", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );
      await verifier.verifyPayment(proof, signature);
      expect(await verifier.isIntentVerified(INTENT_ID)).to.be.true;
    });

    it("Should return correct signer authorization status", async function () {
      expect(await verifier.isAuthorizedSigner(signer.address)).to.be.true;
      expect(await verifier.isAuthorizedSigner(other.address)).to.be.false;
    });

    it("Should return correct total fees", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );
      await verifier.verifyPayment(proof, signature);
      expect(await verifier.getTotalFeesVerified()).to.equal(PROTOCOL_FEE);
    });

    it("Should return correct total intents", async function () {
      const { proof, signature } = await createAndSignProof(
        INTENT_ID, solver.address, TOKEN, AMOUNT, PROTOCOL_FEE, getExpiry(), 31337, signer
      );
      await verifier.verifyPayment(proof, signature);
      expect(await verifier.getTotalIntentsVerified()).to.equal(1);
    });
  });
});