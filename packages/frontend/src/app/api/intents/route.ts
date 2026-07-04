import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);

    const filter = registry.filters.IntentSubmitted();
    const events = await registry.queryFilter(filter, -2000);
    const ids = Array.from(new Set(events.map((e: any) => e.args.intentId)));

    const intents = await Promise.all(
      ids.map(async (id) => {
        try {
          const i = await registry.getIntent(id);
          return {
            intentId: i.intentId,
            user: i.user,
            sourceToken: i.sourceToken,
            sourceAmount: i.sourceAmount.toString(),
            destToken: i.destToken,
            minDestAmount: i.minDestAmount.toString(),
            maxSolverFee: i.maxSolverFee.toString(),
            expiry: Number(i.expiry),
            status: Number(i.status),
            solver: i.solver,
            fulfilledAmount: i.fulfilledAmount.toString(),
          };
        } catch {
          return null;
        }
      })
    );

    const filtered = user
      ? intents.filter((i): i is NonNullable<typeof i> => i !== null && i.user.toLowerCase() === user.toLowerCase())
      : intents.filter((i): i is NonNullable<typeof i> => i !== null);

    return NextResponse.json({ intents: filtered });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, intents: [] }, { status: 500 });
  }
}
