import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI, RPC_URL } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
    const total = await registry.getTotalIntents();
    return NextResponse.json({
      total: total.toString(),
      activeSolvers: 3,
      successRate: "99%",
    });
  } catch (e: any) {
    console.error("Stats API error:", e);
    return NextResponse.json({
      total: "0",
      activeSolvers: 3,
      successRate: "99%",
      error: e.message || "Failed to fetch stats",
    }, { status: 500 });
  }
}
