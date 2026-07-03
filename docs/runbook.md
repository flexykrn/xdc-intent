# XDC Intent Framework — Runbook

## Overview
This runbook covers operating the XDC Intent Framework on XDC Apothem testnet.

## Deployed Contracts (Apothem Testnet)

| Contract | Address | Sourcify |
|---|---|---|
| Escrow | `0x972E97d4898AfDF642627C3E05b105fCAc3F84D4` | https://repo.sourcify.dev/contracts/full_match/51/0x972E97d4898AfDF642627C3E05b105fCAc3F84D4/ |
| PaymentVerifier | `0xf15AE12caF60fFA09CAcd6f823187aDC2fe4AeC6` | https://repo.sourcify.dev/contracts/full_match/51/0xf15AE12caF60fFA09CAcd6f823187aDC2fe4AeC6/ |
| IntentRegistry | `0x443Ba13baE4D122430737B72eA90E821F3C015Dc` | https://repo.sourcify.dev/contracts/full_match/51/0x443Ba13baE4D122430737B72eA90E821F3C015Dc/ |
| MockUSDC | `0xa3f37BBd132C6DA9088B4A63622CacbCBee394A4` | — |
| MockXDC | `0x6DC37E3ca98E49e923E953c5A7229726513eaf6E` | — |

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

# Terminal 2 — Solver
npm run build -w @xdc-intent/solver
npm start -w @xdc-intent/solver

# Terminal 3 — Auto end-to-end test
cd packages/contracts
npx hardhat run scripts/e2e-apothem-auto.ts --network apothem
```

### Frontend
```bash
npm run build -w frontend
npm run dev -w frontend
```
Open http://localhost:3000, connect MetaMask/XDC Pay on Apothem, create an intent.

## Health Checks

| Service | Endpoint |
|---|---|
| Middleware | `http://localhost:3002/health` |
| Solver | `http://localhost:3001/health` |
| Solver metrics | `http://localhost:3001/metrics` |
| Frontend API stats | `http://localhost:3000/api/stats` |

## Verification Commands

```bash
# Contract tests
cd packages/contracts
npx hardhat test test/IntentRegistry.ts test/SmokeTest.ts

# Static analysis
npm run slither

# Package builds
npm run build -w @xdc-intent/sdk
npm run build -w @xdc-intent/middleware
npm run build -w @xdc-intent/solver
npm run build -w @xdc-intent/bridge
npm run build -w frontend

# Auto E2E
cd packages/contracts
npx hardhat run scripts/e2e-apothem-auto.ts --network apothem
```

## Troubleshooting

### "Escrow: token not allowed"
The source token is not in the Escrow allowlist. Use MockUSDC/MockXDC addresses from this runbook, or add the token via `escrow.addAllowedToken(token)`.

### "PaymentVerifier: not facilitator"
The caller of `verifyPayment` is not registered. Only the contract owner can register facilitators via `registerFacilitator`.

### Solver cannot connect to WebSocket
Apothem RPC does not support WebSocket. The solver automatically falls back to HTTP polling.

### Solver "transfer amount exceeds balance"
The solver wallet needs MockUSDC to pay the facilitator. Mint/transfer MockUSDC to the solver address.

### Intent not fulfilled
1. Check solver logs for evaluation decision.
2. Check middleware `/health`.
3. Verify intent is open via `IntentRegistry.getIntent(intentId)`.
4. Verify solver has funds and is an allowed solver for the intent.

## Restart Procedure

1. Stop middleware and solver (Ctrl+C).
2. Solver state is persisted to `packages/solver/data/solver-state.json`.
3. Start middleware, then solver.
4. Solver will resume from the last processed block and re-evaluate any pending intents.

## Security Notes

- `PaymentVerifier.registerFacilitator` is `onlyOwner`. Do not expose the owner key.
- `.env` files are gitignored; never commit keys.
- This is a testnet deployment. Before mainnet, conduct a full audit.
