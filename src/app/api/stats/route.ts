import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    totalIntents: "0",
    fulfilledIntents: "0",
    activeSolvers: 3,
    successRate: "99%",
  });
}
