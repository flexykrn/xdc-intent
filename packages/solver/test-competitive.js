const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://rpc.apothem.network');

const CONTRACTS = {
  gasless: '0x2C6024bDA3b1dc6662a84210536894eFC702f0b0',
  smartAccount: '0x9c64167F39A14FBd6A25608703F1A3a795A4aFa9',
  bridge: '0x84ebBc1CD02E083A368C3E775a69c50138c65426',
  pool: '0xFA2db0D89d06869fbe29771705a2C4A5428cCdF7',
  relayer: '0x7c6201Afa63A37336d8B8FF7CF57498AB3D4E8dd',
  token: '0x148D54159656D8D8c36240c7cD73ce80e239e137',
};

async function check() {
  console.log('=== TESTING NEW CONTRACTS ===\n');
  
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    const code = await provider.getCode(addr);
    console.log(name + ': ' + (code.length > 2 ? 'OK' : 'FAIL') + ' (' + code.length + ' bytes)');
  }
  
  try {
    const gasless = new ethers.Contract(CONTRACTS.gasless, ['function getDomainSeparator() view returns (bytes32)'], provider);
    const sep = await gasless.getDomainSeparator();
    console.log('\nGasless: OK - Domain separator works');
  } catch(e) {
    console.log('\nGasless: FAIL - ' + e.message.slice(0,50));
  }
  
  try {
    const factory = new ethers.Contract(CONTRACTS.smartAccount, ['function implementation() view returns (address)'], provider);
    const impl = await factory.implementation();
    console.log('SmartAccount: OK - Implementation: ' + impl.slice(0,10));
  } catch(e) {
    console.log('SmartAccount: FAIL - ' + e.message.slice(0,50));
  }
  
  try {
    const bridge = new ethers.Contract(CONTRACTS.bridge, ['function intentRegistry() view returns (address)'], provider);
    const registry = await bridge.intentRegistry();
    console.log('Bridge: OK - Registry: ' + registry.slice(0,10));
  } catch(e) {
    console.log('Bridge: FAIL - ' + e.message.slice(0,50));
  }
  
  try {
    const pool = new ethers.Contract(CONTRACTS.pool, ['function currentEpoch() view returns (uint256)'], provider);
    const epoch = await pool.currentEpoch();
    console.log('Pool: OK - Epoch: ' + epoch.toString());
  } catch(e) {
    console.log('Pool: FAIL - ' + e.message.slice(0,50));
  }
  
  try {
    const relayer = new ethers.Contract(CONTRACTS.relayer, ['function getActiveRelayerCount() view returns (uint256)'], provider);
    const count = await relayer.getActiveRelayerCount();
    console.log('Relayer: OK - Active count: ' + count.toString());
  } catch(e) {
    console.log('Relayer: FAIL - ' + e.message.slice(0,50));
  }
  
  try {
    const token = new ethers.Contract(CONTRACTS.token, ['function name() view returns (string)', 'function symbol() view returns (string)'], provider);
    const name = await token.name();
    const symbol = await token.symbol();
    console.log('Token: OK - ' + name + ' (' + symbol + ')');
  } catch(e) {
    console.log('Token: FAIL - ' + e.message.slice(0,50));
  }
}

check().catch(console.error);
