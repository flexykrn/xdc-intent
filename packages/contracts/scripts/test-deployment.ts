import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const deploymentPath = join(__dirname, "..", "deployments", "apothem.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  console.log("Testing with account:", deployer.address);

  // Connect to deployed contracts
  const intentRegistry = await ethers.getContractAt("IntentRegistry", deployment.contracts.IntentRegistry);
  const escrow = await ethers.getContractAt("Escrow", deployment.contracts.Escrow);

  // Create a test intent
  const intentId = ethers.keccak256(ethers.toUtf8Bytes("test-intent-" + Date.now()));
  const token = deployment.contracts.Escrow; // Using escrow address as token for test (will fail but shows the flow)
  const amount = ethers.parseEther("1");
  const expiry = Math.floor(Date.now() / 1000) + 3600;

  console.log("Creating test intent...");
  console.log("Intent ID:", intentId);
  
  try {
    const tx = await intentRegistry.createIntent(intentId, token, amount, expiry);
    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Intent created! Block:", receipt?.blockNumber);
    
    // Check intent status
    const intent = await intentRegistry.getIntent(intentId);
    console.log("Intent status:", intent.status);
    console.log("Intent user:", intent.user);
    console.log("Intent amount:", intent.amount.toString());
  } catch (e: any) {
    console.error("Error:", e.message);
    if (e.message.includes("not supported")) {
      console.log("Expected error: Token not in allowlist. This is correct behavior.");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
