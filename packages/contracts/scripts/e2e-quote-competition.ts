import { ethers } from "hardhat";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.XDC_TESTNET_RPC || "https://erpc.apothem.network";
const CHAIN_ID = 51;

const CONTRACTS = {
  escrow: "0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288",
  paymentVerifier: "0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6",
  intentRegistry: "0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4",
};

const TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const user = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  console.log("User:", user.address);

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

  const sourceAmount = ethers.parseUnits("100", 6);
  const minDestAmount = ethers.parseEther("1900");
  const maxSolverFee = ethers.parseUnits("2", 6);

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
    destChainId: CHAIN_ID,
    destToken: TOKENS.mockXDC,
    minDestAmount,
    maxSolverFee,
    expiry,
    nonce: BigInt(Date.now()),
    allowedSolvers: [],
  };

  const signed = await userSDK.signIntent(user.address, params);
  console.log("Intent ID:", signed.intentId);

  console.log("Submitting intent...");
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
      console.log("✅ Fulfilled by:", intent.solver);
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

  // Show quotes
  const quotesRes = await fetch(`http://localhost:3002/v1/intents/${signed.intentId}/quotes`);
  const quotes = await quotesRes.json();
  console.log("Quotes received:", JSON.stringify(quotes, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
