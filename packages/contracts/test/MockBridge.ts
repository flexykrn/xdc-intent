import { expect } from "chai";
import { ethers } from "hardhat";
import { MockBridge, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MockBridge cross-chain support", function () {
  let bridge: MockBridge;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  const MOCK_DEST_CHAIN_A = 99999;
  const MOCK_DEST_CHAIN_B = 88888;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    token = await TokenFactory.deploy("Mock Token", "MTK", ethers.parseEther("1000000"));
    await token.waitForDeployment();

    const BridgeFactory = await ethers.getContractFactory("MockBridge");
    bridge = await BridgeFactory.deploy();
    await bridge.waitForDeployment();

    await token.mint(user.address, ethers.parseEther("10000"));
    await token.connect(user).approve(await bridge.getAddress(), ethers.parseEther("10000"));
  });

  it("emits BridgeOut with the destination chain id and locks tokens", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("intent-1"));

    await expect(bridge.connect(user).bridgeOut(intentId, await token.getAddress(), amount, MOCK_DEST_CHAIN_A))
      .to.emit(bridge, "BridgeOut")
      .withArgs(intentId, await token.getAddress(), amount, MOCK_DEST_CHAIN_A, user.address);

    expect(await bridge.bridgeOutProcessed(intentId)).to.equal(true);
    expect(await token.balanceOf(await bridge.getAddress())).to.equal(amount);
  });

  it("supports multiple mock destination chain ids", async function () {
    const amount = ethers.parseEther("100");
    const intentA = ethers.keccak256(ethers.toUtf8Bytes("intent-a"));
    const intentB = ethers.keccak256(ethers.toUtf8Bytes("intent-b"));

    await bridge.connect(user).bridgeOut(intentA, await token.getAddress(), amount, MOCK_DEST_CHAIN_A);
    await bridge.connect(user).bridgeOut(intentB, await token.getAddress(), amount, MOCK_DEST_CHAIN_B);

    expect(await bridge.bridgeOutProcessed(intentA)).to.equal(true);
    expect(await bridge.bridgeOutProcessed(intentB)).to.equal(true);
  });

  it("allows owner to mint on destination after bridgeOut", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("intent-mint"));

    await bridge.connect(user).bridgeOut(intentId, await token.getAddress(), amount, MOCK_DEST_CHAIN_A);

    await expect(bridge.mintOnDest(intentId, await token.getAddress(), amount, user.address))
      .to.emit(bridge, "BridgeIn")
      .withArgs(intentId, await token.getAddress(), amount, await ethers.provider.getNetwork().then((n) => n.chainId), user.address);

    expect(await bridge.mintProcessed(intentId)).to.equal(true);
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("10000"));
  });

  it("rejects duplicate mints", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("intent-dup"));

    await bridge.connect(user).bridgeOut(intentId, await token.getAddress(), amount, MOCK_DEST_CHAIN_A);
    await bridge.mintOnDest(intentId, await token.getAddress(), amount, user.address);

    await expect(bridge.mintOnDest(intentId, await token.getAddress(), amount, user.address)).to.be.revertedWith(
      "MockBridge: already processed"
    );
  });

  it("rejects bridgeOut to same chain", async function () {
    const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("intent-same"));

    await expect(
      bridge.connect(user).bridgeOut(intentId, await token.getAddress(), ethers.parseEther("1"), chainId)
    ).to.be.revertedWith("MockBridge: same chain");
  });
});
