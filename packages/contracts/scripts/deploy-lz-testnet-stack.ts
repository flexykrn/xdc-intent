import { ethers } from "hardhat";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYMENT_FILE = join(__dirname, "..", "deployments", "lz-testnet.json");
const DEX_DEPLOYMENT_FILE = join(__dirname, "..", "..", "dex", "deployments", "sepolia.json");

const LZ_ENDPOINT_SEPOLIA = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const LZ_ENDPOINT_ARBITRUM_SEPOLIA = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const LZ_EID_SEPOLIA = 40161;
const LZ_EID_ARBITRUM_SEPOLIA = 40231;

const REQUIRED_ENV = ["DEPLOYER_PRIVATE_KEY", "SEPOLIA_RPC_URL", "ARBITRUM_SEPOLIA_RPC_URL"];

interface DeploymentRecord {
  network: string;
  chainId: number;
  deployer: string;
  contracts: Record<string, string>;
  tokens: Record<string, string>;
  dex?: Record<string, string>;
  facilitator?: string;
  solver?: string;
  lz?: {
    sepoliaEid: number;
    arbitrumSepoliaEid: number;
  };
  arbitrumSepolia?: {
    chainId: number;
    deployer: string;
    contracts: Record<string, string>;
    tokens: Record<string, string>;
  };
  timestamp: string;
}

function loadExisting(): Partial<DeploymentRecord> {
  if (existsSync(DEPLOYMENT_FILE)) {
    return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf-8"));
  }
  return {};
}

function saveDeployment(deployment: DeploymentRecord) {
  const deployDir = join(__dirname, "..", "deployments");
  if (!existsSync(deployDir)) {
    mkdirSync(deployDir, { recursive: true });
  }
  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
  console.log(`Deployment record saved to: ${DEPLOYMENT_FILE}`);
}

async function deployDexOnSepolia(mockUSDC: string, mockXDC: string) {
  const root = resolve(__dirname, "..", "..", "..");
  const dexDir = join(root, "packages", "dex");
  const cmd = [
    "npx hardhat run scripts/deploy-lz-sepolia.ts --network sepolia",
  ].join(" ");
  console.log("Deploying SimpleDEX on Sepolia via packages/dex...");
  execSync(cmd, {
    cwd: dexDir,
    stdio: "inherit",
    env: {
      ...process.env,
      MOCK_USDC: mockUSDC,
      MOCK_XDC: mockXDC,
      DEPLOYMENT_FILE: DEX_DEPLOYMENT_FILE,
    },
  });
  return JSON.parse(readFileSync(DEX_DEPLOYMENT_FILE, "utf-8"));
}

