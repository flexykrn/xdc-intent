import { ethers } from 'hardhat';

const MOCK_USDC = '0x86530A99784D188e8343e119140114d9e5fD0546';
const MOCK_XDC = '0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312';

const SOLVERS = [
  '0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe',
  '0xd83A98ad44896E841C16Be58b663f70a827c93Ff',
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Funding solvers from:', deployer.address);

  const usdc = await ethers.getContractAt('MockERC20', MOCK_USDC);
  const wxdc = await ethers.getContractAt('MockERC20', MOCK_XDC);

  for (const solver of SOLVERS) {
    console.log(`Funding ${solver}...`);
    let tx = await usdc.transfer(solver, ethers.parseUnits('5000', 6));
    await tx.wait();
    tx = await wxdc.transfer(solver, ethers.parseEther('100000'));
    await tx.wait();

    const usdcBal = await usdc.balanceOf(solver);
    const xdcBal = await wxdc.balanceOf(solver);
    console.log(`  USDC: ${usdcBal.toString()}, XDC: ${xdcBal.toString()}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
