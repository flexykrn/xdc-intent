import { ethers } from "hardhat";

async function main() {
  const block = await ethers.provider.getBlock("latest");
  console.log("Current block timestamp:", block?.timestamp);
  console.log("Current time:", Math.floor(Date.now() / 1000));
  console.log("Difference:", Math.floor(Date.now() / 1000) - Number(block?.timestamp));
}

main().then(() => process.exit(0));
