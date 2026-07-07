import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { getSupportedDestChains } from "./bridge-config";

dotenv.config();

const RPC_URL = process.env.XDC_TESTNET_RPC || "https://erpc.apothem.network";
const MOCK_BRIDGE_ADDRESS = process.env.MOCK_BRIDGE_ADDRESS;

async function main() {
  if (!MOCK_BRIDGE_ADDRESS) {
    throw new Error("MOCK_BRIDGE_ADDRESS not set");
  }

  const intentId = process.argv[2];
  if (!intentId) {
    console.error("Usage: npx hardhat run scripts/verify-dest-mint.ts --network apothem <intentId>");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const mockBridge = new ethers.Contract(
    MOCK_BRIDGE_ADDRESS,
    [
      "event BridgeOut(bytes32 indexed intentId, address indexed token, uint256 amount, uint256 indexed destChainId, address sender)",
      "event BridgeIn(bytes32 indexed intentId, address indexed token, uint256 amount, uint256 indexed sourceChainId, address recipient)",
      "function processed(bytes32 intentId) external view returns (bool)",
      "function mintProcessed(bytes32 intentId) external view returns (bool)",
      "function bridgeOutProcessed(bytes32 intentId) external view returns (bool)",
    ],
    provider
  );

  console.log(`Verifying destination mint for intent ${intentId}`);
  console.log(`MockBridge: ${MOCK_BRIDGE_ADDRESS}`);
  console.log(`Supported dest chains: ${getSupportedDestChains().map((c) => c.chainId).join(", ")}`);

  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 100000);

  const [processed, mintProcessed, bridgeOutProcessed] = await Promise.all([
    mockBridge.processed(intentId).catch(() => false),
    mockBridge.mintProcessed(intentId).catch(() => false),
    mockBridge.bridgeOutProcessed(intentId).catch(() => false),
  ]);

  console.log({ processed, mintProcessed, bridgeOutProcessed });

  const outEvents = await mockBridge.queryFilter(mockBridge.filters.BridgeOut(intentId), fromBlock, currentBlock);
  const inEvents = await mockBridge.queryFilter(mockBridge.filters.BridgeIn(intentId), fromBlock, currentBlock);

  if (outEvents.length === 0) {
    console.log("❌ No BridgeOut event found");
    process.exit(1);
  }

  const outEvent = outEvents[outEvents.length - 1] as ethers.EventLog;
  console.log(`✅ BridgeOut found: amount=${outEvent.args[2]}, destChainId=${outEvent.args[3]}, tx=${outEvent.transactionHash}`);

  if (inEvents.length === 0) {
    console.log("❌ No BridgeIn (destination mint) event found");
    process.exit(1);
  }

  const inEvent = inEvents[inEvents.length - 1] as ethers.EventLog;
  console.log(`✅ BridgeIn found: amount=${inEvent.args[2]}, recipient=${inEvent.args[4]}, tx=${inEvent.transactionHash}`);

  if (!mintProcessed) {
    console.log("⚠️  BridgeIn event exists but mintProcessed flag is false");
  }

  console.log("\n✅ Destination mint verified successfully");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
