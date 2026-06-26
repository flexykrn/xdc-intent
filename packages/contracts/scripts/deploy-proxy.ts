import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying UpgradeableIntentRegistry with account:', deployer.address);

  const CONTRACTS = {
    intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
    escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
  };

  // Deploy implementation
  console.log('\n1. Deploying IntentRegistry implementation...');
  const IntentRegistry = await ethers.getContractFactory('IntentRegistry');
  const registryImpl = await IntentRegistry.deploy(
    CONTRACTS.escrow, 
    '0x14699d436E3c5d870A7C6aC3825C500C8f86d270',
    deployer.address
  );
  await registryImpl.waitForDeployment();
  const implAddress = await registryImpl.getAddress();
  console.log('Implementation deployed to:', implAddress);

  // Deploy ProxyAdmin
  console.log('\n2. Deploying ProxyAdmin...');
  const IntentProxyAdmin = await ethers.getContractFactory('IntentProxyAdmin');
  const proxyAdmin = await IntentProxyAdmin.deploy(deployer.address);
  await proxyAdmin.waitForDeployment();
  const adminAddress = await proxyAdmin.getAddress();
  console.log('ProxyAdmin deployed to:', adminAddress);

  // Deploy TransparentUpgradeableProxy
  console.log('\n3. Deploying TransparentUpgradeableProxy...');
  const TransparentUpgradeableProxy = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentUpgradeableProxy.deploy(
    implAddress,
    adminAddress,
    '0x'
  );
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log('Proxy deployed to:', proxyAddress);

  console.log('\n=== UpgradeableIntentRegistry Deployment Summary ===');
  console.log('Implementation:', implAddress);
  console.log('ProxyAdmin:', adminAddress);
  console.log('Proxy (use this address):', proxyAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
