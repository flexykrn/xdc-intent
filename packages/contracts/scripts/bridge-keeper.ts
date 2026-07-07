import { ethers } from "hardhat";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getSupportedDestChains, isSupportedDestChain } from "./bridge-config";

const STATE_FILE = join(__dirname, "..", "deployments", "bridge-keeper-state.json");

interface KeeperState {
  lastBlock: number;
  processed: string[];
}

function loadState(): KeeperState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (error: any) {
    console.warn(`Failed to load keeper state: ${error.message}`);
  }
  return { lastBlock: 0, processed: [] };
}

function saveState(state: KeeperState) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error: any) {
    console.warn(`Failed to save keeper state: ${error.message}`);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.warn(`${label} failed (attempt ${attempt}/${maxAttempts}): ${error.message}`);
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function runMockKeeper(deployer: ethers.Signer, network: ethers.Network) {
  const mockBridgeAddress = process.env.MOCK_BRIDGE_ADDRESS;
  if (!mockBridgeAddress) {
    throw new Error("MOCK_BRIDGE_ADDRESS not set");
  }

  const mockBridge = await ethers.getContractAt("MockBridge", mockBridgeAddress, deployer);
  const provider = ethers.provider;
  const pollIntervalMs = parseInt(process.env.KEEPER_POLL_INTERVAL_MS || "5000", 10);
  const lookbackBlocks = parseInt(process.env.KEEPER_LOOKBACK_BLOCKS || "1000", 10);
  const supportedChains = getSupportedDestChains();

  console.log(`Bridge keeper running on ${network.name} (${network.chainId})`);
  console.log(`Deployer/owner: ${deployer.address}`);
  console.log(`MockBridge: ${mockBridgeAddress}`);
  console.log(`Supported mock destination chains: ${supportedChains.map((c) => `${c.name} (${c.chainId})`).join(", ")}`);

  const state = loadState();
  const processed = new Set<string>(state.processed);

  const persist = () => {
    saveState({
      lastBlock: state.lastBlock,
      processed: Array.from(processed),
    });
  };

  const poll = async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, Math.max(state.lastBlock + 1, currentBlock - lookbackBlocks));

      if (fromBlock > currentBlock) {
        return;
      }

      const events = await withRetry(
        () => mockBridge.queryFilter(mockBridge.filters.BridgeOut(), fromBlock, currentBlock),
        `query BridgeOut events (${fromBlock}-${currentBlock})`
      );

      for (const event of events) {
        const { intentId, token, amount, destChainId, sender } = (event as ethers.EventLog).args;

        if (!isSupportedDestChain(Number(destChainId))) {
          console.log(`Skipping intent ${intentId}: unsupported dest chain ${destChainId}`);
          continue;
        }

        if (processed.has(intentId)) continue;

        const alreadyMinted = await withRetry(
          () => mockBridge.mintProcessed(intentId),
          `check mintProcessed for ${intentId}`
        );
        if (alreadyMinted) {
          processed.add(intentId);
          continue;
        }

        console.log(`Minting on dest chain ${destChainId} for intent ${intentId}: ${amount} ${token} to ${sender}`);
        const tx = await withRetry(
          () => mockBridge.mintOnDest(intentId, token, amount, sender),
          `mintOnDest for ${intentId}`,
          5,
          2000
        );
        await withRetry(() => tx.wait(), `wait mint tx for ${intentId}`);
        processed.add(intentId);
        console.log(`  tx: ${tx.hash}`);
      }

      state.lastBlock = currentBlock;
      persist();
    } catch (error: any) {
      console.error("Keeper poll failed:", error.message);
    }
  };

  await poll();
  const interval = setInterval(poll, pollIntervalMs);

  const gracefulShutdown = () => {
    console.log("\nBridge keeper shutting down...");
    clearInterval(interval);
    persist();
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}

async function runLzKeeper(deployer: ethers.Signer, network: ethers.Network) {
  const lzBridgeAddress = process.env.LZ_BRIDGE_ADDRESS;
  if (!lzBridgeAddress) {
    throw new Error("LZ_BRIDGE_ADDRESS not set");
  }

  const lzBridge = await ethers.getContractAt("IntentLZBridge", lzBridgeAddress, deployer);
  const provider = ethers.provider;
  const pollIntervalMs = parseInt(process.env.KEEPER_POLL_INTERVAL_MS || "5000", 10);
  const lookbackBlocks = parseInt(process.env.KEEPER_LOOKBACK_BLOCKS || "1000", 10);

  console.log(`LayerZero bridge keeper running on ${network.name} (${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`IntentLZBridge: ${lzBridgeAddress}`);
  console.log("Mode: destination-chain listener (relayer executes lzReceive, keeper only confirms)");

  const state = loadState();
  const processed = new Set<string>(state.processed);

  const persist = () => {
    saveState({
      lastBlock: state.lastBlock,
      processed: Array.from(processed),
    });
  };

  const poll = async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, Math.max(state.lastBlock + 1, currentBlock - lookbackBlocks));

      if (fromBlock > currentBlock) {
        return;
      }

      const events = await withRetry(
        () => lzBridge.queryFilter(lzBridge.filters.BridgeIn(), fromBlock, currentBlock),
        `query BridgeIn events (${fromBlock}-${currentBlock})`
      );

      for (const event of events) {
        const { intentId, destToken, amount, srcEid, recipient } = (event as ethers.EventLog).args;
        if (processed.has(intentId)) continue;

        const alreadyProcessed = await withRetry(
          () => lzBridge.processed(intentId),
          `check processed for ${intentId}`
        );
        if (!alreadyProcessed) {
          console.log(`Intent ${intentId} BridgeIn observed but not yet processed on-chain; skipping`);
          continue;
        }

        console.log(`Confirmed LZ delivery for intent ${intentId}: ${amount} ${destToken} to ${recipient} from eid ${srcEid}`);
        processed.add(intentId);
      }

      state.lastBlock = currentBlock;
      persist();
    } catch (error: any) {
      console.error("LZ keeper poll failed:", error.message);
    }
  };

  await poll();
  const interval = setInterval(poll, pollIntervalMs);

  const gracefulShutdown = () => {
    console.log("\nLZ bridge keeper shutting down...");
    clearInterval(interval);
    persist();
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  if (process.env.LZ_BRIDGE_ADDRESS) {
    await runLzKeeper(deployer, network);
  } else if (process.env.MOCK_BRIDGE_ADDRESS) {
    await runMockKeeper(deployer, network);
  } else {
    throw new Error("Either LZ_BRIDGE_ADDRESS or MOCK_BRIDGE_ADDRESS must be set");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
