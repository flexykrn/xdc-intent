import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const APOTHEM_TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

const SYSTEM_PROMPT = `You are an intent-parsing assistant for a cross-chain intent protocol on XDC Apothem testnet.

Available tokens (all 18 decimals):
- MockUSDC (MUSDC): ${APOTHEM_TOKENS.mockUSDC}
- MockXDC (MXDC): ${APOTHEM_TOKENS.mockXDC}

The user will describe a swap in plain English. Return ONLY a JSON object with this exact shape:
{
  "inputToken": "0x...",
  "inputAmount": "10",
  "outputToken": "0x...",
  "minDestAmount": "190",
  "maxSolverFee": "1",
  "reasoning": "short explanation"
}

Amounts are raw human-readable token amounts (we will multiply by 10^18). Be conservative: minDestAmount should be ~95% of the expected output given the fixed rate 1 MUSDC = 20 MXDC. maxSolverFee should be small, e.g. 1 MXDC. If the request is unclear, return { "error": "..." }.`;

function parseLocally(prompt: string) {
  const lower = prompt.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|musdc)/);
  if (!match) {
    return { error: "Could not parse amount. Try: 'swap 10 USDC for XDC'" };
  }
  const inputAmount = parseFloat(match[1]);
  const expectedOutput = inputAmount * 20;
  const minDestAmount = expectedOutput * 0.95;
  return {
    inputToken: APOTHEM_TOKENS.mockUSDC,
    inputAmount: inputAmount.toString(),
    outputToken: APOTHEM_TOKENS.mockXDC,
    minDestAmount: minDestAmount.toString(),
    maxSolverFee: "1",
    reasoning: `Local fallback: swap ${inputAmount} MUSDC for ~${expectedOutput} MXDC at 1:20 rate, requiring at least ${minDestAmount} MXDC.`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, quotes, mode = "parse" } = body;

interface Quote { solverAddress: string; outputAmount: string; feeBps: number; }

    if (mode === "explain" && quotes) {
      if (!GEMINI_API_KEY) {
        const best = [...(quotes as Quote[])].sort((a, b) => Number(BigInt(b.outputAmount) - BigInt(a.outputAmount)))[0];
        return NextResponse.json({
          result: {
            explanation: `${best?.solverAddress || "A solver"} offered the best quote of ${best ? Number(best.outputAmount) / 1e18 : "?"} MXDC.`,
          },
        });
      }

      const userPrompt = `Explain this solver quote competition in one friendly sentence for a non-technical user. Intent ${body.intentId || ""}. Quotes:\n${JSON.stringify(quotes, null, 2)}`;
      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return NextResponse.json({ result: JSON.parse(text || '{"explanation":"Quotes received."}') });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ result: parseLocally(prompt) });
    }

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "OK, I will return only the JSON object." }] },
          { role: "user", parts: [{ text: prompt }] },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Gemini API error: ${err}` }, { status: 502 });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json({ error: "Empty response from Gemini" }, { status: 502 });
    }

    return NextResponse.json({ result: JSON.parse(text) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
