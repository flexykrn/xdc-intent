import { NextResponse } from "next/server";
import { ethers } from "ethers";

const ROUTER_ADDRESS = "0xc8B08Ac4CDa23A3737Fe7D0C4BD94d58F0fEfa0c";
const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
];

const RPC_URL = process.env.RPC_URL || "https://rpc.apothem.network";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromToken = searchParams.get("fromToken");
    const toToken = searchParams.get("toToken");
    const amount = searchParams.get("amount");

    if (!fromToken || !toToken || !amount) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);

    const decimals = fromToken.toLowerCase() === "0x86530a99784d188e8343e119140114d9e5fd0546" ? 6 : 18;
    const amountIn = BigInt(Math.floor(parseFloat(amount) * 10 ** decimals));

    const amounts = await router.getAmountsOut(amountIn, [fromToken, toToken]);
    return NextResponse.json({ outputAmount: amounts[1].toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
