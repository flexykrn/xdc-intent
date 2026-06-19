import { run, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("Skipping verification on local network");
    return;
  }

  const deploymentPath = join(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  
  console.log("========================================");
  console.log(`Verifying contracts on ${network.name}`);
  console.log("========================================");

  // Verify Escrow
  try {
    await run("verify:verify", {
      address: deployment.contracts.Escrow,
      constructorArguments: [deployment.treasury, 100, deployment.deployer],
    });
    console.log("✅ Escrow verified");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ Escrow already verified");
    } else {
      console.error("❌ Escrow verification failed:", e.message);
    }
  }

  // Verify PaymentVerifier
  try {
    await run("verify:verify", {
      address: deployment.contracts.PaymentVerifier,
      constructorArguments: [],
    });
    console.log("✅ PaymentVerifier verified");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ PaymentVerifier already verified");
    } else {
      console.error("❌ PaymentVerifier verification failed:", e.message);
    }
  }

  // Verify IntentRegistry
  try {
    await run("verify:verify", {
      address: deployment.contracts.IntentRegistry,
      constructorArguments: [deployment.contracts.Escrow, deployment.contracts.PaymentVerifier],
    });
    console.log("✅ IntentRegistry verified");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ IntentRegistry already verified");
    } else {
      console.error("❌ IntentRegistry verification failed:", e.message);
    }
  }

  console.log("========================================");
  console.log("Verification complete!");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
