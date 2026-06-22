import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying competitive features with account:', deployer.address);

  const CONTRACTS = {
    intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
    escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
    solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
  };

  // Deploy GaslessIntentExecutor
  console.log('\n1. Deploying GaslessIntentExecutor...');
  const GaslessIntentExecutor = await ethers.getContractFactory('GaslessIntentExecutor');
  const gaslessExecutor = await GaslessIntentExecutor.deploy(
    CONTRACTS.intentRegistry,
    CONTRACTS.escrow
  );
  await gaslessExecutor.waitForDeployment();
  const gaslessAddress = await gaslessExecutor.getAddress();
  console.log('GaslessIntentExecutor deployed to:', gaslessAddress);

  // Deploy SmartAccountFactory
  console.log('\n2. Deploying SmartAccount implementation...');
  const SmartAccount = await ethers.getContractFactory('SmartAccount');
  const smartAccountImpl = await SmartAccount.deploy();
  await smartAccountImpl.waitForDeployment();
  const smartAccountImplAddress = await smartAccountImpl.getAddress();
  console.log('SmartAccount implementation deployed to:', smartAccountImplAddress);

  console.log('\n3. Deploying SmartAccountFactory...');
  const SmartAccountFactory = await ethers.getContractFactory('SmartAccountFactory');
  const smartAccountFactory = await SmartAccountFactory.deploy(smartAccountImplAddress);
  await smartAccountFactory.waitForDeployment();
  const factoryAddress = await smartAccountFactory.getAddress();
  console.log('SmartAccountFactory deployed to:', factoryAddress);

  // Deploy CrossChainIntentBridge
  console.log('\n4. Deploying CrossChainIntentBridge...');
  const CrossChainBridge = await ethers.getContractFactory('CrossChainIntentBridge');
  const crossChainBridge = await CrossChainBridge.deploy(CONTRACTS.intentRegistry);
  await crossChainBridge.waitForDeployment();
  const bridgeAddress = await crossChainBridge.getAddress();
  console.log('CrossChainIntentBridge deployed to:', bridgeAddress);

  // Deploy SolverIncentivePool
  console.log('\n5. Deploying SolverIncentivePool...');
  // Use existing MockERC20 for rewards
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const rewardToken = await MockERC20.deploy(
    'XDC Intent Reward',
    'XIR',
    ethers.parseEther('1000000')
  );
  await rewardToken.waitForDeployment();
  const rewardTokenAddress = await rewardToken.getAddress();
  console.log('Reward token deployed to:', rewardTokenAddress);

  const SolverIncentivePool = await ethers.getContractFactory('SolverIncentivePool');
  const incentivePool = await SolverIncentivePool.deploy(
    CONTRACTS.solverRegistry,
    rewardTokenAddress
  );
  await incentivePool.waitForDeployment();
  const poolAddress = await incentivePool.getAddress();
  console.log('SolverIncentivePool deployed to:', poolAddress);

  // Deploy RelayerNetwork
  console.log('\n6. Deploying RelayerNetwork...');
  const RelayerNetwork = await ethers.getContractFactory('RelayerNetwork');
  const relayerNetwork = await RelayerNetwork.deploy(gaslessAddress);
  await relayerNetwork.waitForDeployment();
  const relayerAddress = await relayerNetwork.getAddress();
  console.log('RelayerNetwork deployed to:', relayerAddress);

  // Summary
  console.log('\n=== COMPETITIVE FEATURES DEPLOYED ===');
  console.log('GaslessIntentExecutor:', gaslessAddress);
  console.log('SmartAccountFactory:', factoryAddress);
  console.log('CrossChainIntentBridge:', bridgeAddress);
  console.log('SolverIncentivePool:', poolAddress);
  console.log('RelayerNetwork:', relayerAddress);
  console.log('RewardToken:', rewardTokenAddress);

  // Save addresses
  const addresses = {
    gaslessIntentExecutor: gaslessAddress,
    smartAccountFactory: factoryAddress,
    crossChainIntentBridge: bridgeAddress,
    solverIncentivePool: poolAddress,
    relayerNetwork: relayerAddress,
    rewardToken: rewardTokenAddress,
  };

  const fs = require('fs');
  fs.writeFileSync(
    'deployed-competitive-features.json',
    JSON.stringify(addresses, null, 2)
  );
  console.log('\nAddresses saved to deployed-competitive-features.json');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
