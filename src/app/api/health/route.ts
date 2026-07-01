import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    network: "xdc-apothem",
    features: [
      "intent-registry",
      "solver-registry",
      "mev-protection",
      "gasless-execution",
      "cross-chain",
      "relayer-network",
    ],
  });
}
