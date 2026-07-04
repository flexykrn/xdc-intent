import { ethers } from "hardhat";

async function main() {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const deployer = new ethers.Wallet('0x851f2396c6ff431410782c211db3a996a332f0decad132f21d5f60bb077f35e9', provider);
  const musdc = new ethers.Contract('0x86530A99784D188e8343e119140114d9e5fD0546', ['function mint(address,uint256)','function transfer(address,uint256)'], deployer);
  const mxdc = new ethers.Contract('0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312', ['function mint(address,uint256)','function transfer(address,uint256)'], deployer);
  await (await musdc.transfer('0xd83A98ad44896E841C16Be58b663f70a827c93Ff', ethers.parseEther('100000'))).wait();
  await (await mxdc.transfer('0xd83A98ad44896E841C16Be58b663f70a827c93Ff', ethers.parseEther('100000'))).wait();
  console.log('Funded solver B');
}

main().catch(e => { console.error(e); process.exit(1); });