async function deploySepoliaStack(existing: Partial<DeploymentRecord>) {
  const [deployer] = await ethers.getSigners();
  console.log("\n========================================");
  console.log(`Deploying Sepolia stack with: ${deployer.address}`);
  console.log("========================================");

  const MockERC20 = await ethers.getContractFactory("MockERC20");

  let mockUSDCAddress = existing.tokens?.MockUSDC;
  let mockXDCAddress = existing.tokens?.MockXDC;

  if (!mockUSDCAddress) {
    console.log("Deploying MockUSDC on Sepolia...");
    const mockUSDC = await MockERC20.deploy("Mock USDC", "MUSDC", ethers.parseEther("1000000"));
    await mockUSDC.waitForDeployment();
    mockUSDCAddress = await mockUSDC.getAddress();
    console.log(`MockUSDC: ${mockUSDCAddress}`);
  } else {
    console.log(`Reusing MockUSDC: ${mockUSDCAddress}`);
  }

  if (!mockXDCAddress) {
    console.log("Deploying MockXDC on Sepolia...");
    const mockXDC = await MockERC20.deploy("Mock XDC", "MXDC", ethers.parseEther("1000000"));
    await mockXDC.waitForDeployment();
    mockXDCAddress = await mockXDC.getAddress();
    console.log(`MockXDC: ${mockXDCAddress}`);
  } else {
    console.log(`Reusing MockXDC: ${mockXDCAddress}`);
  }

  let dexDeployment: any = existing.dex ? { dex: existing.dex } : undefined;
  if (!dexDeployment) {
    dexDeployment = await deployDexOnSepolia(mockUSDCAddress, mockXDCAddress);
  } else {
    console.log("Reusing SimpleDEX deployment from existing record");
  }

  let escrowAddress = existing.contracts?.Escrow;
  let paymentVerifierAddress = existing.contracts?.PaymentVerifier;
  let solverRegistryAddress = existing.contracts?.SolverRegistry;
  let intentRegistryAddress = existing.contracts?.IntentRegistry;
  let lzBridgeAddress = existing.contracts?.IntentLZBridge;

  if (!escrowAddress) {
    console.log("Deploying Escrow...");
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy();
    await escrow.waitForDeployment();
    escrowAddress = await escrow.getAddress();
    console.log(`Escrow: ${escrowAddress}`);
  } else {
    console.log(`Reusing Escrow: ${escrowAddress}`);
  }

  if (!paymentVerifierAddress) {
    console.log("Deploying PaymentVerifier...");
    const PaymentVerifier = await ethers.getContractFactory("PaymentVerifier");
    const paymentVerifier = await PaymentVerifier.deploy(ethers.ZeroAddress);
    await paymentVerifier.waitForDeployment();
    paymentVerifierAddress = await paymentVerifier.getAddress();
    console.log(`PaymentVerifier: ${paymentVerifierAddress}`);
  } else {
    console.log(`Reusing PaymentVerifier: ${paymentVerifierAddress}`);
  }

  if (!solverRegistryAddress) {
    console.log("Deploying SolverRegistry...");
    const SolverRegistry = await ethers.getContractFactory("SolverRegistry");
    const solverRegistry = await SolverRegistry.deploy();
    await solverRegistry.waitForDeployment();
    solverRegistryAddress = await solverRegistry.getAddress();
    console.log(`SolverRegistry: ${solverRegistryAddress}`);
  } else {
    console.log(`Reusing SolverRegistry: ${solverRegistryAddress}`);
  }

  if (!intentRegistryAddress) {
    console.log("Deploying IntentRegistry...");
    const IntentRegistry = await ethers.getContractFactory("IntentRegistry");
    const intentRegistry = await IntentRegistry.deploy(escrowAddress, paymentVerifierAddress, solverRegistryAddress);
    await intentRegistry.waitForDeployment();
    intentRegistryAddress = await intentRegistry.getAddress();
    console.log(`IntentRegistry: ${intentRegistryAddress}`);

    const paymentVerifier = await ethers.getContractAt("PaymentVerifier", paymentVerifierAddress, deployer);
    await (await paymentVerifier.registerFacilitator(intentRegistryAddress)).wait();
    console.log("Registered IntentRegistry as PaymentVerifier facilitator");
  } else {
    console.log(`Reusing IntentRegistry: ${intentRegistryAddress}`);
  }

  const escrow = await ethers.getContractAt("Escrow", escrowAddress, deployer);
  if (!(await escrow.isTokenAllowed(mockUSDCAddress))) {
    await (await escrow.addAllowedToken(mockUSDCAddress)).wait();
    console.log("Added MockUSDC to Escrow allowlist");
  }
  if (!(await escrow.isTokenAllowed(mockXDCAddress))) {
    await (await escrow.addAllowedToken(mockXDCAddress)).wait();
    console.log("Added MockXDC to Escrow allowlist");
  }
  if ((await escrow.registry()) !== intentRegistryAddress) {
    await (await escrow.setRegistry(intentRegistryAddress)).wait();
    console.log("Set IntentRegistry on Escrow");
  }

  const facilitatorAddress = process.env.X402_FACILITATOR_ADDRESS || deployer.address;
  const paymentVerifier = await ethers.getContractAt("PaymentVerifier", paymentVerifierAddress, deployer);
  if (!(await paymentVerifier.facilitators(facilitatorAddress))) {
    await (await paymentVerifier.registerFacilitator(facilitatorAddress)).wait();
    console.log(`Registered facilitator: ${facilitatorAddress}`);
  }

  if (!lzBridgeAddress) {
    console.log("Deploying IntentLZBridge on Sepolia...");
    const IntentLZBridge = await ethers.getContractFactory("IntentLZBridge");
    const lzBridge = await IntentLZBridge.deploy(LZ_ENDPOINT_SEPOLIA, deployer.address);
    await lzBridge.waitForDeployment();
    lzBridgeAddress = await lzBridge.getAddress();
    console.log(`IntentLZBridge: ${lzBridgeAddress}`);
  } else {
    console.log(`Reusing IntentLZBridge: ${lzBridgeAddress}`);
  }

  let solverAddress: string | undefined = existing.solver;
  if (process.env.SOLVER_PRIVATE_KEY && !solverAddress) {
    const solverWallet = new ethers.Wallet(process.env.SOLVER_PRIVATE_KEY, ethers.provider);
    solverAddress = solverWallet.address;
    const registry = await ethers.getContractAt("SolverRegistry", solverRegistryAddress, deployer);
    const isRegistered = await registry.isRegistered(solverAddress);
    if (!isRegistered) {
      console.log(`Registering solver ${solverAddress}...`);
      const bond = await registry.requiredBond();
      const tx = await registry.registerSolver("LZ-Test-Solver", 30, [11155111, 421614], { value: bond });
      await tx.wait();
      console.log("Solver registered");
    } else {
      console.log(`Solver ${solverAddress} already registered`);
    }
  }

  return {
    chainId: 11155111,
    deployer: deployer.address,
    contracts: {
      Escrow: escrowAddress,
      PaymentVerifier: paymentVerifierAddress,
      IntentRegistry: intentRegistryAddress,
      SolverRegistry: solverRegistryAddress,
      IntentLZBridge: lzBridgeAddress,
    },
    tokens: {
      MockUSDC: mockUSDCAddress,
      MockXDC: mockXDCAddress,
    },
    dex: dexDeployment.dex,
    facilitator: facilitatorAddress,
    solver: solverAddress,
  };
}

