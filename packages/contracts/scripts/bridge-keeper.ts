import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const mockBridgeAddress = process.env.MOCK_BRIDGE_ADDRESS;
  if (!mockBridgeAddress) {
    throw new Error("MOCK_BRIDGE_ADDRESS not set");
  }

  const mockBridge = await ethers.getContractAt("MockBridge", mockBridgeAddress, deployer);
  const provider = ethers.provider;
  const pollIntervalMs = parseInt(process.env.KEEPER_POLL_INTERVAL_MS || "5000", 10);
  const lookbackBlocks = parseInt(process.env.KEEPER_LOOKBACK_BLOCKS || "1000", 10);

  console.log(`Bridge keeper running on ${network.name} (${network.chainId})`);
  console.log(`Deployer/owner: ${deployer.address}`);
  console.log(`MockBridge: ${mockBridgeAddress}`);

  const processed = new Set<string>();

  const poll = async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - lookbackBlocks);
      const events = await mockBridge.queryFilter(mockBridge.filters.BridgeOut(), fromBlock, currentBlock);

      for (const event of events) {
        const { intentId, token, amount, destChainId, sender } = (event as ethers.EventLog).args;
        if (processed.has(intentId)) continue;

        const alreadyMinted = await mockBridge.mintProcessed(intentId);
        if (alreadyMinted) {
          processed.add(intentId);
          continue;
        }

        console.log(`Minting on dest for intent ${intentId}: ${amount} ${token} to ${sender}`);
        const tx = await mockBridge.mintOnDest(intentId, token, amount, sender);
        await tx.wait();
        processed.add(intentId);
        console.log(`  tx: ${tx.hash}`);
      }
    } catch (error: any) {
      console.error("Keeper poll failed:", error.message);
    }
  };

  await poll();
  setInterval(poll, pollIntervalMs);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
