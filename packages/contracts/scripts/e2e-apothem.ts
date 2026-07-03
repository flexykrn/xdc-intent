import { ethers } from "hardhat";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.XDC_TESTNET_RPC || "https://erpc.apothem.network";
const CHAIN_ID = 51;

const CONTRACTS = {
  escrow: process.env.ESCROW_ADDRESS!,
  paymentVerifier: process.env.PAYMENT_VERIFIER_ADDRESS!,
  intentRegistry: process.env.INTENT_REGISTRY_ADDRESS!,
};

const TOKENS = {
  mockUSDC: "0xB2F1309AA1C141C3B989085D20922ffA6e83cB1b",
  mockXDC: "0x78932974fB9fbC7fceE9bd94e72764018C8C3D46",
};

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const user = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const solver = new ethers.Wallet(process.env.SOLVER_PRIVATE_KEY!, provider);

  console.log("User:", user.address);
  console.log("Solver:", solver.address);
  console.log("User TXDC balance:", ethers.formatEther(await provider.getBalance(user.address)));
  console.log("Solver TXDC balance:", ethers.formatEther(await provider.getBalance(solver.address)));

  const mockUSDC = new ethers.Contract(
    TOKENS.mockUSDC,
    [
      "function mint(address to, uint256 amount) external",
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function balanceOf(address account) external view returns (uint256)",
      "function transfer(address to, uint256 amount) external returns (bool)",
    ],
    user
  );

  // Mint and approve MockUSDC for user
  const sourceAmount = ethers.parseEther("1000");
  const minDestAmount = ethers.parseEther("990");
  const maxSolverFee = ethers.parseEther("10");

  console.log("Minting MockUSDC to user...");
  await (await mockUSDC.mint(user.address, sourceAmount)).wait();
  console.log("Approving Escrow...");
  await (await mockUSDC.approve(CONTRACTS.escrow, sourceAmount)).wait();

  const userSDK = new XDCIntentSDK({
    provider,
    signer: user,
    chainId: CHAIN_ID,
    contractAddresses: CONTRACTS,
  });

  const solverSDK = new XDCIntentSDK({
    provider,
    signer: solver,
    chainId: CHAIN_ID,
    contractAddresses: CONTRACTS,
  });

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
    nonce: 1n,
    allowedSolvers: [solver.address],
  };

  console.log("Signing intent...");
  const signed = await userSDK.signIntent(user.address, params);
  console.log("Intent ID:", signed.intentId);

  console.log("Submitting intent...");
  const submitTx = await userSDK.submitIntent(signed);
  await submitTx.wait();
  console.log("Submitted:", submitTx.hash);

  // Wait briefly for chain state
  await new Promise((r) => setTimeout(r, 3000));

  let stored = await userSDK.getIntent(signed.intentId);
  console.log("Intent status:", stored.status);

  // Solver fulfills directly (skipping middleware/facilitator for this direct contract test)
  const destAmount = ethers.parseEther("995");
  const paymentTxHash = ethers.keccak256(ethers.toUtf8Bytes("testnet-payment-" + Date.now()));

  console.log("Solver fulfilling intent...");
  const fulfillTx = await solverSDK.fulfillIntent(signed.intentId, destAmount, paymentTxHash);
  await fulfillTx.wait();
  console.log("Fulfilled:", fulfillTx.hash);

  await new Promise((r) => setTimeout(r, 3000));
  stored = await userSDK.getIntent(signed.intentId);
  console.log("Final status:", stored.status, "solver:", stored.solver);

  if (stored.status === 1 && stored.solver.toLowerCase() === solver.address.toLowerCase()) {
    console.log("✅ End-to-end test passed");
  } else {
    console.log("❌ Test failed");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
