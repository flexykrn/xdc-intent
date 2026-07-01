import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({ intents: [] });
}
