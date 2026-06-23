import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";

export async function GET() {
  try {
    const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
    const total = await registry.getTotalIntents();
    const fulfilled = await registry.getTotalIntentsFulfilled();

    return NextResponse.json({
      totalIntents: total.toString(),
      fulfilledIntents: fulfilled.toString(),
      activeSolvers: 3,
      successRate: "99%",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
