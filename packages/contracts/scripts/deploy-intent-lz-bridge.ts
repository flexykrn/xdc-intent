import { ethers } from "hardhat";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const isLocal = chainId === 31337;

  console.log("========================================");
  console.log(`Deploying IntentLZBridge with account: ${deployer.address}`);
  console.log(`Network: ${network.name} (${chainId})`);
  console.log("========================================");

  let lzEndpoint = process.env.LZ_ENDPOINT;

  if (!lzEndpoint) {
    if (isLocal) {
      console.log("LZ_ENDPOINT not set; deploying MockLayerZeroEndpoint for local testing...");
      const MockEndpoint = await ethers.getContractFactory("MockLayerZeroEndpoint");
      const localEid = parseInt(process.env.LZ_LOCAL_EID || "101");
      const mockEndpoint = await MockEndpoint.deploy(localEid, ethers.parseEther("0.001"));
      await mockEndpoint.waitForDeployment();
      lzEndpoint = await mockEndpoint.getAddress();
      console.log(`MockLayerZeroEndpoint deployed to: ${lzEndpoint} (eid ${localEid})`);
    } else {
      throw new Error(`LZ_ENDPOINT is required for network ${network.name} (${chainId})`);
    }
  }

  const BridgeFactory = await ethers.getContractFactory("IntentLZBridge");
  const bridge = await BridgeFactory.deploy(lzEndpoint, deployer.address);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log(`IntentLZBridge deployed to: ${bridgeAddress}`);

  const deploymentInfo: Record<string, any> = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    contracts: {
      IntentLZBridge: bridgeAddress,
      LayerZeroEndpoint: lzEndpoint,
    },
    timestamp: new Date().toISOString(),
  };

  const deployDir = join(__dirname, "..", "deployments");
  if (!existsSync(deployDir)) {
    mkdirSync(deployDir, { recursive: true });
  }

  const filePath = join(deployDir, `${deploymentInfo.network}-lz.json`);
  let existing: Record<string, any> = {};
  if (existsSync(filePath)) {
    existing = JSON.parse(readFileSync(filePath, "utf-8"));
  }
  const merged = { ...existing, ...deploymentInfo };
  writeFileSync(filePath, JSON.stringify(merged, null, 2));
  console.log(`Deployment info saved to: ${filePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