async function deployArbitrumSepoliaStack(sepoliaBridgeAddress: string) {
  const [deployer] = await ethers.getSigners();
  console.log("\n========================================");
  console.log(`Deploying Arbitrum Sepolia stack with: ${deployer.address}`);
  console.log("========================================");

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  console.log("Deploying MockUSDC on Arbitrum Sepolia...");
  const mockUSDC = await MockERC20.deploy("Mock USDC", "MUSDC", ethers.parseEther("1000000"));
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log(`MockUSDC: ${mockUSDCAddress}`);

  console.log("Deploying IntentLZBridge on Arbitrum Sepolia...");
  const IntentLZBridge = await ethers.getContractFactory("IntentLZBridge");
  const lzBridge = await IntentLZBridge.deploy(LZ_ENDPOINT_ARBITRUM_SEPOLIA, deployer.address);
  await lzBridge.waitForDeployment();
  const lzBridgeAddress = await lzBridge.getAddress();
  console.log(`IntentLZBridge: ${lzBridgeAddress}`);

  return {
    chainId: 421614,
    deployer: deployer.address,
    contracts: {
      IntentLZBridge: lzBridgeAddress,
    },
    tokens: {
      MockUSDC: mockUSDCAddress,
    },
  };
}

async function configureTrustedRemotes(sepoliaBridgeAddress: string, arbitrumBridgeAddress: string) {
  const [deployer] = await ethers.getSigners();

  console.log("\n========================================");
  console.log("Configuring LayerZero trusted remotes");
  console.log("========================================");

  const sepoliaBridge = await ethers.getContractAt("IntentLZBridge", sepoliaBridgeAddress, deployer);
  const currentSepoliaPeer = await sepoliaBridge.peers(LZ_EID_ARBITRUM_SEPOLIA);
  const arbitrumPeerBytes32 = ethers.zeroPadValue(arbitrumBridgeAddress, 32);
  if (currentSepoliaPeer.toLowerCase() !== arbitrumPeerBytes32.toLowerCase()) {
    const tx = await sepoliaBridge.setPeer(LZ_EID_ARBITRUM_SEPOLIA, arbitrumPeerBytes32);
    await tx.wait();
    console.log(`Sepolia bridge peer set to Arbitrum Sepolia bridge: ${arbitrumBridgeAddress}`);
  } else {
    console.log("Sepolia bridge peer already configured");
  }

  const arbProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
  const arbDeployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, arbProvider);
  const arbitrumBridge = await ethers.getContractAt("IntentLZBridge", arbitrumBridgeAddress, arbDeployer);
  const currentArbPeer = await arbitrumBridge.peers(LZ_EID_SEPOLIA);
  const sepoliaPeerBytes32 = ethers.zeroPadValue(sepoliaBridgeAddress, 32);
  if (currentArbPeer.toLowerCase() !== sepoliaPeerBytes32.toLowerCase()) {
    const tx = await arbitrumBridge.setPeer(LZ_EID_SEPOLIA, sepoliaPeerBytes32);
    await tx.wait();
    console.log(`Arbitrum Sepolia bridge peer set to Sepolia bridge: ${sepoliaBridgeAddress}`);
  } else {
    console.log("Arbitrum Sepolia bridge peer already configured");
  }
}

