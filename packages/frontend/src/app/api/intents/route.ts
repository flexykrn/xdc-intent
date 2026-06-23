import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");

    if (!user) {
      return NextResponse.json({ error: "User address required" }, { status: 400 });
    }

    const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
    const intentIds = await registry.getUserIntents(user);

    const intents = await Promise.all(
      intentIds.map(async (id: string) => {
        try {
          const intent = await registry.getIntent(id);
          return {
            id,
            creator: intent[1],
            token: intent[3],
            amount: ethers.formatEther(intent[4]),
            status: Number(intent[7]),
          };
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({ intents: intents.filter(Boolean) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
