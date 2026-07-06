import { NextResponse } from "next/server";

const MIDDLEWARE_URL = process.env.MIDDLEWARE_URL || "http://localhost:3002";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const intentId = searchParams.get("intentId");
    if (!intentId) {
      return NextResponse.json({ error: "Missing intentId" }, { status: 400 });
    }
    const res = await fetch(`${MIDDLEWARE_URL}/v1/intents/${intentId}/bridge-status`);
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
