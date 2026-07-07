# XDC Intent Framework — Runbook

## Overview
This runbook covers operating the XDC Intent Framework on XDC Apothem testnet.

## Deployed Contracts (Apothem Testnet)

| Contract | Address |
|---|---|
| IntentRegistry | `0x441f5e07E6FC807E73454B4318ba487e05e65625` |
| Escrow | `0x5c6fb5D7E81e11C303e5cE00fBE7AE748a47690d` |
| PaymentVerifier | `0x6Ce223bD961217917aa16654E77A6A440f35A70A` |
| SolverRegistry | `0x4F87a92E3950ec53AFC1776F14Af33c6E9aab360` |
| MockBridge | `0xB494122Fb840D928d0f0F98E69985a85E9EBC139` |
| MockUSDC | `0x86530A99784D188e8343e119140114d9e5fD0546` |
| MockXDC | `0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312` |
| SimpleDEXFactory | `0x342d081a46F0E26602c6547718a21b37825E9782` |
| SimpleDEXRouter | `0xc8B08Ac4CDa23A3737Fe7D0C4BD94d58F0fEfa0c` |
| SimpleDEX Pair | `0xE73bAAd441069fAE0181cd1A94f7DCa4f9A18161` |

Explorer: https://testnet.xdcscan.com

## Environment Setup

1. Copy root `.env.example` to `.env` and fill:
   - `DEPLOYER_PRIVATE_KEY`
   - `SOLVER_PRIVATE_KEY`
   - `XDC_TESTNET_RPC`
2. Copy `.env` values into:
   - `packages/contracts/.env`
   - `packages/middleware/.env`
   - `packages/solver/.env`
   - `packages/solver-b/.env`

## Quick Start

### One-command demo
```bash
npm run demo
```
This starts middleware, Solver A, Solver B, and the frontend in parallel.

### Bridge keeper (cross-chain simulation)
The keeper watches `BridgeOut` events on `MockBridge` and calls `mintOnDest` to simulate tokens arriving on the destination chain. It must be run from the deployer/owner key.

```bash
cd packages/contracts
MOCK_BRIDGE_ADDRESS=0xB494122Fb840D928d0f0F98E69985a85E9EBC139 npx hardhat run scripts/bridge-keeper.ts --network apothem
```

### Manual startup

```bash
# Terminal 1 — Middleware
npm run build -w @xdc-intent/middleware
npm start -w @xdc-intent/middleware

# Terminal 2 — Solver A
npm run build -w @xdc-intent/solver
npm start -w @xdc-intent/solver

# Terminal 3 — Solver B (competition)
npm run build -w @xdc-intent/solver-b
npm start -w @xdc-intent/solver-b

# Terminal 4 — Frontend
npm run dev -w frontend
```

## Frontend Pages

| Page | URL | Purpose |
|---|---|---|
| Dashboard | http://localhost:3000/dashboard | Protocol stats, recent intents, testnet faucet, quick actions |
| Create Intent | http://localhost:3000/create | Step-by-step swap wizard with live DEX estimate |
| Market | http://localhost:3000/market | Browse open intents and competing solver quotes |
| My Intents | http://localhost:3000/my-intents | Track your intents, detail drawer, status timeline, bridge status |
| AI Agent Demo | http://localhost:3000/agent-demo | Chat interface that parses swaps and watches fulfillment |

Data on Dashboard, Market, and My Intents refreshes automatically every 3–10 seconds via SWR polling.

## Testnet Faucet

The Dashboard includes an in-app faucet. Click **Mint 1000** next to MUSDC or MXDC to mint free test tokens directly from the `MockERC20` contracts. No external faucet is required.

## Health Checks

| Service | Endpoint |
|---|---|
| Middleware | `http://localhost:3002/health` |
| Solver A | `http://localhost:3001/health` |
| Solver A metrics | `http://localhost:3001/metrics` |
| Solver B | `http://localhost:3003/health` |
| Solver B metrics | `http://localhost:3003/metrics` |
| Frontend API stats | `http://localhost:3000/api/stats` |

## Verification Commands

```bash
# Run everything
npm run lint
npm run typecheck
npm run test
npm run build

# Contract tests
cd packages/contracts
npx hardhat test

# Two-solver quote competition E2E
cd packages/contracts
npx hardhat run scripts/e2e-quote-competition.ts --network apothem

# Cross-chain E2E
cd packages/contracts
npx hardhat run scripts/e2e-cross-chain.ts --network apothem
```

