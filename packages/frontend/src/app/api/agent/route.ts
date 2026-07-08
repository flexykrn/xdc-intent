import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL = "llama-3.1-8b-instant";

const APOTHEM_TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

const SYSTEM_PROMPT = `You are an intent-parsing assistant for a cross-chain intent protocol.

Supported chains (use chainId numbers):
- XDC Apothem: 51
- Sepolia: 11155111
- Arbitrum Sepolia: 421614

Available tokens (all 18 decimals):
- MockUSDC (MUSDC) on Apothem: ${APOTHEM_TOKENS.mockUSDC}
- MockXDC (MXDC) on Apothem: ${APOTHEM_TOKENS.mockXDC}
- For Sepolia/Arbitrum Sepolia, USDC and XDC placeholders are accepted; use the token symbol the user mentions.

The user will describe a swap or bridge in plain English, including source and destination chain names when relevant. Return ONLY a JSON object with this exact shape:
{
  "inputToken": "0x... or symbol",
  "inputAmount": "10",
  "outputToken": "0x... or symbol",
  "minDestAmount": "190",
  "maxSolverFee": "1",
  "sourceChainId": 51,
  "destChainId": 51,
  "reasoning": "short explanation"
}

Infer sourceChainId and destChainId from phrases like "on Sepolia", "to Arbitrum Sepolia", "from Sepolia to Arbitrum Sepolia", "on Apothem". Default both to 51 (Apothem) if no chain is mentioned.

Amounts are raw human-readable token amounts (we will multiply by 10^18). Be conservative: minDestAmount should be ~95% of the expected output given the fixed rate 1 MUSDC = 20 MXDC on Apothem. maxSolverFee should be small, e.g. 1 MXDC or 0.5 USDC. If the request is unclear, return { "error": "..." }.`;

interface Quote { solverAddress: string; outputAmount: string; feeBps: number; }

function normalizeResult(result: Record<string, unknown>) {
  const inputTokenRaw = String(result.inputToken || APOTHEM_TOKENS.mockUSDC).toLowerCase();
  const outputTokenRaw = String(result.outputToken || APOTHEM_TOKENS.mockXDC).toLowerCase();
  const inputToken = inputTokenRaw.startsWith("0x") ? inputTokenRaw : APOTHEM_TOKENS.mockUSDC;
  const outputToken = outputTokenRaw.startsWith("0x") ? outputTokenRaw : APOTHEM_TOKENS.mockXDC;
  const inputAmount = Math.max(0, parseFloat(String(result.inputAmount || "0")));
  let minDestAmount = parseFloat(String(result.minDestAmount || "0"));
  let maxSolverFee = parseFloat(String(result.maxSolverFee || "1"));
  const sourceChainId = Number(result.sourceChainId || 51);
  const destChainId = Number(result.destChainId || 51);

  const rate = inputToken === APOTHEM_TOKENS.mockUSDC.toLowerCase() && outputToken === APOTHEM_TOKENS.mockXDC.toLowerCase() ? 20 : 1;
  const expectedOutput = inputAmount * rate;
  const conservativeMin = expectedOutput * 0.95;

  if (!Number.isFinite(minDestAmount) || minDestAmount > conservativeMin) {
    minDestAmount = conservativeMin;
  }
  if (!Number.isFinite(maxSolverFee) || maxSolverFee > expectedOutput * 0.05) {
    maxSolverFee = Math.min(1, expectedOutput * 0.01);
  }

  return {
    inputToken,
    inputAmount: inputAmount.toString(),
    outputToken,
    minDestAmount: minDestAmount.toString(),
    maxSolverFee: maxSolverFee.toString(),
    sourceChainId,
    destChainId,
    reasoning: String(result.reasoning || "Normalized swap intent"),
  };
}
function parseLocally(prompt: string) {
  const lower = prompt.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|musdc)/);
  if (!match) {
    return { error: "Could not parse amount. Try: 'swap 10 USDC for XDC'" };
  }
  const inputAmount = parseFloat(match[1]);
  const expectedOutput = inputAmount * 20;
  const minDestAmount = expectedOutput * 0.95;

  let sourceChainId = 51;
  let destChainId = 51;
  if (lower.includes("sepolia") && lower.includes("arbitrum")) {
    if (lower.indexOf("from sepolia") !== -1) {
      sourceChainId = 11155111;
      destChainId = 421614;
    } else {
      sourceChainId = 421614;
      destChainId = 11155111;
    }
  } else if (lower.includes("sepolia")) {
    sourceChainId = 11155111;
    destChainId = 421614;
  } else if (lower.includes("arbitrum")) {
    sourceChainId = 421614;
    destChainId = 11155111;
  }

  return normalizeResult({
    inputToken: APOTHEM_TOKENS.mockUSDC,
    inputAmount: inputAmount.toString(),
    outputToken: APOTHEM_TOKENS.mockXDC,
    minDestAmount: minDestAmount.toString(),
    maxSolverFee: "1",
    sourceChainId,
    destChainId,
    reasoning: `Local fallback: swap ${inputAmount} MUSDC for ~${expectedOutput} MXDC at 1:20 rate, requiring at least ${minDestAmount} MXDC.`,
  });
}

async function callGemini(prompt: string) {
  if (!GEMINI_API_KEY) return null;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
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
  if (!response.ok) return null;
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

async function callGroq(prompt: string) {
  if (!GROQ_API_KEY) return null;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  return text ? JSON.parse(text) : null;
}

async function explainWithGemini(intentId: string, quotes: Quote[]) {
  if (!GEMINI_API_KEY) return null;
  const userPrompt = `Explain this solver quote competition in one friendly sentence for a non-technical user. Intent ${intentId}. Quotes:\n${JSON.stringify(quotes, null, 2)}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

async function explainWithGroq(intentId: string, quotes: Quote[]) {
  if (!GROQ_API_KEY) return null;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: "Explain solver quote competition in one friendly sentence for a non-technical user. Return JSON with key 'explanation'.",
        },
        {
          role: "user",
          content: `Intent ${intentId}. Quotes:\n${JSON.stringify(quotes, null, 2)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  return text ? JSON.parse(text) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, quotes, mode = "parse" } = body;

    if (mode === "explain" && quotes) {
      let result = await explainWithGroq(body.intentId || "", quotes as Quote[]);
      if (!result) result = await explainWithGemini(body.intentId || "", quotes as Quote[]);
      if (!result) {
        const best = [...(quotes as Quote[])].sort((a, b) => Number(BigInt(b.outputAmount) - BigInt(a.outputAmount)))[0];
        result = {
          explanation: `${best?.solverAddress || "A solver"} offered the best quote of ${best ? Number(best.outputAmount) / 1e18 : "?"} MXDC.`,
        };
      }
      return NextResponse.json({ result });
    }

    let result = await callGroq(prompt);
    if (!result) result = await callGemini(prompt);
    if (!result) result = parseLocally(prompt);

    return NextResponse.json({ result: normalizeResult(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
