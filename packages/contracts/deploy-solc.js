
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

require('dotenv').config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = 'https://apothem.xdcrpc.com';

if (!PRIVATE_KEY) {
  console.error('DEPLOYER_PRIVATE_KEY not found');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL, { name: 'apothem', chainId: 51 }, { staticNetwork: true });
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log('Deployer:', wallet.address);

const CONTRACTS = {
  intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
  escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
  solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
};

function findImports(importPath) {
  // Check node_modules for OpenZeppelin
  if (importPath.startsWith('@openzeppelin/')) {
    const ozPath = path.join(__dirname, 'node_modules', importPath);
    if (fs.existsSync(ozPath)) {
      return { contents: fs.readFileSync(ozPath, 'utf8') };
    }
  }
  
  // Check local contracts
  const localPath = path.join(__dirname, 'contracts', importPath);
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, 'utf8') };
  }
  
  // Check relative imports
  const relativePath = path.join(__dirname, 'contracts', importPath);
  if (fs.existsSync(relativePath)) {
    return { contents: fs.readFileSync(relativePath, 'utf8') };
  }
  
  return { error: 'File not found: ' + importPath };
}

function compileContract(name) {
  const sourcePath = path.join(__dirname, 'contracts', name + '.sol');
  const source = fs.readFileSync(sourcePath, 'utf8');
  
  const input = {
    language: 'Solidity',
    sources: {
      [name + '.sol']: { content: source }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      },
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris'
    }
  };
  
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:', errors);
      return null;
    }
  }
  
  const contract = output.contracts[name + '.sol'][name];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object
  };
}

async function deploy() {
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'XDC');
  
  const addresses = {
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
  };
  
  // 1. Deploy SolverIncentiveManager
  console.log('\n1. Deploying SolverIncentiveManager...');
  const incentiveArtifact = compileContract('SolverIncentiveManager');
  if (incentiveArtifact) {
    const factory = new ethers.ContractFactory(incentiveArtifact.abi, '0x' + incentiveArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.solverRegistry);
    await contract.waitForDeployment();
    addresses.solverIncentiveManager = await contract.getAddress();
    console.log('Deployed to:', addresses.solverIncentiveManager);
  }
  
  // 2. Deploy PartialFulfillmentModule
  console.log('\n2. Deploying PartialFulfillmentModule...');
  const partialArtifact = compileContract('PartialFulfillmentModule');
  if (partialArtifact) {
    const factory = new ethers.ContractFactory(partialArtifact.abi, '0x' + partialArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.intentRegistry, CONTRACTS.escrow);
    await contract.waitForDeployment();
    addresses.partialFulfillmentModule = await contract.getAddress();
    console.log('Deployed to:', addresses.partialFulfillmentModule);
  }
  
  // 3. Deploy DutchAuctionRFQ
  console.log('\n3. Deploying DutchAuctionRFQ...');
  const dutchArtifact = compileContract('DutchAuctionRFQ');
  if (dutchArtifact) {
    const factory = new ethers.ContractFactory(dutchArtifact.abi, '0x' + dutchArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.intentRegistry);
    await contract.waitForDeployment();
    addresses.dutchAuctionRFQ = await contract.getAddress();
    console.log('Deployed to:', addresses.dutchAuctionRFQ);
  }
  
  // 4. Deploy CrossChainBridgeAdapter
  console.log('\n4. Deploying CrossChainBridgeAdapter...');
  const bridgeArtifact = compileContract('CrossChainBridgeAdapter');
  if (bridgeArtifact) {
    const factory = new ethers.ContractFactory(bridgeArtifact.abi, '0x' + bridgeArtifact.bytecode, wallet);
    const contract = await factory.deploy(CONTRACTS.intentRegistry, CONTRACTS.escrow);
    await contract.waitForDeployment();
    addresses.crossChainBridgeAdapter = await contract.getAddress();
    console.log('Deployed to:', addresses.crossChainBridgeAdapter);
  }
  
  fs.writeFileSync('deployed-new-features.json', JSON.stringify(addresses, null, 2));
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log('Addresses saved to deployed-new-features.json');
  return addresses;
}

deploy().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
