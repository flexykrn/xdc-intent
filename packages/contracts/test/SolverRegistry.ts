import { expect } from "chai";
import { ethers } from "hardhat";
import { SolverRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("SolverRegistry", function () {
  let registry: SolverRegistry;
  let owner: SignerWithAddress;
  let solver: SignerWithAddress;
  let other: SignerWithAddress;
  const requiredBond = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, solver, other] = await ethers.getSigners();
    const SolverRegistryFactory = await ethers.getContractFactory("SolverRegistry");
    registry = await SolverRegistryFactory.deploy();
    await registry.waitForDeployment();
    await registry.connect(owner).setRequiredBond(requiredBond);
    await registry.connect(owner).setTreasury(owner.address);
  });

  const supportedChains = [51, 99999];

  it("Should register a solver with bond", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond }))
      .to.emit(registry, "SolverRegistered")
      .withArgs(1, solver.address, "TestSolver", 30, supportedChains)
      .to.emit(registry, "SolverStaked")
      .withArgs(solver.address, requiredBond);
    expect(await registry.isRegistered(solver.address)).to.be.true;
    expect(await registry.supportsChain(solver.address, 51)).to.be.true;
    expect(await registry.getStake(solver.address)).to.equal(requiredBond);
  });

  it("Should revert with invalid fee", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 10001, supportedChains, { value: requiredBond }))
      .to.be.revertedWith("SolverRegistry: fee exceeds 100%");
  });

  it("Should revert without supported chains", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 30, [], { value: requiredBond }))
      .to.be.revertedWith("SolverRegistry: no supported chains");
  });

  it("Should revert with insufficient bond", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond - 1n }))
      .to.be.revertedWith("SolverRegistry: insufficient bond");
  });

  it("Should deactivate and reactivate solver by owner", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond });
    await expect(registry.connect(owner).deactivateSolver(1))
      .to.emit(registry, "SolverDeactivated")
      .withArgs(1, solver.address);
    expect(await registry.isRegistered(solver.address)).to.be.false;
    expect(await registry.supportsChain(solver.address, 51)).to.be.false;
    await expect(registry.connect(owner).reactivateSolver(1))
      .to.emit(registry, "SolverReactivated")
      .withArgs(1, solver.address);
    expect(await registry.isRegistered(solver.address)).to.be.true;
  });

  it("Should revert when non-owner deactivates solver", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond });
    await expect(registry.connect(other).deactivateSolver(1))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should update supported chains", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond });
    await expect(registry.connect(solver).updateSupportedChains([51, 1]))
      .to.emit(registry, "SupportedChainsUpdated")
      .withArgs(solver.address, [51, 1]);
    expect(await registry.supportsChain(solver.address, 1)).to.be.true;
    expect(await registry.supportsChain(solver.address, 99999)).to.be.false;
  });

  it("Should slash a solver and transfer to treasury", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond });
    const treasuryBalanceBefore = await ethers.provider.getBalance(owner.address);
    await expect(registry.connect(owner).slashSolver(solver.address, requiredBond))
      .to.emit(registry, "SolverSlashed")
      .withArgs(solver.address, requiredBond, owner.address)
      .to.emit(registry, "SolverDeactivated")
      .withArgs(1, solver.address);
    expect(await registry.getStake(solver.address)).to.equal(0);
    expect(await registry.isRegistered(solver.address)).to.be.false;
    const treasuryBalanceAfter = await ethers.provider.getBalance(owner.address);
    expect(treasuryBalanceAfter).to.be.gt(treasuryBalanceBefore);
  });

  it("Should allow unstake and withdraw after cooldown", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond });
    await expect(registry.connect(solver).unstake(requiredBond))
      .to.emit(registry, "SolverStaked")
      .withArgs(solver.address, 0);
    expect(await registry.getStake(solver.address)).to.equal(0);
    expect(await registry.getWithdrawableStake(solver.address)).to.equal(requiredBond);

    await expect(registry.connect(solver).withdrawStake())
      .to.be.revertedWith("SolverRegistry: stake locked");

    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    await expect(registry.connect(solver).withdrawStake())
      .to.emit(registry, "StakeWithdrawn")
      .withArgs(solver.address, requiredBond);
    expect(await registry.getWithdrawableStake(solver.address)).to.equal(0);
  });

  it("Should allow additional stake via receive", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains, { value: requiredBond });
    await solver.sendTransaction({ to: await registry.getAddress(), value: ethers.parseEther("0.5") });
    expect(await registry.getStake(solver.address)).to.equal(ethers.parseEther("1.5"));
  });
});
