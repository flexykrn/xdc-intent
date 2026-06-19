import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer, treasury } = await getNamedAccounts();

  log("========================================");
  log(`Deploying to ${network.name} (chainId: ${network.config.chainId})`);
  log(`Deployer: ${deployer}`);
  log(`Treasury: ${treasury}`);
  log("========================================");

  // Deploy Escrow
  const escrow = await deploy("Escrow", {
    from: deployer,
    args: [treasury, 100, deployer], // 1% protocol fee, deployer as emergency recipient
    log: true,
    waitConfirmations: network.name === "xdc" || network.name === "apothem" ? 5 : 1,
  });

  log(`Escrow deployed at: ${escrow.address}`);

  // Deploy PaymentVerifier
  const paymentVerifier = await deploy("PaymentVerifier", {
    from: deployer,
    log: true,
    waitConfirmations: network.name === "xdc" || network.name === "apothem" ? 5 : 1,
  });

  log(`PaymentVerifier deployed at: ${paymentVerifier.address}`);

  // Deploy IntentRegistry
  const intentRegistry = await deploy("IntentRegistry", {
    from: deployer,
    args: [escrow.address, paymentVerifier.address],
    log: true,
    waitConfirmations: network.name === "xdc" || network.name === "apothem" ? 5 : 1,
  });

  log(`IntentRegistry deployed at: ${intentRegistry.address}`);

  // Set registry in escrow
  const escrowContract = await hre.ethers.getContractAt("Escrow", escrow.address);
  const setRegistryTx = await escrowContract.setRegistry(intentRegistry.address);
  await setRegistryTx.wait();
  log(`Set IntentRegistry as registry in Escrow`);

  // Add authorized signer to PaymentVerifier
  const paymentVerifierContract = await hre.ethers.getContractAt("PaymentVerifier", paymentVerifier.address);
  const addSignerTx = await paymentVerifierContract.addSigner(deployer);
  await addSignerTx.wait();
  log(`Added deployer as authorized signer in PaymentVerifier`);

  log("========================================");
  log("Deployment complete!");
  log("========================================");

  // Save deployment info to JSON
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    deployer,
    treasury,
    contracts: {
      Escrow: escrow.address,
      PaymentVerifier: paymentVerifier.address,
      IntentRegistry: intentRegistry.address,
    },
    timestamp: new Date().toISOString(),
  };

  const fs = require("fs");
  const path = require("path");
  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  const filePath = path.join(deployDir, `${network.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  log(`Deployment info saved to: ${filePath}`);
};

export default deployContracts;
deployContracts.tags = ["all"];