import { ethers } from "hardhat";

async function main() {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const deployer = new ethers.Wallet('0x851f2396c6ff431410782c211db3a996a332f0decad132f21d5f60bb077f35e9', provider);

  for (const addr of ['0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe', '0xd83A98ad44896E841C16Be58b663f70a827c93Ff']) {
    const tx = await deployer.sendTransaction({ to: addr, value: ethers.parseEther('10') });
    await tx.wait();
    console.log('Funded', addr);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
