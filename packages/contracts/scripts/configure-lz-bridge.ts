import { ethers } from "hardhat";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";

dotenv.config();

function loadLzDeployment(networkName: string): { chainId: number; contracts: { IntentLZBridge: string; LayerZeroEndpoint: string } } {
  const filePath = join(__dirname, "..", "deployments", `${networkName}-lz.json`);
  if (!existsSync(filePath)) {
    throw new Error(`LZ deployment file not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const currentNetworkName = network.name;

  const peerNetwork = process.env.PEER_NETWORK;
  if (!peerNetwork) {
    throw new Error("PEER_NETWORK env var is required (e.g. sepolia)");
  }

  const peerEid = process.env.PEER_EID ? parseInt(process.env.PEER_EID, 10) : undefined;
  if (peerEid === undefined) {
    throw new Error("PEER_EID env var is required (LayerZero endpoint id of the peer chain)");
  }

  const currentDeployment = loadLzDeployment(currentNetworkName);
  const peerDeployment = loadLzDeployment(peerNetwork);

  const bridge = await ethers.getContractAt("IntentLZBridge", currentDeployment.contracts.IntentLZBridge, deployer);

  const peerAddressBytes32 = ethers.zeroPadValue(peerDeployment.contracts.IntentLZBridge, 32);

  console.log(`Configuring IntentLZBridge on ${currentNetworkName}`);
  console.log(`  bridge: ${currentDeployment.contracts.IntentLZBridge}`);
  console.log(`  peer (${peerNetwork}): ${peerDeployment.contracts.IntentLZBridge}`);
  console.log(`  peer eid: ${peerEid}`);

  const tx = await bridge.setPeer(peerEid, peerAddressBytes32);
  await tx.wait();
  console.log(`  setPeer tx: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
