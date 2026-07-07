import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

const DEPLOYMENT_FILE = process.env.DEPLOYMENT_FILE || path.join(__dirname, '..', 'deployments', 'apothem.json');

const ERC20_ABI = [
  'function approve(address spender, uint value) external returns (bool)',
  'function transfer(address to, uint value) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint)',
  'function decimals() external view returns (uint8)',
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Adding liquidity with account:', deployer.address);

  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`Deployment file not found: ${DEPLOYMENT_FILE}`);
  }

  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
  const { MockUSDC, MockXDC } = deployment.tokens;
  const { pair } = deployment.dex;

  console.log('Using MockUSDC:', MockUSDC);
  console.log('Using MockXDC:', MockXDC);
  console.log('Using pair:', pair);

  const usdc = await ethers.getContractAt(ERC20_ABI, MockUSDC);
  const wxdc = await ethers.getContractAt(ERC20_ABI, MockXDC);

  const usdcDecimals = await usdc.decimals();
  const xdcDecimals = await wxdc.decimals();

  const amountUSDC = ethers.parseUnits('100000', usdcDecimals);
  const amountXDC = ethers.parseUnits('100000', xdcDecimals);

  console.log('Approving tokens...');
  await (await usdc.approve(pair, amountUSDC)).wait();
  await (await wxdc.approve(pair, amountXDC)).wait();
  console.log('Tokens approved');

  console.log('Transferring tokens to pair...');
  await (await usdc.transfer(pair, amountUSDC)).wait();
  await (await wxdc.transfer(pair, amountXDC)).wait();
  console.log('Tokens transferred');

  const pairAbi = [
    'function sync() external',
    'function getReserves() external view returns (uint112, uint112, uint32)',
  ];
  const pairContract = new ethers.Contract(pair, pairAbi, deployer);

  console.log('Syncing pair...');
  await (await pairContract.sync()).wait();
  console.log('Pair synced');

  const reserves = await pairContract.getReserves();
  console.log('Reserves:', {
    reserve0: ethers.formatUnits(reserves[0], usdcDecimals),
    reserve1: ethers.formatUnits(reserves[1], xdcDecimals),
  });

  console.log('\n=== Liquidity Added Successfully ===');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
