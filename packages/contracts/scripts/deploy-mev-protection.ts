import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying MEVProtection with account:', deployer.address);

  const CONTRACTS = {
    intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
    solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
  };

  const MEVProtection = await ethers.getContractFactory('MEVProtection');
  const mev = await MEVProtection.deploy(CONTRACTS.intentRegistry, CONTRACTS.solverRegistry);
  await mev.waitForDeployment();

  const address = await mev.getAddress();
  console.log('MEVProtection deployed to:', address);
  console.log('Commit delay:', 2, 'blocks');
  console.log('Reveal window:', 10, 'blocks');
  console.log('Batch duration:', 5, 'blocks');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