async function main() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  const network = await ethers.provider.getNetwork();
  if (Number(network.chainId) !== 11155111) {
    throw new Error(`This script must be run on Sepolia (chainId 11155111), got ${network.chainId}`);
  }

  const existing = loadExisting();

  const sepoliaDeployment = await deploySepoliaStack(existing);

  let arbDeployment = existing.arbitrumSepolia;
  if (!arbDeployment?.contracts?.IntentLZBridge) {
    arbDeployment = await deployArbitrumSepoliaStack(sepoliaDeployment.contracts.IntentLZBridge);
  } else {
    console.log("\nReusing Arbitrum Sepolia deployment from existing record");
  }

  await configureTrustedRemotes(
    sepoliaDeployment.contracts.IntentLZBridge,
    arbDeployment.contracts.IntentLZBridge
  );

  const deployment: DeploymentRecord = {
    network: "lz-testnet",
    chainId: 11155111,
    deployer: sepoliaDeployment.deployer,
    contracts: sepoliaDeployment.contracts,
    tokens: sepoliaDeployment.tokens,
    dex: sepoliaDeployment.dex,
    facilitator: sepoliaDeployment.facilitator,
    solver: sepoliaDeployment.solver,
    lz: {
      sepoliaEid: LZ_EID_SEPOLIA,
      arbitrumSepoliaEid: LZ_EID_ARBITRUM_SEPOLIA,
    },
    arbitrumSepolia: {
      chainId: arbDeployment.chainId,
      deployer: arbDeployment.deployer,
      contracts: arbDeployment.contracts,
      tokens: arbDeployment.tokens,
    },
    timestamp: new Date().toISOString(),
  };

  saveDeployment(deployment);

  console.log("\n========================================");
  console.log("LayerZero Testnet Deployment Complete");
  console.log("========================================");
  console.log(JSON.stringify(deployment, null, 2));
  console.log("\nManual steps:");
  console.log("1. Fund the deployer and solver wallets with Sepolia ETH and Arbitrum Sepolia ETH for gas.");
  console.log("2. Update solver .env files with the deployed addresses and LZ_BRIDGE_ADDRESS.");
  console.log("3. Run the E2E script with: npx hardhat run scripts/run-lz-e2e.ts --network sepolia");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
