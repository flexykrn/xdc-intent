import { expect } from "chai";
import { ethers } from "hardhat";
import { IntentLZBridge, MockERC20, MockLayerZeroEndpoint } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { buildLzReceiveOptions } from "../scripts/lz-options";

const SOURCE_EID = 101;
const DEST_EID = 102;
const LZ_FEE = ethers.parseEther("0.001");

describe("IntentLZBridge", function () {
  let lzEndpoint: MockLayerZeroEndpoint;
  let sourceBridge: IntentLZBridge;
  let destBridge: IntentLZBridge;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let recipient: SignerWithAddress;

  beforeEach(async function () {
    [owner, user, recipient] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockERC20");
    token = await TokenFactory.deploy("Mock Token", "MTK", ethers.parseEther("1000000"));
    await token.waitForDeployment();

    const EndpointFactory = await ethers.getContractFactory("MockLayerZeroEndpoint");
    lzEndpoint = await EndpointFactory.deploy(SOURCE_EID, LZ_FEE);
    await lzEndpoint.waitForDeployment();

    const BridgeFactory = await ethers.getContractFactory("IntentLZBridge");
    sourceBridge = await BridgeFactory.deploy(await lzEndpoint.getAddress(), owner.address);
    await sourceBridge.waitForDeployment();
    destBridge = await BridgeFactory.deploy(await lzEndpoint.getAddress(), owner.address);
    await destBridge.waitForDeployment();

    await token.mint(user.address, ethers.parseEther("10000"));
    await token.connect(user).approve(await sourceBridge.getAddress(), ethers.parseEther("10000"));

    await sourceBridge.setPeer(DEST_EID, ethers.zeroPadValue(await destBridge.getAddress(), 32));
    await destBridge.setPeer(SOURCE_EID, ethers.zeroPadValue(await sourceBridge.getAddress(), 32));
  });

  it("locks source tokens and emits BridgeOut", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("lz-intent-1"));
    const options = buildLzReceiveOptions(200_000);

    await expect(
      sourceBridge
        .connect(user)
        .bridgeOut(
          intentId,
          await token.getAddress(),
          amount,
          DEST_EID,
          11155111,
          recipient.address,
          await token.getAddress(),
          options,
          { value: LZ_FEE }
        )
    )
      .to.emit(sourceBridge, "BridgeOut")
      .withArgs(
        intentId,
        await token.getAddress(),
        amount,
        DEST_EID,
        11155111,
        user.address,
        recipient.address,
        await token.getAddress()
      );

    expect(await sourceBridge.processed(intentId)).to.equal(true);
    expect(await sourceBridge.lockedBalances(await token.getAddress())).to.equal(amount);
    expect(await token.balanceOf(await sourceBridge.getAddress())).to.equal(amount);
  });

  it("delivers tokens on the destination chain via lzReceive", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("lz-intent-2"));
    const options = buildLzReceiveOptions(200_000);

    await sourceBridge
      .connect(user)
      .bridgeOut(
        intentId,
        await token.getAddress(),
        amount,
        DEST_EID,
        11155111,
        recipient.address,
        await token.getAddress(),
        options,
        { value: LZ_FEE }
      );

    const tx = await lzEndpoint.deliver(0);
    await tx.wait();

    expect(await destBridge.processed(intentId)).to.equal(true);
    expect(await token.balanceOf(recipient.address)).to.equal(amount);
  });

  it("rejects duplicate bridgeOut", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("lz-intent-3"));
    const options = buildLzReceiveOptions(200_000);

    await sourceBridge
      .connect(user)
      .bridgeOut(
        intentId,
        await token.getAddress(),
        amount,
        DEST_EID,
        11155111,
        recipient.address,
        await token.getAddress(),
        options,
        { value: LZ_FEE }
      );

    await expect(
      sourceBridge
        .connect(user)
        .bridgeOut(
          intentId,
          await token.getAddress(),
          amount,
          DEST_EID,
          11155111,
          recipient.address,
          await token.getAddress(),
          options,
          { value: LZ_FEE }
        )
    ).to.be.revertedWith("IntentLZBridge: already processed");
  });

  it("rejects bridgeOut when peer not set", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("lz-intent-4"));
    const options = buildLzReceiveOptions(200_000);

    const BridgeFactory = await ethers.getContractFactory("IntentLZBridge");
    const lonelyBridge = await BridgeFactory.deploy(await lzEndpoint.getAddress(), owner.address);
    await lonelyBridge.waitForDeployment();
    await token.connect(user).approve(await lonelyBridge.getAddress(), ethers.parseEther("10000"));

    await expect(
      lonelyBridge
        .connect(user)
        .bridgeOut(
          intentId,
          await token.getAddress(),
          amount,
          DEST_EID,
          11155111,
          recipient.address,
          await token.getAddress(),
          options,
          { value: LZ_FEE }
        )
    ).to.be.revertedWith("IntentLZBridge: peer not set");
  });

  it("rejects lzReceive from untrusted remote", async function () {
    const amount = ethers.parseEther("100");
    const intentId = ethers.keccak256(ethers.toUtf8Bytes("lz-intent-5"));
    const options = buildLzReceiveOptions(200_000);

    await sourceBridge
      .connect(user)
      .bridgeOut(
        intentId,
        await token.getAddress(),
        amount,
        DEST_EID,
        11155111,
        recipient.address,
        await token.getAddress(),
        options,
        { value: LZ_FEE }
      );

    await destBridge.setPeer(SOURCE_EID, ethers.zeroPadValue(ethers.Wallet.createRandom().address, 32));

    await expect(lzEndpoint.deliver(0)).to.be.revertedWith("IntentLZBridge: untrusted remote");
  });
});
