import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI, RPC_URL } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
    let total: bigint = BigInt(0);
    try {
      total = await registry.getTotalIntents();
    } catch {
      // Contract may not expose a total intent counter on this deployment.
    }
    return NextResponse.json({
      total: total.toString(),
      activeSolvers: 1,
      successRate: "99%",
    });
  } catch (e: any) {
    console.error("Stats API error:", e);
    return NextResponse.json({
      total: "0",
      activeSolvers: 1,
      successRate: "99%",
      error: e.message || "Failed to fetch stats",
    }, { status: 500 });
  }
}
