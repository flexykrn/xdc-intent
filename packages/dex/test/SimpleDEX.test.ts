import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SimpleDEXFactory, SimpleDEXRouter, TestToken } from "../typechain-types";

describe("SimpleDEX", function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let factory: SimpleDEXFactory;
  let router: SimpleDEXRouter;
  let tokenA: TestToken;
  let tokenB: TestToken;
  let pairAddress: string;

  const LIQ_A = ethers.parseEther("100000");
  const LIQ_B = ethers.parseEther("200000");

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("TestToken");
    tokenA = await TokenFactory.deploy("Token A", "TKA", ethers.parseEther("10000000"));
    await tokenA.waitForDeployment();
    tokenB = await TokenFactory.deploy("Token B", "TKB", ethers.parseEther("10000000"));
    await tokenB.waitForDeployment();

    const FactoryFactory = await ethers.getContractFactory("SimpleDEXFactory");
    factory = await FactoryFactory.deploy();
    await factory.waitForDeployment();

    const RouterFactory = await ethers.getContractFactory("SimpleDEXRouter");
    router = await RouterFactory.deploy(await factory.getAddress(), ethers.ZeroAddress);
    await router.waitForDeployment();

    const tx = await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
    await tx.wait();

    pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());

    await tokenA.transfer(pairAddress, LIQ_A);
    await tokenB.transfer(pairAddress, LIQ_B);

    const pair = await ethers.getContractAt("SimpleDEXPair", pairAddress);
    await pair.sync();
  });

  it("creates a pair via the factory", async function () {
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    expect(await factory.allPairs(0)).to.equal(pairAddress);
    expect(await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress())).to.equal(pairAddress);
    expect(await factory.getPair(await tokenB.getAddress(), await tokenA.getAddress())).to.equal(pairAddress);
  });

  it("reports correct pair reserves", async function () {
    const pair = await ethers.getContractAt("SimpleDEXPair", pairAddress);
    const [reserve0, reserve1] = await pair.getReserves();
    const token0 = await pair.token0();

    const aAddress = await tokenA.getAddress();
    const bAddress = await tokenB.getAddress();

    if (token0.toLowerCase() === aAddress.toLowerCase()) {
      expect(reserve0).to.equal(LIQ_A);
      expect(reserve1).to.equal(LIQ_B);
    } else {
      expect(reserve0).to.equal(LIQ_B);
      expect(reserve1).to.equal(LIQ_A);
    }
  });

  it("router getAmountsOut returns the expected output with a 0.3% swap fee", async function () {
    const amountIn = ethers.parseEther("1000");
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];

    const amounts = await router.getAmountsOut(amountIn, path);
    expect(amounts[0]).to.equal(amountIn);

    const { reserveIn, reserveOut } = await getReserves(path[0], path[1]);
    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    const expectedOut = numerator / denominator;

    expect(amounts[1]).to.equal(expectedOut);
  });

  it("router getAmountsIn returns the required input for an exact output", async function () {
    const amountOut = ethers.parseEther("500");
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];

    const amounts = await router.getAmountsIn(amountOut, path);
    expect(amounts[amounts.length - 1]).to.equal(amountOut);
    expect(amounts[0]).to.be.gt(0);

    const outAmounts = await router.getAmountsOut(amounts[0], path);
    expect(outAmounts[outAmounts.length - 1]).to.be.gte(amountOut);
  });

  it("simulates and executes a token swap", async function () {
    const amountIn = ethers.parseEther("100");
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];

    const amounts = await router.getAmountsOut(amountIn, path);
    const expectedOut = amounts[amounts.length - 1];

    await tokenA.mint(user.address, amountIn);
    await tokenA.connect(user).approve(await router.getAddress(), amountIn);

    const balanceBefore = await tokenB.balanceOf(user.address);

    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = (latestBlock?.timestamp ?? 0) + 3600;

    await router
      .connect(user)
      .swapExactTokensForTokens(amountIn, 0, path, user.address, deadline);

    const balanceAfter = await tokenB.balanceOf(user.address);
    expect(balanceAfter - balanceBefore).to.equal(expectedOut);
  });

  async function getReserves(tokenIn: string, tokenOut: string) {
    const pair = await ethers.getContractAt("SimpleDEXPair", pairAddress);
    const [reserve0, reserve1] = await pair.getReserves();
    const token0 = await pair.token0();

    if (token0.toLowerCase() === tokenIn.toLowerCase()) {
      return { reserveIn: reserve0, reserveOut: reserve1 };
    }
    return { reserveIn: reserve1, reserveOut: reserve0 };
  }
});
