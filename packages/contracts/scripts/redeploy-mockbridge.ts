import { ethers } from "hardhat";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`Redeploying MockBridge on ${network.name} (${chainId}) from ${deployer.address}`);

  const MockBridge = await ethers.getContractFactory("MockBridge");
  const mockBridge = await MockBridge.deploy();
  await mockBridge.waitForDeployment();
  const mockBridgeAddress = await mockBridge.getAddress();
  console.log(`MockBridge deployed to: ${mockBridgeAddress}`);

  const deploymentPath = join(__dirname, "..", "deployments", `${network.name}.json`);
  let deployment: any = {};
  try {
    deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));
  } catch {
    // no existing deployment
  }

  deployment.network = network.name;
  deployment.chainId = chainId;
  deployment.contracts = deployment.contracts || {};
  deployment.contracts.MockBridge = mockBridgeAddress;
  deployment.timestamp = new Date().toISOString();

  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`Updated ${deploymentPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
