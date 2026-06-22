import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Registering test solvers with account:', deployer.address);

  const REGISTRY_ADDRESS = '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb';
  const registry = await ethers.getContractAt('SolverRegistry', REGISTRY_ADDRESS);

  // Create test solver wallets
  const solverWallets = [
    new ethers.Wallet(ethers.Wallet.createRandom().privateKey, deployer.provider),
    new ethers.Wallet(ethers.Wallet.createRandom().privateKey, deployer.provider),
    new ethers.Wallet(ethers.Wallet.createRandom().privateKey, deployer.provider),
  ];

  // Fund solver wallets
  for (const wallet of solverWallets) {
    console.log(`Funding solver ${wallet.address}...`);
    const tx = await deployer.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther('5'), // 5 TXDC for gas + stake
    });
    await tx.wait();
  }

  // Register each solver
  for (const wallet of solverWallets) {
    console.log(`Registering solver ${wallet.address}...`);
    const registryWithSigner = registry.connect(wallet);
    const tx = await registryWithSigner.register({
      value: ethers.parseEther('1'), // 1 TXDC stake
    });
    await tx.wait();
    console.log(`Solver ${wallet.address} registered!`);
  }

  // Verify registration
  const solverCount = await registry.getActiveSolversCount();
  console.log(`Total registered solvers: ${solverCount}`);

  const solverList = await registry.getSolverList();
  console.log('Solver addresses:', solverList);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
