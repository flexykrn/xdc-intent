import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

const MOCK_USDC = process.env.MOCK_USDC || '';
const MOCK_XDC = process.env.MOCK_XDC || '';
const DEPLOYMENT_FILE = process.env.DEPLOYMENT_FILE || path.join(__dirname, '..', 'deployments', 'sepolia.json');

const ERC20_ABI = [
  'function transfer(address to, uint value) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint)',
  'function decimals() external view returns (uint8)',
  'function approve(address spender, uint256 amount) external returns (bool)',
];

const PAIR_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
  'function sync() external',
];

async function main() {
  if (!MOCK_USDC || !MOCK_XDC) {
    throw new Error('MOCK_USDC and MOCK_XDC env vars are required');
  }

  const [deployer] = await ethers.getSigners();
  console.log('Deploying SimpleDEX on Sepolia with account:', deployer.address);

  const usdc = await ethers.getContractAt(ERC20_ABI, MOCK_USDC);
  const wxdc = await ethers.getContractAt(ERC20_ABI, MOCK_XDC);

  const usdcDecimals = await usdc.decimals();
  const xdcDecimals = await wxdc.decimals();
  console.log(`Token decimals — MockUSDC: ${usdcDecimals}, MockXDC: ${xdcDecimals}`);

  const USDC_LIQUIDITY = ethers.parseUnits('10000', usdcDecimals);
  const XDC_LIQUIDITY = ethers.parseUnits('200000', xdcDecimals);

  const SimpleDEXFactory = await ethers.getContractFactory('SimpleDEXFactory');
  const factory = await SimpleDEXFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log('Factory deployed to:', factoryAddress);

  const SimpleDEXRouter = await ethers.getContractFactory('SimpleDEXRouter');
  const router = await SimpleDEXRouter.deploy(factoryAddress, ethers.ZeroAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log('Router deployed to:', routerAddress);

  const tokenA = MOCK_USDC.toLowerCase() < MOCK_XDC.toLowerCase() ? MOCK_USDC : MOCK_XDC;
  const tokenB = MOCK_USDC.toLowerCase() < MOCK_XDC.toLowerCase() ? MOCK_XDC : MOCK_USDC;

  console.log('Creating pair...');
  let tx = await factory.createPair(tokenA, tokenB);
  await tx.wait();
  const pairAddress = await factory.getPair(tokenA, tokenB);
  console.log('Pair created at:', pairAddress);

  const pair = await ethers.getContractAt(PAIR_ABI, pairAddress);

  console.log('Seeding liquidity...');
  const amountA = tokenA === MOCK_USDC ? USDC_LIQUIDITY : XDC_LIQUIDITY;
  const amountB = tokenB === MOCK_USDC ? USDC_LIQUIDITY : XDC_LIQUIDITY;

  const tokenAContract = tokenA === MOCK_USDC ? usdc : wxdc;
  const tokenBContract = tokenB === MOCK_USDC ? usdc : wxdc;

  tx = await tokenAContract.transfer(pairAddress, amountA);
  await tx.wait();
  tx = await tokenBContract.transfer(pairAddress, amountB);
  await tx.wait();

  tx = await pair.sync();
  await tx.wait();

  const reserves = await pair.getReserves();
  console.log('Pair reserves:', {
    reserve0: reserves[0].toString(),
    reserve1: reserves[1].toString(),
  });

  const quoted = await router.getAmountsOut(ethers.parseUnits('10', usdcDecimals), [MOCK_USDC, MOCK_XDC]);
  console.log('Quote for 10 USDC -> XDC:', quoted[1].toString());

  const deployment = {
    network: 'sepolia',
    chainId: 11155111,
    deployer: deployer.address,
    tokens: {
      MockUSDC: MOCK_USDC,
      MockXDC: MOCK_XDC,
    },
    dex: {
      factory: factoryAddress,
      router: routerAddress,
      pair: pairAddress,
    },
    timestamp: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
  console.log('Deployment file written to:', DEPLOYMENT_FILE);

  console.log('\n=== Deployment Summary ===');
  console.log('Factory:', factoryAddress);
  console.log('Router:', routerAddress);
  console.log('Pair:', pairAddress);
  console.log('MockUSDC:', MOCK_USDC);
  console.log('MockXDC:', MOCK_XDC);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
