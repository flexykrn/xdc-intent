import { expect } from "chai";
import { ethers } from "hardhat";
import { PaymentVerifier, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PaymentVerifier", function () {
  let verifier: PaymentVerifier;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let facilitator: SignerWithAddress;
  let payer: SignerWithAddress;
  let payee: SignerWithAddress;
  let other: SignerWithAddress;

  beforeEach(async function () {
    [owner, facilitator, payer, payee, other] = await ethers.getSigners();

    const PaymentVerifierFactory = await ethers.getContractFactory("PaymentVerifier");
    verifier = await PaymentVerifierFactory.deploy(facilitator.address);
    await verifier.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    token = await TokenFactory.deploy("Mock Token", "MOCK", ethers.parseEther("1000000"));
    await token.waitForDeployment();
  });

  describe("facilitators", function () {
    it("Should set initial facilitator", async function () {
      expect(await verifier.facilitators(facilitator.address)).to.be.true;
    });

    it("Should register facilitator by owner", async function () {
      await expect(verifier.connect(owner).registerFacilitator(other.address))
        .to.emit(verifier, "FacilitatorRegistered")
        .withArgs(other.address);
      expect(await verifier.facilitators(other.address)).to.be.true;
    });

    it("Should revert when non-owner registers facilitator", async function () {
      await expect(verifier.connect(other).registerFacilitator(other.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revoke facilitator", async function () {
      await verifier.connect(owner).revokeFacilitator(facilitator.address);
      expect(await verifier.facilitators(facilitator.address)).to.be.false;
    });
  });

  describe("verifyPayment", function () {
    it("Should verify payment by facilitator", async function () {
      const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-intent"));
      const amount = ethers.parseEther("100");
      const txHash = ethers.keccak256(ethers.toUtf8Bytes("tx"));
      await expect(verifier.connect(facilitator).verifyPayment(txHash, payer.address, payee.address, amount, intentId))
        .to.emit(verifier, "PaymentVerified")
        .withArgs(intentId, payer.address, amount);
    });

    it("Should revert when not facilitator", async function () {
      await expect(verifier.connect(other).verifyPayment(ethers.ZeroHash, payer.address, payee.address, 100, ethers.ZeroHash))
        .to.be.revertedWith("PaymentVerifier: not facilitator");
    });
  });

  describe("verifyAuthorization", function () {
    it("Should verify a valid EIP-3009 authorization", async function () {
      const intentId = ethers.keccak256(ethers.toUtf8Bytes("auth-intent"));
      const amount = ethers.parseEther("10");
      const nonce = ethers.keccak256(ethers.randomBytes(32));
      const now = await ethers.provider.getBlock("latest").then((b) => b!.timestamp);
      const validAfter = now - 60;
      const validBefore = now + 600;

      const domain = {
        name: "Mock Token",
        version: "1",
        chainId: 31337,
        verifyingContract: await token.getAddress(),
      };
      const types = {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      };
      const message = {
        from: payer.address,
        to: payee.address,
        value: amount,
        validAfter,
        validBefore,
        nonce,
      };
      const signature = await payer.signTypedData(domain, types, message);
      const sig = ethers.Signature.from(signature);

      await token.mint(payer.address, amount);
      await expect(
        verifier.connect(facilitator).verifyAuthorization(
          await token.getAddress(),
          payer.address,
          payee.address,
          amount,
          validAfter,
          validBefore,
          nonce,
          sig.v,
          sig.r,
          sig.s,
          intentId
        )
      )
        .to.emit(verifier, "AuthorizationVerified")
        .withArgs(intentId, payer.address, amount, nonce);
    });
  });
});
