import { ethers } from "hardhat";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";
import * as dotenv from "dotenv";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

dotenv.config();

const DEPLOYMENT_FILE = join(__dirname, "..", "deployments", "lz-testnet.json");

const LZ_EID_ARBITRUM_SEPOLIA = 40231;
const DEFAULT_RECEIVE_GAS = 200_000;

function buildLzReceiveOptions(gas: number): string {
  const type3 = 3;
  const workerId = 1;
  const optionType = 1;
  const optionLength = 17;
  return ethers.solidityPacked(
    ["uint16", "uint8", "uint16", "uint8", "uint128"],
    [type3, workerId, optionLength, optionType, gas]
  );
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function loadDeployment() {
  if (!existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`Deployment file not found: ${DEPLOYMENT_FILE}. Run deploy-lz-testnet-stack.ts first.`);
  }
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf-8"));
}

async function main() {
  const deployment = loadDeployment();
  const sepolia = deployment;
  const arb = deployment.arbitrumSepolia;

  const sepoliaProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org");
  const arbProvider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc");

  const user = new ethers.Wallet(requireEnv("DEPLOYER_PRIVATE_KEY"), sepoliaProvider);
  const solver = new ethers.Wallet(requireEnv("SOLVER_PRIVATE_KEY"), sepoliaProvider);
  const arbUser = new ethers.Wallet(requireEnv("DEPLOYER_PRIVATE_KEY"), arbProvider);
  const arbSolver = new ethers.Wallet(requireEnv("SOLVER_PRIVATE_KEY"), arbProvider);

  console.log("User:", user.address);
  console.log("Solver:", solver.address);
  console.log("Source chain: Sepolia (11155111)");
  console.log("Destination chain: Arbitrum Sepolia (421614)");

  const mockUSDCAbi = [
    "function mint(address to, uint256 amount) external",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
  ];

  const sepoliaUSDC = new ethers.Contract(sepolia.tokens.MockUSDC, mockUSDCAbi, user);
  const sepoliaUSDCForSolver = new ethers.Contract(sepolia.tokens.MockUSDC, mockUSDCAbi, solver);
  const arbUSDC = new ethers.Contract(arb.tokens.MockUSDC, mockUSDCAbi, arbUser);

  const decimals = await sepoliaUSDC.decimals();
  const sourceAmount = ethers.parseUnits("10", decimals);
  const minDestAmount = ethers.parseUnits("9", decimals);
  const maxSolverFee = ethers.parseUnits("1", decimals);
  const destAmount = ethers.parseUnits("9.5", decimals);

  console.log("\nMinting test tokens...");
  await (await sepoliaUSDC.mint(user.address, sourceAmount * 2n)).wait();
  await (await sepoliaUSDC.mint(solver.address, sourceAmount * 2n)).wait();
  await (await arbUSDC.mint(user.address, sourceAmount)).wait();
  console.log("Minted MockUSDC on Sepolia and Arbitrum Sepolia");

  const userArbBalanceBefore = await arbUSDC.balanceOf(user.address);
  console.log("User Arbitrum Sepolia MockUSDC balance before:", ethers.formatUnits(userArbBalanceBefore, decimals));

  const sdk = new XDCIntentSDK({
    provider: sepoliaProvider,
    signer: user,
    chainId: 11155111,
    contractAddresses: {
      escrow: sepolia.contracts.Escrow,
      paymentVerifier: sepolia.contracts.PaymentVerifier,
      intentRegistry: sepolia.contracts.IntentRegistry,
      solverRegistry: sepolia.contracts.SolverRegistry,
    },
  });

  const block = await sepoliaProvider.getBlock("latest");
  const expiry = block!.timestamp + 30 * 86400;

  const params: IntentParams = {
    sourceChainId: 11155111,
    sourceToken: sepolia.tokens.MockUSDC,
    sourceAmount,
    destChainId: 421614,
    destToken: arb.tokens.MockUSDC,
    minDestAmount,
    maxSolverFee,
    expiry,
    nonce: BigInt(Date.now()),
    allowedSolvers: [solver.address],
  };

  const signed = await sdk.signIntent(user.address, params);
  console.log("\nIntent ID:", signed.intentId);

  const existingIntent = await sdk.getIntent(signed.intentId);
  let submitTxHash: string;
  if (existingIntent.user !== ethers.ZeroAddress) {
    console.log("Intent already exists; reusing submission");
    submitTxHash = "existing";
  } else {
    console.log("Approving Escrow to spend source tokens...");
    await (await sepoliaUSDC.approve(sepolia.contracts.Escrow, sourceAmount)).wait();

    console.log("Submitting cross-chain intent...");
    const submitTx = await sdk.submitIntent(signed);
    await submitTx.wait();
    submitTxHash = submitTx.hash;
    console.log("Submitted:", submitTxHash);
  }

  const intent = await sdk.getIntent(signed.intentId);
  if (Number(intent.status) === 0) {
    console.log("\nFulfilling intent as facilitator (solver wins)...");
    const intentRegistry = new ethers.Contract(
      sepolia.contracts.IntentRegistry,
      [
        "function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash, address solver) external returns (bool)",
      ],
      user
    );
    const paymentTxHash = ethers.keccak256(ethers.randomBytes(32));
    const tx = await (intentRegistry as any).fulfillIntent(signed.intentId, destAmount, paymentTxHash, solver.address);
    await tx.wait();
    console.log("Fulfilled:", tx.hash);
  } else {
    console.log("Intent already fulfilled; skipping fulfillment");
  }

  const fulfilled = await sdk.getIntent(signed.intentId);
  console.log("Fulfilled by:", fulfilled.solver);
  console.log("Fulfilled amount:", ethers.formatUnits(fulfilled.fulfilledAmount, decimals));

  console.log("\nSolver bridging source tokens to user on Arbitrum Sepolia via LayerZero...");
  const lzBridgeAbi = [
    "function bridgeOut(bytes32 _intentId, address _sourceToken, uint256 _amount, uint32 _dstEid, uint256 _destChainId, address _recipient, address _destToken, bytes calldata _options) external payable",
    "function quoteBridgeFee(uint32 _dstEid, bytes calldata _message, bytes calldata _options) external view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))",
    "function processed(bytes32) external view returns (bool)",
  ];
  const lzBridge = new ethers.Contract(sepolia.contracts.IntentLZBridge, lzBridgeAbi, solver);

  const options = buildLzReceiveOptions(DEFAULT_RECEIVE_GAS);
  const message = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "uint256", "uint256"],
    [signed.intentId, user.address, arb.tokens.MockUSDC, sourceAmount, 421614]
  );
  const fee = await (lzBridge as any).quoteBridgeFee(LZ_EID_ARBITRUM_SEPOLIA, message, options);
  const nativeFee = BigInt(fee.nativeFee.toString());
  console.log(`Bridge native fee: ${ethers.formatEther(nativeFee)} ETH`);

  await (await sepoliaUSDCForSolver.approve(sepolia.contracts.IntentLZBridge, sourceAmount)).wait();

  const bridgeTx = await (lzBridge as any).bridgeOut(
    signed.intentId,
    sepolia.tokens.MockUSDC,
    sourceAmount,
    LZ_EID_ARBITRUM_SEPOLIA,
    421614,
    user.address,
    arb.tokens.MockUSDC,
    options,
    { value: nativeFee }
  );
  await bridgeTx.wait();
  console.log("BridgeOut:", bridgeTx.hash);

  console.log("\nPolling for LayerZero delivery on Arbitrum Sepolia...");
  const arbBridge = new ethers.Contract(arb.contracts.IntentLZBridge, lzBridgeAbi, arbProvider);
  const pollStart = Date.now();
  const pollTimeout = 10 * 60 * 1000;
  let delivered = false;

  while (Date.now() - pollStart < pollTimeout) {
    try {
      const processed = await arbBridge.processed(signed.intentId);
      if (processed) {
        delivered = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 10000));
  }

  const userArbBalanceAfter = await arbUSDC.balanceOf(user.address);
  console.log("User Arbitrum Sepolia MockUSDC balance after:", ethers.formatUnits(userArbBalanceAfter, decimals));

  const summary = {
    intentId: signed.intentId,
    user: user.address,
    solver: solver.address,
    sourceAmount: ethers.formatUnits(sourceAmount, decimals),
    destAmount: ethers.formatUnits(destAmount, decimals),
    submitTxHash,
    fulfillTxHash: fulfilled.paymentTxHash,
    bridgeOutTxHash: bridgeTx.hash,
    delivered,
    balanceIncrease: ethers.formatUnits(userArbBalanceAfter - userArbBalanceBefore, decimals),
  };

  console.log("\n========================================");
  console.log("LayerZero Testnet E2E Summary");
  console.log("========================================");
  console.log(JSON.stringify(summary, null, 2));

  if (!delivered) {
    console.log("\nWARNING: LayerZero delivery not confirmed within timeout.");
    console.log("Check LayerZero Scan with the bridgeOut tx hash for delivery status.");
  }

  if (userArbBalanceAfter <= userArbBalanceBefore) {
    console.log("\nFAIL: Destination balance did not increase.");
    process.exit(1);
  }

  console.log("\nPASS: Destination balance increased. LayerZero cross-chain intent completed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
