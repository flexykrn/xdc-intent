import { ethers } from "hardhat";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";
import * as dotenv from "dotenv";
import { getSupportedDestChains, isSupportedDestChain } from "./bridge-config";

dotenv.config();

const RPC_URL = process.env.XDC_TESTNET_RPC || "https://erpc.apothem.network";
const CHAIN_ID = 51;
const DEFAULT_MOCK_DEST_CHAIN = 99999;

const CONTRACTS = {
  escrow: "0x5c6fb5D7E81e11C303e5cE00fBE7AE748a47690d",
  paymentVerifier: "0x6Ce223bD961217917aa16654E77A6A440f35A70A",
  intentRegistry: "0xfe1887C1686cF54d83107DAf7Ad7F5A5Ea95419b",
};

const MOCK_BRIDGE_ADDRESS = process.env.MOCK_BRIDGE_ADDRESS || "0xB494122Fb840D928d0f0F98E69985a85E9EBC139";

const TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

async function main() {
  const destChainArg = process.env.DEST_CHAIN_ID;
  const destChainId = destChainArg ? parseInt(destChainArg, 10) : DEFAULT_MOCK_DEST_CHAIN;

  if (!isSupportedDestChain(destChainId)) {
    console.error(`Unsupported destination chain ${destChainId}. Supported: ${getSupportedDestChains().map((c) => c.chainId).join(", ")}`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const user = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  console.log("User:", user.address);
  console.log(`Destination chain: ${destChainId}`);

  const userSDK = new XDCIntentSDK({
    provider,
    signer: user,
    chainId: CHAIN_ID,
    contractAddresses: CONTRACTS,
  });

  const mockUSDC = new ethers.Contract(
    TOKENS.mockUSDC,
    ["function mint(address to, uint256 amount) external", "function approve(address spender, uint256 amount) external returns (bool)", "function balanceOf(address account) external view returns (uint256)"],
    user
  );

  const mockUSDCUser = new ethers.Contract(
    TOKENS.mockUSDC,
    ["function balanceOf(address account) external view returns (uint256)"],
    provider
  );

  const sourceAmount = ethers.parseEther("10");
  const minDestAmount = ethers.parseEther("180");
  const maxSolverFee = ethers.parseEther("1");

  console.log("Minting MockUSDC to user...");
  await (await mockUSDC.mint(user.address, sourceAmount)).wait();
  console.log("Approving Escrow...");
  await (await mockUSDC.approve(CONTRACTS.escrow, sourceAmount)).wait();

  const block = await provider.getBlock("latest");
  const expiry = block!.timestamp + 30 * 86400;

  const params: IntentParams = {
    sourceChainId: CHAIN_ID,
    sourceToken: TOKENS.mockUSDC,
    sourceAmount,
    destChainId,
    destToken: TOKENS.mockXDC,
    minDestAmount,
    maxSolverFee,
    expiry,
    nonce: BigInt(Date.now()),
    allowedSolvers: [],
  };

  const signed = await userSDK.signIntent(user.address, params);
  console.log("Intent ID:", signed.intentId);

  const userDestBalanceBefore = await mockUSDCUser.balanceOf(user.address);
  console.log("User MockUSDC balance before:", userDestBalanceBefore.toString());

  console.log("Submitting cross-chain intent...");
  const submitTx = await userSDK.submitIntent(signed);
  await submitTx.wait();
  console.log("Submitted:", submitTx.hash);

  console.log("Waiting for solver quotes and fulfillment...");
  let fulfilled = false;
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const intent = await userSDK.getIntent(signed.intentId);
    if (intent.status === 1) {
      fulfilled = true;
      console.log("✅ Cross-chain fulfilled by:", intent.solver);
      console.log("Fulfilled amount:", intent.fulfilledAmount.toString());
      console.log("Payment tx hash:", intent.paymentTxHash);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!fulfilled) {
    console.log("❌ Not fulfilled within timeout");
    process.exit(1);
  }

  console.log("Waiting for bridge keeper destination mint...");
  let minted = false;
  const mintStart = Date.now();
  const mockBridge = new ethers.Contract(
    MOCK_BRIDGE_ADDRESS,
    [
      "event BridgeIn(bytes32 indexed intentId, address indexed token, uint256 amount, uint256 indexed sourceChainId, address recipient)",
      "function mintProcessed(bytes32 intentId) external view returns (bool)",
    ],
    provider
  );

  const currentBlock = await provider.getBlockNumber();
  while (Date.now() - mintStart < 120000) {
    const isMinted = await mockBridge.mintProcessed(signed.intentId);
    if (isMinted) {
      minted = true;
      const userDestBalanceAfter = await mockUSDCUser.balanceOf(user.address);
      console.log("✅ Destination mint completed");
      console.log("User MockUSDC balance after:", userDestBalanceAfter.toString());
      console.log("Minted amount:", (userDestBalanceAfter - userDestBalanceBefore).toString());
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!minted) {
    console.log("❌ Destination mint did not complete within timeout");
    process.exit(1);
  }

  const quotesRes = await fetch(`http://localhost:3002/v1/intents/${signed.intentId}/quotes`);
  const quotes = await quotesRes.json();
  console.log("Quotes received:", JSON.stringify(quotes, null, 2));

  const bridgeStatusRes = await fetch(`http://localhost:3002/v1/intents/${signed.intentId}/bridge-status`);
  const bridgeStatus = await bridgeStatusRes.json();
  console.log("Bridge status:", JSON.stringify(bridgeStatus, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
