import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    console.error('No deployer found. Make sure DEPLOYER_PRIVATE_KEY is set in .env');
    process.exit(1);
  }
  console.log('Deploying DEX with account:', deployer.address);

  // Deploy test tokens
  console.log('Deploying test tokens...');
  const TestToken = await ethers.getContractFactory('TestToken');
  
  const tokenA = await TestToken.deploy('Test USD', 'TUSD', ethers.parseEther('1000000'));
  await tokenA.waitForDeployment();
  console.log('TokenA (TUSD) deployed to:', await tokenA.getAddress());

  const tokenB = await TestToken.deploy('Test BTC', 'TBTC', ethers.parseEther('1000000'));
  await tokenB.waitForDeployment();
  console.log('TokenB (TBTC) deployed to:', await tokenB.getAddress());

  // Deploy factory
  console.log('Deploying factory...');
  const SimpleDEXFactory = await ethers.getContractFactory('SimpleDEXFactory');
  const factory = await SimpleDEXFactory.deploy();
  await factory.waitForDeployment();
  console.log('Factory deployed to:', await factory.getAddress());

  // Deploy router (using zero address for WETH since XDC doesn't need wrapping)
  console.log('Deploying router...');
  const SimpleDEXRouter = await ethers.getContractFactory('SimpleDEXRouter');
  const router = await SimpleDEXRouter.deploy(await factory.getAddress(), ethers.ZeroAddress);
  await router.waitForDeployment();
  console.log('Router deployed to:', await router.getAddress());

  // Create pair
  console.log('Creating pair...');
  const tx = await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
  await tx.wait();
  
  const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
  console.log('Pair created at:', pairAddress);

  console.log('\n=== Deployment Summary ===');
  console.log('Token A (TUSD):', await tokenA.getAddress());
  console.log('Token B (TBTC):', await tokenB.getAddress());
  console.log('Factory:', await factory.getAddress());
  console.log('Router:', await router.getAddress());
  console.log('Pair:', pairAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
