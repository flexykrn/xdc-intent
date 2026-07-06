import { expect } from "chai";
import { ethers } from "hardhat";
import { SolverRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("SolverRegistry", function () {
  let registry: SolverRegistry;
  let owner: SignerWithAddress;
  let solver: SignerWithAddress;
  let other: SignerWithAddress;

  beforeEach(async function () {
    [owner, solver, other] = await ethers.getSigners();
    const SolverRegistryFactory = await ethers.getContractFactory("SolverRegistry");
    registry = await SolverRegistryFactory.deploy();
    await registry.waitForDeployment();
  });

  const supportedChains = [51, 99999];

  it("Should register a solver", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 30, supportedChains))
      .to.emit(registry, "SolverRegistered")
      .withArgs(1, solver.address, "TestSolver", 30, supportedChains);
    expect(await registry.isRegistered(solver.address)).to.be.true;
    expect(await registry.supportsChain(solver.address, 51)).to.be.true;
    expect(await registry.supportsChain(solver.address, 99999)).to.be.true;
    expect(await registry.supportsChain(solver.address, 1)).to.be.false;
    const info = await registry.getSolver(1);
    expect(info.name).to.equal("TestSolver");
    expect(info.feeBps).to.equal(30);
    expect(info.active).to.be.true;
  });

  it("Should revert with invalid fee", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 10001, supportedChains))
      .to.be.revertedWith("SolverRegistry: fee exceeds 100%");
  });

  it("Should revert without supported chains", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 30, []))
      .to.be.revertedWith("SolverRegistry: no supported chains");
  });

  it("Should deactivate and reactivate solver by owner", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains);
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
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains);
    await expect(registry.connect(other).deactivateSolver(1))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should update supported chains", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30, supportedChains);
    await expect(registry.connect(solver).updateSupportedChains([51, 1]))
      .to.emit(registry, "SupportedChainsUpdated")
      .withArgs(solver.address, [51, 1]);
    expect(await registry.supportsChain(solver.address, 1)).to.be.true;
    expect(await registry.supportsChain(solver.address, 99999)).to.be.false;
  });
});
