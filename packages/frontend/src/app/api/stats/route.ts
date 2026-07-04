import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI, RPC_URL, SOLVER_REGISTRY_ABI } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
    const solverRegistry = new ethers.Contract(CONTRACTS.solverRegistry, SOLVER_REGISTRY_ABI, provider);

    const [total, fulfilled, solverCount] = await Promise.all([
      registry.getTotalIntents().catch(() => BigInt(0)),
      registry.totalIntentsFulfilled().catch(() => BigInt(0)),
      solverRegistry.getSolverCount().catch(() => BigInt(0)),
    ]);

    const successRate = total > BigInt(0) ? Number((fulfilled * BigInt(100)) / total) : 0;

    return NextResponse.json({
      total: total.toString(),
      fulfilled: fulfilled.toString(),
      activeSolvers: Number(solverCount),
      successRate: `${successRate}%`,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error("Failed to fetch stats");
    console.error("Stats API error:", err);
    return NextResponse.json({
      total: "0",
      fulfilled: "0",
      activeSolvers: 0,
      successRate: "0%",
      error: err.message,
    }, { status: 500 });
  }
}
