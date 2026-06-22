import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Adding liquidity with account:', deployer.address);

  const CONTRACTS = {
    tokenA: '0x85D09e7A4332B4bF969661461C8C251D13d63043',
    tokenB: '0xc36296e2b0ff183FA90FFD95DeC9b919a81527a3',
    factory: '0xa18a69a9a7Bbe60A842175F6c88c79f1679d4706',
    router: '0x118c80107B5819D0c6f8e7c8CB19D397dB323E93',
    pair: '0x69a11E9E8528AE9bECeDa1366Ed77206ADEe02bE',
  };

  // Get contracts
  const tokenA = await ethers.getContractAt('TestToken', CONTRACTS.tokenA);
  const tokenB = await ethers.getContractAt('TestToken', CONTRACTS.tokenB);

  // Approve tokens for pair
  console.log('Approving tokens...');
  const amountA = ethers.parseEther('100000');
  const amountB = ethers.parseEther('100000');
  
  await (await tokenA.approve(CONTRACTS.pair, amountA)).wait();
  await (await tokenB.approve(CONTRACTS.pair, amountB)).wait();
  console.log('Tokens approved');

  // Transfer tokens to pair
  console.log('Transferring tokens to pair...');
  await (await tokenA.transfer(CONTRACTS.pair, amountA)).wait();
  await (await tokenB.transfer(CONTRACTS.pair, amountB)).wait();
  console.log('Tokens transferred');

  // Sync pair to update reserves
  const pairAbi = ['function sync() external'];
  const pair = new ethers.Contract(CONTRACTS.pair, pairAbi, deployer);
  console.log('Syncing pair...');
  await (await pair.sync()).wait();
  console.log('Pair synced');

  // Check reserves
  const reservesAbi = ['function getReserves() external view returns (uint112, uint112, uint32)'];
  const pairWithReserves = new ethers.Contract(CONTRACTS.pair, reservesAbi, deployer);
  const reserves = await pairWithReserves.getReserves();
  console.log('Reserves:', {
    reserve0: ethers.formatEther(reserves[0]),
    reserve1: ethers.formatEther(reserves[1]),
  });

  console.log('\n=== Liquidity Added Successfully ===');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
