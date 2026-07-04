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

  it("Should register a solver", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 30))
      .to.emit(registry, "SolverRegistered")
      .withArgs(1, solver.address, "TestSolver", 30);
    expect(await registry.isRegistered(solver.address)).to.be.true;
    const info = await registry.getSolver(1);
    expect(info.name).to.equal("TestSolver");
    expect(info.feeBps).to.equal(30);
    expect(info.active).to.be.true;
  });

  it("Should revert with invalid fee", async function () {
    await expect(registry.connect(solver).registerSolver("TestSolver", 10001))
      .to.be.revertedWith("SolverRegistry: fee exceeds 100%");
  });

  it("Should deactivate and reactivate solver by owner", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30);
    await expect(registry.connect(owner).deactivateSolver(1))
      .to.emit(registry, "SolverDeactivated")
      .withArgs(1, solver.address);
    expect(await registry.isRegistered(solver.address)).to.be.false;
    await expect(registry.connect(owner).reactivateSolver(1))
      .to.emit(registry, "SolverReactivated")
      .withArgs(1, solver.address);
    expect(await registry.isRegistered(solver.address)).to.be.true;
  });

  it("Should revert when non-owner deactivates solver", async function () {
    await registry.connect(solver).registerSolver("TestSolver", 30);
    await expect(registry.connect(other).deactivateSolver(1))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });
});
