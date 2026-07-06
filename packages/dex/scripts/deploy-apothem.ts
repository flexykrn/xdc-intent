import { ethers } from 'hardhat';

const MOCK_USDC = process.env.MOCK_USDC || '0x86530A99784D188e8343e119140114d9e5fD0546';
const MOCK_XDC = process.env.MOCK_XDC || '0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312';
const USDC_LIQUIDITY = ethers.parseUnits('10000', 6);
const XDC_LIQUIDITY = ethers.parseEther('200000');

const ERC20_ABI = [
  'function transfer(address to, uint value) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint)',
  'function decimals() external view returns (uint8)',
];

const PAIR_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)',
  'function sync() external',
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying SimpleDEX with account:', deployer.address);

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

  const usdc = await ethers.getContractAt(ERC20_ABI, MOCK_USDC);
  const wxdc = await ethers.getContractAt(ERC20_ABI, MOCK_XDC);

  const tokenA = MOCK_USDC.toLowerCase() < MOCK_XDC.toLowerCase() ? MOCK_USDC : MOCK_XDC;
  const tokenB = MOCK_USDC.toLowerCase() < MOCK_XDC.toLowerCase() ? MOCK_XDC : MOCK_USDC;

  console.log('Creating pair...');
  let tx = await factory.createPair(tokenA, tokenB);
  await tx.wait();
  const pairAddress = await factory.getPair(tokenA, tokenB);
  console.log('Pair created at:', pairAddress);

  const pair = await ethers.getContractAt(PAIR_ABI, pairAddress);

  console.log('Seeding liquidity...');
  const usdcAmount = MOCK_USDC.toLowerCase() < MOCK_XDC.toLowerCase() ? USDC_LIQUIDITY : XDC_LIQUIDITY;
  const xdcAmount = MOCK_USDC.toLowerCase() < MOCK_XDC.toLowerCase() ? XDC_LIQUIDITY : USDC_LIQUIDITY;

  tx = await usdc.transfer(pairAddress, usdcAmount);
  await tx.wait();
  tx = await wxdc.transfer(pairAddress, xdcAmount);
  await tx.wait();

  tx = await pair.sync();
  await tx.wait();

  const reserves = await pair.getReserves();
  console.log('Pair reserves:', {
    reserve0: reserves[0].toString(),
    reserve1: reserves[1].toString(),
  });

  const quoted = await router.getAmountsOut(ethers.parseUnits('10', 6), [MOCK_USDC, MOCK_XDC]);
  console.log('Quote for 10 USDC -> XDC:', quoted[1].toString());

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
