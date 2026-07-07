import { ethers } from "hardhat";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== 51) {
    throw new Error("This script is only for Apothem testnet");
  }

  const deploymentPath = join(__dirname, "..", "deployments", "apothem.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

  const escrowAddress = deployment.contracts.Escrow;
  const paymentVerifierAddress = deployment.contracts.PaymentVerifier;
  const solverRegistryAddress = deployment.contracts.SolverRegistry;
  const oldIntentRegistryAddress = deployment.contracts.IntentRegistry;

  console.log("Redeploying IntentRegistry with existing contracts:");
  console.log("  Escrow:", escrowAddress);
  console.log("  PaymentVerifier:", paymentVerifierAddress);
  console.log("  SolverRegistry:", solverRegistryAddress);
  console.log("  Old IntentRegistry:", oldIntentRegistryAddress);

  const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
  const intentRegistry = await IntentRegistry.deploy(escrowAddress, paymentVerifierAddress, solverRegistryAddress);
  await intentRegistry.waitForDeployment();
  const intentRegistryAddress = await intentRegistry.getAddress();
  console.log("New IntentRegistry deployed to:", intentRegistryAddress);

  const escrow = await ethers.getContractAt("Escrow", escrowAddress, deployer);
  const paymentVerifier = await ethers.getContractAt("PaymentVerifier", paymentVerifierAddress, deployer);

  console.log("Setting new registry in Escrow...");
  await (await escrow.setRegistry(intentRegistryAddress)).wait();

  console.log("Registering new IntentRegistry as facilitator...");
  await (await paymentVerifier.registerFacilitator(intentRegistryAddress)).wait();

  console.log("Revoking old IntentRegistry facilitator...");
  await (await paymentVerifier.revokeFacilitator(oldIntentRegistryAddress)).wait();

  deployment.contracts.IntentRegistry = intentRegistryAddress;
  deployment.timestamp = new Date().toISOString();
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("Updated deployments/apothem.json");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
