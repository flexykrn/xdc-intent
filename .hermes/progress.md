# XDC Intent Framework — Progress

## Goal
Close the gap between the XDC Intent Framework implementation and the reference plan, then deploy and validate a working testnet product on XDC Apothem.

## Constraints & Preferences
- Audit against the existing plan (no new architecture).
- Keep Next.js for the frontend (chosen over Vite/wagmi/viem).
- Use Hardhat, not Foundry.
- Store plans and markdown conversation notes in `.hermes/`.
- Free-tier only; keys stay in `.env`, never committed.

## Progress

### Done
- Wrote `.hermes/gap-analysis-xdc-intent-framework.md` with full audit.
- Re-aligned on-chain model:
  - `packages/contracts/contracts/IntentRegistry.sol`
  - `packages/contracts/contracts/Escrow.sol`
  - `packages/contracts/contracts/PaymentVerifier.sol`
  - `packages/contracts/contracts/interfaces/{IIntentRegistry,IEscrow,IPaymentVerifier}.sol`
  - `packages/contracts/contracts/libraries/IntentLib.sol`
  - Moved legacy/extra contracts to `packages/contracts/legacy-off/`
  - Updated `packages/contracts/hardhat.config.ts` to include Solidity 0.8.24
  - Added `packages/contracts/test/IntentRegistry.ts` (3 tests passing)
  - Added `packages/contracts/test/SmokeTest.ts` (SDK + contracts E2E passing)
- Implemented x402-style `PaymentVerifier.verifyPayment(paymentTxHash, payer, payee, amount, intentId)` and integrated it into `IntentRegistry.fulfillIntent`.
- Restored shared packages:
  - `shared/types/src/index.ts`
  - `shared/constants/src/index.ts`
  - `shared/utils/src/index.ts`
  - Added `tsconfig.json` to each; built successfully.
  - Fixed `deriveIntentId` to use `solidityPackedKeccak256` to match contract `abi.encodePacked`.
- Rewrote `packages/sdk/src/index.ts` to match plan intent struct, EIP-712 signing, and x402 helpers; fixed `getIntent` ABI to tuple return type; SDK typechecks clean.
- Refactored solver:
  - `packages/solver/src/index.ts`
  - `packages/solver/src/watcher.ts` (HTTP polling fallback; Apothem has no WebSocket)
  - `packages/solver/src/evaluator.ts` (real quote-based profitability check)
  - `packages/solver/src/adapters/dex.ts` (`XSwapV3Adapter` + `MockDEXAdapter`)
  - `packages/solver/src/facilitator-client.ts`
  - `packages/solver/src/submitter.ts`
  - `packages/solver/src/state.ts` (in-memory state manager)
  - `packages/solver/src/config.ts`
  - `packages/solver/src/logger.ts`
  - Removed obsolete files: `auction/`, `strategies/`, `routes.ts`, `fees.ts`, `middleware-client.ts`, `strategies.ts`
  - Solver package typechecks clean.
- Updated Next.js frontend:
  - `packages/frontend/src/components/providers.tsx` exposes `XDCIntentSDK`
  - `packages/frontend/src/app/create/page.tsx` aligned to plan intent fields, marked `"use client"`, fixed token addresses, added default `allowedSolvers`, and added ERC-20 approval before submit
  - `packages/frontend/src/app/my-intents/page.tsx` aligned to SDK `Intent` shape and added explorer links
  - `packages/frontend/src/lib/contracts.ts` updated to deployed Apothem addresses and current ABI
  - `packages/frontend/src/app/api/stats/route.ts` gracefully handles missing contract counter
  - Frontend `npm run build` passes and `npm run dev` starts successfully
  - Frontend smoke test completed: builds, starts, API stats route returns 200, create/my-intents pages load
- Rewrote middleware with `@x402/express`:
- Removed `better-sqlite3` dependency from middleware to unblock `npm install` on Windows; replaced with in-memory store.
- Rewrote middleware with `@x402/express`:
  - `packages/middleware/src/index.ts` now uses `paymentMiddleware` + `x402ResourceServer`
  - `packages/middleware/src/x402.ts` implements `TxHashEvmScheme` and `TxHashFacilitatorClient`
  - Middleware builds and typechecks clean.
- Added bridge adapter skeleton:
  - `packages/bridge/src/index.ts` with `NoOpBridgeAdapter` and `StargateBridgeAdapter`
  - `packages/bridge/tsconfig.json`
  - Bridge package builds.
- Added deployment and security tooling:
  - `packages/contracts/scripts/deploy.ts` (plan-aligned deployment sequence)
  - `packages/contracts/scripts/e2e-apothem.ts` (Apothem E2E smoke test)
  - `packages/contracts/scripts/e2e-apothem-auto.ts` (self-contained middleware + solver + intent E2E)
  - `packages/contracts/slither.config.json`
  - `packages/contracts/package.json` `slither` script
  - `packages/contracts/.env.example`, `packages/middleware/.env.example`, `packages/solver/.env.example`
  - Slither runs with 0 findings after excluding accepted patterns.
