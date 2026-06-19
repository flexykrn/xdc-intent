import { ethers } from "hardhat";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  
  console.log("========================================");
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}`);
  console.log("========================================");

  // Deploy Escrow
  console.log("Deploying Escrow...");
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(treasury, 100, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`Escrow deployed to: ${escrowAddress}`);

  // Deploy PaymentVerifier
  console.log("Deploying PaymentVerifier...");
  const PaymentVerifier = await ethers.getContractFactory("PaymentVerifier");
  const paymentVerifier = await PaymentVerifier.deploy();
  await paymentVerifier.waitForDeployment();
  const paymentVerifierAddress = await paymentVerifier.getAddress();
  console.log(`PaymentVerifier deployed to: ${paymentVerifierAddress}`);

  // Deploy IntentRegistry
  console.log("Deploying IntentRegistry...");
  const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
  const intentRegistry = await IntentRegistry.deploy(escrowAddress, paymentVerifierAddress);
  await intentRegistry.waitForDeployment();
  const intentRegistryAddress = await intentRegistry.getAddress();
  console.log(`IntentRegistry deployed to: ${intentRegistryAddress}`);

  // Wire contracts
  console.log("Wiring contracts...");
  
  // Set registry in escrow
  const setRegistryTx = await escrow.setRegistry(intentRegistryAddress);
  await setRegistryTx.wait();
  console.log("Set IntentRegistry as registry in Escrow");

  // Add deployer as authorized signer
  const addSignerTx = await paymentVerifier.addSigner(deployer.address);
  await addSignerTx.wait();
  console.log("Added deployer as authorized signer in PaymentVerifier");

  console.log("========================================");
  console.log("Deployment complete!");
  console.log("========================================");

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    treasury,
    contracts: {
      Escrow: escrowAddress,
      PaymentVerifier: paymentVerifierAddress,
      IntentRegistry: intentRegistryAddress,
    },
    timestamp: new Date().toISOString(),
  };

  const deployDir = join(__dirname, "..", "deployments");
  if (!existsSync(deployDir)) {
    mkdirSync(deployDir, { recursive: true });
  }
  const filePath = join(deployDir, `${deploymentInfo.network}.json`);
  writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to: ${filePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });