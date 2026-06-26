import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying remaining 3 contracts with account:', deployer.address);

  const CONTRACTS = {
    intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
    escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
    solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
    solverIncentiveManager: '0x9F826BFaF6A56790167060e24c5a4A08b4574a28',
    partialFulfillmentModule: '0x62253677e5921C5f31b52cbEC3B2cFA9faD6e040',
  };

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
  const bridgeAdapter = await CrossChainBridgeAdapter.deploy(CONTRACTS.intentRegistry, CONTRACTS.escrow);
  await bridgeAdapter.waitForDeployment();
  const bridgeAddress = await bridgeAdapter.getAddress();
  console.log('CrossChainBridgeAdapter deployed to:', bridgeAddress);

  // 5. Deploy UpgradeableIntentRegistry (Proxy)
  console.log('\n5. Deploying UpgradeableIntentRegistry...');
  const IntentRegistry = await ethers.getContractFactory('IntentRegistry');
  const registryImpl = await IntentRegistry.deploy(
    CONTRACTS.escrow, 
    '0x14699d436E3c5d870A7C6aC3825C500C8f86d270',
    '0xA1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0'
  );
  await registryImpl.waitForDeployment();
  const implAddress = await registryImpl.getAddress();
  console.log('Implementation deployed to:', implAddress);

  const IntentProxyAdmin = await ethers.getContractFactory('IntentProxyAdmin');
  const proxyAdmin = await IntentProxyAdmin.deploy(deployer.address);
  await proxyAdmin.waitForDeployment();
  const adminAddress = await proxyAdmin.getAddress();
  console.log('ProxyAdmin deployed to:', adminAddress);

  const TransparentUpgradeableProxy = await ethers.getContractFactory('TransparentUpgradeableProxy');
  const proxy = await TransparentUpgradeableProxy.deploy(
    implAddress,
    adminAddress,
    '0x'
  );
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log('Proxy deployed to:', proxyAddress);

  const addresses = {
    ...CONTRACTS,
    dutchAuctionRFQ: dutchAddress,
    crossChainBridgeAdapter: bridgeAddress,
    upgradeableRegistryImpl: implAddress,
    upgradeableRegistryProxy: proxyAddress,
    proxyAdmin: adminAddress,
  };

  const fs = require('fs');
  fs.writeFileSync(
    'deployed-new-features.json',
    JSON.stringify(addresses, null, 2)
  );
  console.log('\nAll addresses saved to deployed-new-features.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