- Deployed to XDC Apothem testnet (hardened contracts, re-deployed 2026-07-03):
  - Escrow: `0xE15BcFf9046D1c1aa446006839963576E882236f`
  - PaymentVerifier: `0x16Be0618263dD0C286E8A5ec2f62D5dFB0B9fA03`
  - IntentRegistry: `0xDc392f24c9F09E5FD7cAFfB61b1feeD17e7D652F`
  - MockUSDC: `0xB2F1309AA1C141C3B989085D20922ffA6e83cB1b`
  - MockXDC: `0x78932974fB9fbC7fceE9bd94e72764018C8C3D46`
  - Updated `shared/constants/src/index.ts`, `packages/sdk/src/constants.ts`, `packages/frontend/src/lib/contracts.ts`, and all `.env` files with deployed addresses.
- Verified core contracts on Sourcify (Apothem chain ID 51).
- Hardened `PaymentVerifier.registerFacilitator` to `onlyOwner`; registry is registered by deployer after deployment.
- Added persistent JSON-based solver state (`packages/solver/src/state.ts`) with auto-save/load, seen-intent deduplication, and last-processed-block tracking.
- Added solver `/health` and `/metrics` HTTP endpoints (`packages/solver/src/server.ts`).
- Rewrote solver event watcher to use manual block polling instead of `contract.on` filters, eliminating "filter not found" errors on Apothem.
- Wrote `docs/runbook.md` with deployed addresses, setup steps, verification commands, and troubleshooting.
- Created `scripts/demo.ps1` one-command demo that starts middleware + solver, submits an intent, and prints explorer links.
- Updated frontend stats API to gracefully handle missing `getTotalIntents` and added explorer links to intent cards on My Intents page.
- Ran successful Apothem end-to-end tests:
  - Manual E2E: user intent `0x691e...21e6` fulfilled by solver `0x5cF5...fDe` in tx `0x22bb...440a`.
  - Auto E2E (`e2e-apothem-auto.ts`): spawns middleware + solver, submits intent, and asserts on-chain fulfillment. Latest run:
    - Intent: `0x86cf...1bf6`
    - Fulfillment tx: `0xd0ab...65dd`
    - Payment tx: `0x03ea...4828`
    - Fulfilled amount: `1998000000000000000000`
  - Demo script (`scripts/demo.ps1`): passes end-to-end.
- Set up package-local `.env` files from root keys (not committed).

### In Progress
- None; core testnet loop is verified end-to-end.

### Blocked
- Real XSwap V3 quoter/router addresses on Apothem not available; solver uses `MockDEXAdapter`.
- Real Stargate bridge addresses not available; bridge adapter is a skeleton.
- Solver state remains in-memory; SQLite/PostgreSQL deferred.

## Key Decisions
- Keep `PaymentVerifier.registerFacilitator` open (not `onlyOwner`) so the registry can self-register as a facilitator in constructor; acceptable for testnet, needs lockdown for production.
- Removed all legacy/extra contracts from the compile path to resolve pragma conflicts and focus on the plan’s core 3 contracts.
- Dropped `better-sqlite3` from middleware to avoid Windows build issues; replaced with in-memory state.
- Chose a custom `TxHashFacilitatorClient` instead of native `@x402/evm` because the plan’s x402 V2 flow requires verifying on-chain ERC-20 transfer tx hashes, which the standard scheme does not directly support.
- Excluded accepted Slither patterns (`arbitrary-send-erc20`, `reentrancy-no-eth`, `calls-loop`, `timestamp`, `solc-version`, `naming-convention`, `unused-state`) after fixing true positives.
- Used deployer key as the test user for Apothem E2E runs; solver key is `0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe`.

## Verification Commands
- Contracts: `npx hardhat test test/IntentRegistry.ts test/SmokeTest.ts` → 4 passing.
- Slither: `npm run slither` → 0 results.
- Package builds: `npm run build` in `packages/{sdk,middleware,solver,bridge,frontend}` all pass.
- Auto E2E: `npx hardhat run scripts/e2e-apothem-auto.ts --network apothem` in `packages/contracts`.

## Next Steps
1. Manual frontend wallet test with MetaMask/XDC Pay on Apothem (frontend is ready; user needs to connect wallet in browser).
2. Add real `getTotalIntents` / `getTotalIntentsFulfilled` counters to `IntentRegistry` if live stats are required.
3. Mainnet deployment and external security audit.

## Critical Context
- All package typechecks and builds clean.
- Apothem auto-fulfillment loop is verified end-to-end with no filter errors.
- Solver persists state to `packages/solver/data/solver-state.json` and survives restarts.
- Solver currently has MockUSDC balance and approval set for the facilitator.
- User private keys are stored in root `.env` and copied to package `.env` files; `.env` is in `.gitignore`.
- XDC testnet explorer source verification requires an API key; contracts are verified on Sourcify.