## Demo Transaction History

| Run | Intent ID | Winner | Fulfilled Amount | Payment Tx | Bridge Mint Tx |
|---|---|---|---|---|---|
| Two-solver competition (2026-07-06) | `0x97e290cb...f1525a7d` | `0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe` | `1974.32` MXDC | — | — |
| Cross-chain (2026-07-06) | `0xe921dac5...4133a219` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `198.21` MXDC | — | — |
| AI agent demo (2026-07-06) | `0xbe165976f566fc509aae1a382347d218edd2c10e5623869b3a40828e15af5939` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `219.78` MXDC | `0x9465e9b4228f71361f3051c4d7096212614dfa6c8169a6f2adc8e0496a3423e5` | — |
| Cross-chain (2026-07-07) | `0x247a2a3d...b4554951` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `199.00` MXDC | `0x72094194...2f0efa4f` | `0x3d19ed9d...76648f7` |

## AI Agent Demo

The agent demo at `/agent-demo` lets a user type a natural-language swap request. An LLM (Groq `llama-3.1-8b-instant`, with Gemini fallback) parses it into intent parameters, or a local regex fallback is used when no API key is configured.

### Setup

1. Add API keys to `packages/frontend/.env.local`:
   ```bash
   GROQ_API_KEY=your_key_here
   GEMINI_API_KEY=your_key_here
   ```
2. Without keys, simple prompts like "swap 10 USDC for XDC" are parsed locally.
3. Start the demo stack:
   ```bash
   npm run demo
   ```
4. Open http://localhost:3000/agent-demo, connect a wallet, and run the flow.

### Flow

1. **Describe swap** — LLM/local parser returns `inputToken`, `inputAmount`, `outputToken`, `minDestAmount`, `maxSolverFee`.
2. **Create intent** — Frontend approves the Escrow to spend MockUSDC and calls `IntentRegistry.submitIntent`.
3. **Quote competition** — Solvers A and B submit off-chain quotes to the middleware.
4. **Wait for fulfillment** — The best quote wins, the solver pays the middleware via x402 EIP-3009, and `IntentRegistry.fulfillIntent` is called on-chain.

## Troubleshooting

### "Escrow: token not allowed"
The source token is not in the Escrow allowlist. Use MockUSDC/MockXDC addresses from this runbook, or add the token via `escrow.addAllowedToken(token)`.

### "PaymentVerifier: not facilitator"
The caller of `verifyPayment` is not registered. Only the contract owner can register facilitators via `registerFacilitator`.

### Solver cannot connect to WebSocket
Apothem RPC does not support WebSocket. The solver automatically falls back to HTTP polling.

### Solver "insufficient funds for intrinsic transaction cost"
The solver wallet needs Apothem XDC for gas. Fund both solver wallets:
```bash
cd packages/contracts
npx hardhat run scripts/fund-solver-gas.ts --network apothem
```

### Solver "transfer amount exceeds balance" during settlement
The solver wallet needs the payment token (usually MockXDC) to pay the middleware facilitator fee. Mint/transfer MockXDC to the winning solver address.

### Settlement fails with `invalid_signature`
The EIP-3009 signature domain must match the token's `name()` and EIP-712 version. Ensure the middleware returns `tokenName`/`tokenVersion` in the x402 `accepts[].extra` object and the solver uses them when signing.

### Duplicate solver quotes / "settlement_failed"
Only one instance of each solver should be running. Kill all node processes and restart cleanly:
```powershell
Get-Process -Name node | ForEach-Object { Stop-Process -Id $_.Id -Force }
```

### Intent not fulfilled
1. Check solver logs for evaluation decision.
2. Check middleware `/health` and `/v1/metrics`.
3. Verify intent is open via `IntentRegistry.getIntent(intentId)`.
4. Verify solvers are registered via `SolverRegistry.isRegistered(solver)`.
5. Verify the middleware signer is registered as a PaymentVerifier facilitator.

## Restart Procedure

1. Stop the demo (`Ctrl+C` once if using `npm run demo`).
2. Solver state is persisted to `packages/solver/data/solver-state.json` and `packages/solver-b/data/solver-state.json`.
3. Start again with `npm run demo`.
4. Solvers will resume from the last processed block and re-evaluate any pending intents.

## Security Notes

- `PaymentVerifier.registerFacilitator` is `onlyOwner`. Do not expose the owner key.
- `.env` files are gitignored; never commit keys.
- This is a testnet deployment. Before mainnet, conduct a full audit.
