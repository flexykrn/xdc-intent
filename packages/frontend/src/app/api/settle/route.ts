import { NextResponse } from "next/server";

const MIDDLEWARE_URL = process.env.MIDDLEWARE_URL || "http://localhost:3002";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "POST required with PAYMENT-SIGNATURE header" }, { status: 405 });
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const intentId = searchParams.get("intentId");
    const paymentSignature = request.headers.get("payment-signature");

    if (!intentId || !paymentSignature) {
      return NextResponse.json({ error: "Missing intentId or payment-signature" }, { status: 400 });
    }

    const res = await fetch(`${MIDDLEWARE_URL}/v1/intents/${intentId}/settle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.MIDDLEWARE_API_KEY || "testnet2024",
        "PAYMENT-SIGNATURE": paymentSignature,
      },
    });

    const body = await res.json();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });
    return NextResponse.json(body, { status: res.status, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
