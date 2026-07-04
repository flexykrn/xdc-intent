# XDC Intent Framework — Runbook

## Overview
This runbook covers operating the XDC Intent Framework on XDC Apothem testnet.

## Deployed Contracts (Apothem Testnet)

| Contract | Address | Sourcify |
|---|---|---|
| Escrow | `0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288` | https://repo.sourcify.dev/contracts/full_match/51/0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288/ |
| PaymentVerifier | `0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6` | https://repo.sourcify.dev/contracts/full_match/51/0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6/ |
| IntentRegistry | `0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4` | https://repo.sourcify.dev/contracts/full_match/51/0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4/ |
| SolverRegistry | `0xC4db3B088781431ea29201BaF931FD4B731F3B91` | — |
| MockUSDC | `0x86530A99784D188e8343e119140114d9e5fD0546` | — |
| MockXDC | `0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312` | — |

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

## Quick Start

### One-command demo (PowerShell)
```powershell
.\scripts\demo.ps1
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

# Terminal 4 — Two-solver quote competition E2E
cd packages/contracts
npx hardhat run scripts/e2e-quote-competition.ts --network apothem
```

### Frontend
```bash
npm run build -w frontend
npm run dev -w frontend
```
Open http://localhost:3000/market to browse open intents and competing quotes, or http://localhost:3000/agent-demo for the x402 agent payment flow.

## Health Checks

| Service | Endpoint |
|---|---|
| Middleware | `http://localhost:3002/health` |
| Solver A | `http://localhost:3001/health` |
| Solver A metrics | `http://localhost:3001/metrics` |
| Solver B | `http://localhost:3003/health` |
| Solver B metrics | `http://localhost:3003/metrics` |
| Frontend market | `http://localhost:3000/market` |
| Frontend API stats | `http://localhost:3000/api/stats` |

## Verification Commands

```bash
# Contract tests
cd packages/contracts
npx hardhat test

# Static analysis
npm run slither

# Package builds
npm run build -w @xdc-intent/sdk
npm run build -w @xdc-intent/middleware
npm run build -w @xdc-intent/solver
npm run build -w @xdc-intent/solver-b
npm run build -w frontend

# Two-solver quote competition E2E
cd packages/contracts
npx hardhat run scripts/e2e-quote-competition.ts --network apothem
```

## Demo Transaction History

| Run | Intent ID | Winner | Fulfilled Amount | Payment Tx |
|---|---|---|---|---|
| Two-solver competition (2026-07-04) | `0xb7a184200e91345077919a060e3011c7eb2ddca6f58dd7c6e5ac11bd5f13d49a` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `2197.8` MXDC | `0x37feb75ac38a91b23e7bf8bb6129dab36e322922ace340e604a7f76056d291b2` |

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

1. Stop middleware, solvers, and frontend (Ctrl+C or kill node processes).
2. Solver state is persisted to `packages/solver/data/solver-state.json` and `packages/solver-b/data/solver-state.json`.
3. Start middleware, then solvers, then frontend dev server.
4. Solvers will resume from the last processed block and re-evaluate any pending intents.

## Security Notes

- `PaymentVerifier.registerFacilitator` is `onlyOwner`. Do not expose the owner key.
- `.env` files are gitignored; never commit keys.
- This is a testnet deployment. Before mainnet, conduct a full audit.
