import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying new competitive features with account:', deployer.address);

  const CONTRACTS = {
    intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
    escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
    solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
  };

  // 1. Deploy SolverIncentiveManager
  console.log('\n1. Deploying SolverIncentiveManager...');
  const SolverIncentiveManager = await ethers.getContractFactory('SolverIncentiveManager');
  const incentiveManager = await SolverIncentiveManager.deploy(CONTRACTS.solverRegistry);
  await incentiveManager.waitForDeployment();
  const incentiveAddress = await incentiveManager.getAddress();
  console.log('SolverIncentiveManager deployed to:', incentiveAddress);

  // 2. Deploy PartialFulfillmentModule
  console.log('\n2. Deploying PartialFulfillmentModule...');
  const PartialFulfillmentModule = await ethers.getContractFactory('PartialFulfillmentModule');
  const partialModule = await PartialFulfillmentModule.deploy(
    CONTRACTS.intentRegistry,
    CONTRACTS.escrow
  );
  await partialModule.waitForDeployment();
  const partialAddress = await partialModule.getAddress();
  console.log('PartialFulfillmentModule deployed to:', partialAddress);

  // 3. Deploy DutchAuctionRFQ
  console.log('\n3. Deploying DutchAuctionRFQ...');
  const DutchAuctionRFQ = await ethers.getContractFactory('DutchAuctionRFQ');
  const dutchAuction = await DutchAuctionRFQ.deploy(CONTRACTS.intentRegistry);
  await dutchAuction.waitForDeployment();
  const dutchAddress = await dutchAuction.getAddress();
  console.log('DutchAuctionRFQ deployed to:', dutchAddress);

  // 4. Deploy CrossChainBridgeAdapter
  console.log('\n4. Deploying CrossChainBridgeAdapter...');
  const CrossChainBridgeAdapter = await ethers.getContractFactory('CrossChainBridgeAdapter');
  const bridgeAdapter = await CrossChainBridgeAdapter.deploy(
    CONTRACTS.intentRegistry,
    CONTRACTS.escrow
  );
  await bridgeAdapter.waitForDeployment();
  const bridgeAdapterAddress = await bridgeAdapter.getAddress();
  console.log('CrossChainBridgeAdapter deployed to:', bridgeAdapterAddress);

  // 5. Deploy UpgradeableIntentRegistry proxy
  console.log('\n5. Deploying UpgradeableIntentRegistry...');
  
  // Deploy implementation
  const IntentRegistryV1 = await ethers.getContractFactory('UpgradeableIntentRegistry');
  const impl = await IntentRegistryV1.deploy();
  await impl.waitForDeployment();
  const implAddress = await impl.getAddress();
  console.log('Implementation deployed to:', implAddress);

  // Deploy proxy admin
  const IntentProxyAdmin = await ethers.getContractFactory('IntentProxyAdmin');
  const proxyAdmin = await IntentProxyAdmin.deploy(deployer.address);
  await proxyAdmin.waitForDeployment();
  const proxyAdminAddress = await proxyAdmin.getAddress();
  console.log('ProxyAdmin deployed to:', proxyAdminAddress);

  // Deploy proxy
  const TransparentUpgradeableProxy = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentUpgradeableProxy.deploy(
    implAddress,
    proxyAdminAddress,
    '0x' // Empty init data for now
  );
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log('Proxy deployed to:', proxyAddress);

  // Summary
  console.log('\n=== NEW CONTRACTS DEPLOYED ===');
  console.log('SolverIncentiveManager:', incentiveAddress);
  console.log('PartialFulfillmentModule:', partialAddress);
  console.log('DutchAuctionRFQ:', dutchAddress);
  console.log('CrossChainBridgeAdapter:', bridgeAdapterAddress);
  console.log('UpgradeableIntentRegistry Proxy:', proxyAddress);
  console.log('  - Implementation:', implAddress);
  console.log('  - ProxyAdmin:', proxyAdminAddress);

  // Save addresses
  const addresses = {
    solverIncentiveManager: incentiveAddress,
    partialFulfillmentModule: partialAddress,
    dutchAuctionRFQ: dutchAddress,
    crossChainBridgeAdapter: bridgeAdapterAddress,
    upgradeableIntentRegistry: {
      proxy: proxyAddress,
      implementation: implAddress,
      proxyAdmin: proxyAdminAddress,
    },
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  const fs = require('fs');
  fs.writeFileSync(
    'deployed-new-features.json',
    JSON.stringify(addresses, null, 2)
  );
  console.log('\nAddresses saved to deployed-new-features.json');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
