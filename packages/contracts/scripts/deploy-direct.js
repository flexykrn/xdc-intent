
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load .env
require('dotenv').config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = process.env.XDC_TESTNET_RPC || 'https://erpc.apothem.network';

if (!PRIVATE_KEY) {
  console.error('DEPLOYER_PRIVATE_KEY not found in .env');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log('Deployer address:', wallet.address);

const CONTRACTS = {
  intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
  escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
  solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
};

async function deploy() {
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'XDC');
  
  if (balance < ethers.parseEther('0.1')) {
    console.error('Insufficient balance for deployment');
    process.exit(1);
  }
  
  // Load contract bytecode and ABI
  const artifactsDir = path.join(__dirname, '../artifacts/contracts');
  
  // Helper to load artifact
  function loadArtifact(name) {
    const artifactPath = path.join(artifactsDir, name + '.sol', name + '.json');
    if (!fs.existsSync(artifactPath)) {
      console.error('Artifact not found:', artifactPath);
      return null;
    }
    return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  }
  
  const addresses = {
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
  };
  
  // 1. Deploy SolverIncentiveManager
  console.log('\n1. Deploying SolverIncentiveManager...');
  const incentiveArtifact = loadArtifact('SolverIncentiveManager');
  if (incentiveArtifact) {
    const factory = new ethers.ContractFactory(incentiveArtifact.abi, incentiveArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.solverRegistry);
    await contract.waitForDeployment();
    addresses.solverIncentiveManager = await contract.getAddress();
    console.log('SolverIncentiveManager:', addresses.solverIncentiveManager);
  }
  
  // 2. Deploy PartialFulfillmentModule
  console.log('\n2. Deploying PartialFulfillmentModule...');
  const partialArtifact = loadArtifact('PartialFulfillmentModule');
  if (partialArtifact) {
    const factory = new ethers.ContractFactory(partialArtifact.abi, partialArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.intentRegistry, CONTRACTS.escrow);
    await contract.waitForDeployment();
    addresses.partialFulfillmentModule = await contract.getAddress();
    console.log('PartialFulfillmentModule:', addresses.partialFulfillmentModule);
  }
  
  // 3. Deploy DutchAuctionRFQ
  console.log('\n3. Deploying DutchAuctionRFQ...');
  const dutchArtifact = loadArtifact('DutchAuctionRFQ');
  if (dutchArtifact) {
    const factory = new ethers.ContractFactory(dutchArtifact.abi, dutchArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.intentRegistry);
    await contract.waitForDeployment();
    addresses.dutchAuctionRFQ = await contract.getAddress();
    console.log('DutchAuctionRFQ:', addresses.dutchAuctionRFQ);
  }
  
  // 4. Deploy CrossChainBridgeAdapter
  console.log('\n4. Deploying CrossChainBridgeAdapter...');
  const bridgeArtifact = loadArtifact('CrossChainBridgeAdapter');
  if (bridgeArtifact) {
    const factory = new ethers.ContractFactory(bridgeArtifact.abi, bridgeArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.intentRegistry, CONTRACTS.escrow);
    await contract.waitForDeployment();
    addresses.crossChainBridgeAdapter = await contract.getAddress();
    console.log('CrossChainBridgeAdapter:', addresses.crossChainBridgeAdapter);
  }
  
  // Save addresses
  fs.writeFileSync('deployed-new-features.json', JSON.stringify(addresses, null, 2));
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log('Addresses saved to deployed-new-features.json');
}

deploy().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
