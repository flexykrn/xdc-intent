import { ethers } from "hardhat";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("========================================");
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}`);
  console.log("========================================");

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const TokenFactory = MockERC20.attach(ethers.ZeroAddress);

  // Deploy mock tokens on testnets only
  const network = await ethers.provider.getNetwork();
  const isLocal = Number(network.chainId) === 31337;
  const isApothem = Number(network.chainId) === 51;

  let mockUSDCAddress = process.env.MOCK_USDC_ADDRESS;
  let mockXDCAddress = process.env.MOCK_XDC_ADDRESS;

  if ((isLocal || isApothem) && !mockUSDCAddress) {
    console.log("Deploying MockUSDC...");
    const mockUSDC = await MockERC20.deploy("Mock USDC", "MUSDC", ethers.parseEther("1000000"));
    await mockUSDC.waitForDeployment();
    mockUSDCAddress = await mockUSDC.getAddress();
    console.log(`MockUSDC deployed to: ${mockUSDCAddress}`);
  }

  if ((isLocal || isApothem) && !mockXDCAddress) {
    console.log("Deploying MockXDC...");
    const mockXDC = await MockERC20.deploy("Mock XDC", "MXDC", ethers.parseEther("1000000"));
    await mockXDC.waitForDeployment();
    mockXDCAddress = await mockXDC.getAddress();
    console.log(`MockXDC deployed to: ${mockXDCAddress}`);
  }

  // Deploy Escrow
  console.log("Deploying Escrow...");
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`Escrow deployed to: ${escrowAddress}`);

  // Deploy PaymentVerifier
  console.log("Deploying PaymentVerifier...");
  const PaymentVerifier = await ethers.getContractFactory("PaymentVerifier");
  // PaymentVerifier will be constructed with the IntentRegistry as initial facilitator.
  // We use a temporary zero address here because the registry isn't deployed yet,
  // then update after registry deployment.
  const paymentVerifier = await PaymentVerifier.deploy(ethers.ZeroAddress);
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

  // Register the registry as the initial facilitator.
  await (await paymentVerifier.registerFacilitator(intentRegistryAddress)).wait();
  console.log(`Registered IntentRegistry as facilitator: ${intentRegistryAddress}`);

  // Wire contracts
  console.log("Wiring contracts...");
  await (await escrow.setRegistry(intentRegistryAddress)).wait();

  if (mockUSDCAddress) {
    await (await escrow.addAllowedToken(mockUSDCAddress)).wait();
    console.log(`Added MockUSDC to allowlist: ${mockUSDCAddress}`);
  }

  if (mockXDCAddress && mockXDCAddress !== mockUSDCAddress) {
    await (await escrow.addAllowedToken(mockXDCAddress)).wait();
    console.log(`Added MockXDC to allowlist: ${mockXDCAddress}`);
  }

  // Register deployer as a fallback facilitator for manual testing.
  // In production the facilitator service address should be registered instead.
  const facilitatorAddress = process.env.X402_FACILITATOR_ADDRESS || deployer.address;
  await (await paymentVerifier.registerFacilitator(facilitatorAddress)).wait();
  console.log(`Registered facilitator: ${facilitatorAddress}`);

  console.log("========================================");
  console.log("Deployment complete!");
  console.log("========================================");

  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      Escrow: escrowAddress,
      PaymentVerifier: paymentVerifierAddress,
      IntentRegistry: intentRegistryAddress,
    },
    tokens: {
      MockUSDC: mockUSDCAddress,
      MockXDC: mockXDCAddress,
    },
    facilitator: facilitatorAddress,
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
