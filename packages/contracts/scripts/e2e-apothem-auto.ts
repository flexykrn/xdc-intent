import { ethers } from "hardhat";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";
import * as dotenv from "dotenv";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

dotenv.config();

const RPC_URL = process.env.XDC_TESTNET_RPC || "https://erpc.apothem.network";
const CHAIN_ID = 51;
const FACILITATOR_URL = "http://localhost:3002";
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const CONTRACTS = {
  escrow: process.env.ESCROW_ADDRESS!,
  paymentVerifier: process.env.PAYMENT_VERIFIER_ADDRESS!,
  intentRegistry: process.env.INTENT_REGISTRY_ADDRESS!,
};

const TOKENS = {
  mockUSDC: "0x38bBd638AbCB44BDa788eBe382ee224b4f1F2f52",
  mockXDC: "0xBdff490ba4a9F14D9FCD07e56930A6fAC928D535",
};

function startService(name: string, cwd: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", ["dist/index.js"], {
      cwd,
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data: Buffer) => {
      console.log(`[${name}] ${data.toString().trim()}`);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[${name}] ${data.toString().trim()}`);
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[${name}] exited with code ${code}`);
      }
    });

    resolve(proc);
  });
}

async function waitForReady(url: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Service at ${url} did not become ready in time`);
}

async function waitForFulfillment(sdk: XDCIntentSDK, intentId: string, timeoutMs = 120000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const intent = await sdk.getIntent(intentId);
    if (intent.status === 1) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function killProc(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.killed || !proc.pid) return resolve();
    proc.on("exit", () => resolve());
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL");
      resolve();
    }, 5000);
  });
}

async function main() {
  const middlewareProc = await startService(
    "middleware",
    path.join(ROOT_DIR, "packages", "middleware")
  );
  const solverProc = await startService(
    "solver",
    path.join(ROOT_DIR, "packages", "solver")
  );

  try {
    await waitForReady(`${FACILITATOR_URL}/health`);
    console.log("Middleware ready");

    // Solver has no health endpoint; give it a moment to start polling.
    await new Promise((r) => setTimeout(r, 3000));
    console.log("Solver should be running");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const user = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
    const solverWallet = new ethers.Wallet(process.env.SOLVER_PRIVATE_KEY!, provider);

    console.log("User:", user.address);
    console.log("Solver:", solverWallet.address);

    const userSDK = new XDCIntentSDK({
      provider,
      signer: user,
      chainId: CHAIN_ID,
      contractAddresses: CONTRACTS,
    });

    const mockUSDC = new ethers.Contract(
      TOKENS.mockUSDC,
      [
        "function mint(address to, uint256 amount) external",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function balanceOf(address account) external view returns (uint256)",
      ],
      user
    );

    const sourceAmount = ethers.parseEther("100");
    const minDestAmount = ethers.parseEther("95");
    const maxSolverFee = ethers.parseEther("5");

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
      allowedSolvers: [solverWallet.address],
    };

    const signed = await userSDK.signIntent(user.address, params);
    console.log("Submitting intent:", signed.intentId);

    const submitTx = await userSDK.submitIntent(signed);
    await submitTx.wait();
    console.log("Submitted:", submitTx.hash);

    console.log("Waiting for solver/middleware to fulfill...");
    const fulfilled = await waitForFulfillment(userSDK, signed.intentId);

    if (fulfilled) {
      const final = await userSDK.getIntent(signed.intentId);
      console.log("✅ Auto-fulfilled by solver:", final.solver);
      console.log("Fulfilled amount:", final.fulfilledAmount.toString());
      console.log("Payment tx hash:", final.paymentTxHash);
    } else {
      throw new Error("Intent was not fulfilled within timeout");
    }
  } finally {
    console.log("Shutting down services...");
    await killProc(solverProc);
    await killProc(middlewareProc);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
