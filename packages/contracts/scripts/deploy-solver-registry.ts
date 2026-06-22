import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying SolverRegistry with account:', deployer.address);

  const minStake = ethers.parseEther('1'); // 1 TXDC minimum stake

  const SolverRegistry = await ethers.getContractFactory('SolverRegistry');
  const registry = await SolverRegistry.deploy(minStake);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log('SolverRegistry deployed to:', address);
  console.log('Minimum stake:', ethers.formatEther(minStake), 'TXDC');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
