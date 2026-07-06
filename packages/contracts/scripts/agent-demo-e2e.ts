import { ethers } from "hardhat";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.XDC_TESTNET_RPC || "https://erpc.apothem.network";
const CHAIN_ID = 51;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const CONTRACTS = {
  escrow: "0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288",
  paymentVerifier: "0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6",
  intentRegistry: "0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4",
};

const TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

async function askAgent(prompt: string) {
  const res = await fetch(`${FRONTEND_URL}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, mode: "parse" }),
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error || "Agent parse failed");
  return body.result as {
    inputToken: string;
    inputAmount: string;
    outputToken: string;
    minDestAmount: string;
    maxSolverFee: string;
    reasoning: string;
  };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const user = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  console.log("User:", user.address);

  const prompt = "swap 10 USDC for at least 190 XDC";
  console.log("\n[Agent] Prompt:", prompt);
  const parsed = await askAgent(prompt);
  console.log("[Agent] Parsed intent:", parsed);

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

  const inputAmount = ethers.parseEther(parsed.inputAmount);
  const minDestAmount = ethers.parseEther(parsed.minDestAmount);
  const maxSolverFee = ethers.parseEther(parsed.maxSolverFee);

  console.log("\nMinting MockUSDC to user...");
  await (await mockUSDC.mint(user.address, inputAmount)).wait();
  console.log("Approving Escrow...");
  await (await mockUSDC.approve(CONTRACTS.escrow, inputAmount)).wait();

  const block = await provider.getBlock("latest");
  const expiry = block!.timestamp + 30 * 86400;

  const params: IntentParams = {
    sourceChainId: CHAIN_ID,
    sourceToken: parsed.inputToken,
    sourceAmount: inputAmount,
    destChainId: CHAIN_ID,
    destToken: parsed.outputToken,
    minDestAmount,
    maxSolverFee,
    expiry,
    nonce: BigInt(Date.now()),
    allowedSolvers: [],
  };

  const signed = await userSDK.signIntent(user.address, params);
  console.log("\nIntent ID:", signed.intentId);

  console.log("Submitting intent...");
  const submitTx = await userSDK.submitIntent(signed);
  await submitTx.wait();
  console.log("Submitted:", submitTx.hash);

  console.log("\nWaiting for solver quotes and fulfillment...");
  let fulfilled = false;
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const intent = await userSDK.getIntent(signed.intentId);
    if (intent.status === 1) {
      fulfilled = true;
      console.log("✅ Fulfilled by:", intent.solver);
      console.log("Fulfilled amount:", ethers.formatEther(intent.fulfilledAmount), "MXDC");
      console.log("Payment tx hash:", intent.paymentTxHash);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const quotesRes = await fetch(`http://localhost:3002/v1/intents/${signed.intentId}/quotes`);
  const quotes = await quotesRes.json();
  console.log("\nQuotes received:", JSON.stringify(quotes, null, 2));

  if (!fulfilled) {
    console.log("❌ Not fulfilled within timeout");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
