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
    const res = await fetch(`${MIDDLEWARE_URL}/v1/intents/${intentId}/payment-required`);
    const body = await res.json();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });
    return NextResponse.json(body, { status: res.status, headers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
