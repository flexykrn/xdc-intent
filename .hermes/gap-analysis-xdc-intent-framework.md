# Gap Analysis — XDC Intent Framework implementation vs plan

Reference plan: [Intent-Based Trading Framework on XDC Network — Improved Implementation Plan](https://docs.google.com/document/d/1Ch30XYBnYoGmtjXRZFJ6mE0W7NhEMbnO/edit?usp=sharing)

Date: 2026-07-02

---

## 1. Current repository structure

```
C:\Users\karan\Desktop\openscans\xdc-intent
├── packages/
│   ├── contracts/          # Hardhat + 47 Solidity files (extra contracts present)
│   ├── sdk/                # ethers.js SDK (2 source files)
│   ├── solver/             # Node.js solver engine
│   ├── middleware/         # Express "facilitator" (custom, not x402)
│   ├── frontend/           # Next.js app (not Vite/wagmi)
│   ├── bridge/             # package.json only, no source
│   ├── dex/                # Simple Uniswap-V2-like DEX contracts
│   └── subgraph/           # The Graph subgraph (extra)
├── shared/                 # Empty packages (types/constants/utils)
├── package.json            # npm workspaces + turbo (plan calls for pnpm)
└── turbo.json
```

Key structural deviations from the plan:
- The plan expects `packages/{contracts,sdk,solver,frontend,shared}` plus a cross-chain bridge adapter **inside the solver**. The repo has extra packages (`bridge`, `dex`, `middleware`, `subgraph`) and the bridge package has no source.
- The plan calls for `pnpm` workspaces; the repo uses npm workspaces (`workspaces: ["packages/*", "shared/*"]` in `package.json:5`).
- `shared/types`, `shared/constants`, `shared/utils` contain only `package.json` — no exported types/constants as required by the plan and imported by `sdk/package.json`.

---

## 2. Component-by-component status

### 1. Intent Registry

**Status:** Partial / structurally deviated

**Files/modules:**
- `packages/contracts/contracts/IntentRegistry.sol`
- `packages/contracts/test/IntentRegistry.ts`
- `packages/subgraph/abis/IntentRegistry.json`

**What exists:**
- Core intent lifecycle functions: `createIntent` (`IntentRegistry.sol:172`), `fulfillIntentWithBytes` (`IntentRegistry.sol:226`), `cancelIntent` (`IntentRegistry.sol:315`), `expireIntent` (`IntentRegistry.sol:338`).
- Escrow integration: calls `escrow.lockTokens` (`IntentRegistry.sol:204`) and `escrow.releaseTokens` (`IntentRegistry.sol:296`).
- Events: `IntentCreated`, `IntentFulfilled`, `IntentCancelled`, `IntentExpired`.

**Missing vs plan:**
- The plan's `Intent` struct contains `sourceChainId`, `sourceToken`, `sourceAmount`, `destChainId`, `destToken`, `minDestAmount`, `maxSolverFee`, `nonce`, `signature`, `allowedSolvers`, `paymentTxHash`. The current struct (`IntentRegistry.sol:35-47`) only stores `id`, `user`, `solver`, `token`, `amount`, `protocolFee`, `expiryTimestamp`, `status`, `paymentProofHash`, `createdAt`, `fulfilledAt`.
- Plan requires `deriveIntentId()` to hash canonical fields; current code accepts any `bytes32 intentId` from the user (`IntentRegistry.sol:172`).
- Plan requires `submitIntent(IntentParams calldata intent, bytes calldata signature)` with EIP-712 signature verification. Current `createIntent` does not accept or verify a signature.
- Plan requires `fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash)`. Current fulfillment uses raw `bytes calldata paymentProofBytes` and does not accept `destAmount` or `paymentTxHash`.
- Plan requires `cancelExpiredIntents(bytes32[])` batch keeper function. Not present.
- Plan requires `IntentStatus { Open, Fulfilled, Cancelled }`. Current adds `Pending` and `Expired` (`IntentRegistry.sol:26-31`).
- No `allowedSolvers` enforcement; instead there is an optional `SolverRegistry` check (`IntentRegistry.sol:235-237`), which is not in the plan.

### 2. Payment Verifier

**Status:** Partial / functionally different

**Files/modules:**
- `packages/contracts/contracts/PaymentVerifier.sol`
- `packages/contracts/test/PaymentVerifier.ts`

**What exists:**
- `verifyPayment(PaymentProof calldata proof, bytes calldata signature)` (`PaymentVerifier.sol:123`) verifies EIP-712 signatures from authorized signers.
- Replay prevention via `verifiedIntents` mapping (`PaymentVerifier.sol:30`).
- Signer management (`addSigner`/`removeSigner`).

**Missing vs plan:**
- The plan specifies `verifyPayment(bytes32 paymentTxHash, address payer, address payee, uint256 amount, bytes32 intentId)` that checks an **on-chain ERC-20 transfer** for the x402 V2 payment flow. Current implementation verifies an off-chain EIP-712 proof, not a tx hash.
- Plan requires a `registerFacilitator` / `revokeFacilitator` registry. Current contract has `authorizedSigners` instead (`PaymentVerifier.sol:21`).
- `IntentRegistry` never calls `PaymentVerifier.verifyPayment` during fulfillment (`_fulfillIntent` at `IntentRegistry.sol:283` only stores `keccak256(paymentProofBytes)` and releases escrow). The plan requires the registry to call the verifier before releasing escrow.

### 3. Escrow

**Status:** Partial (core features present, deployment interface diverged)

**Files/modules:**
- `packages/contracts/contracts/Escrow.sol`
- `packages/contracts/test/Escrow.ts`

**What exists:**
- `lockTokens` (`Escrow.sol:141`), `releaseTokens` (`Escrow.sol:172`), `refundTokens` (`Escrow.sol:213`).
- Token allowlist (`supportedTokens`, `Escrow.sol:38`) and `onlyRegistry` modifier (`Escrow.sol:104`).
- ReentrancyGuard (`Escrow.sol:16`) and Pausable.

**Missing vs plan:**
- Plan expects `Escrow` constructor to take **no arguments** and `setRegistry` to be called after deployment. Current constructor requires `treasury`, `protocolFeeBps`, and `emergencyRecipient` (`Escrow.sol:121`).
- Plan expects `addAllowedToken` / `removeAllowedToken`. Current uses `addSupportedToken` / `removeSupportedToken` (`Escrow.sol:239`, `249`).
- Current release splits a protocol fee to `treasury` (`Escrow.sol:185-201`), which is an added design choice not in the plan.
- Added emergency withdrawal functionality is beyond plan scope.

### 4. Solver Engine

**Status:** Partial / not integrated with plan contracts

**Files/modules:**
- `packages/solver/src/index.ts`
- `packages/solver/src/watcher.ts`
- `packages/solver/src/evaluator.ts`
- `packages/solver/src/submitter.ts`
- `packages/solver/src/strategies/xdc-only.ts`
- `packages/solver/src/adapters/dex.ts`
- `packages/solver/src/middleware-client.ts`
- `packages/solver/src/state.ts`

**What exists:**
- Event watcher with WebSocket + HTTP fallback (`watcher.ts:15`).
- Profitability evaluator skeleton (`evaluator.ts:13`).
- SQLite state manager (`state.ts:25`).
- Transaction submitter with nonce/gas management (`submitter.ts:7`).
- Middleware client that requests payment proofs (`middleware-client.ts:28`).

**Missing vs plan:**
- Watcher listens for `IntentSubmitted(bytes32,address,address,uint256,uint256)` (`watcher.ts:40`), but the current `IntentRegistry` emits `IntentCreated(bytes32,address,address,uint256,uint256,uint256)`. The event signature does not match, so the solver will not detect current intents.
- No XSwap V3 adapter. The DEX adapter is a `MockDEXAdapter` (`dex.ts:26`) or a `SimpleDEXAdapter` for the in-repo `SimpleDEXRouter`, not XSwap V3.
- No real profitability evaluation using XSwap V3 quotes, gas cost, bridge fees. Current evaluator uses mocked 1:1 rates (`evaluator.ts:89-104`).
- No x402 V2 payment flow. The solver sends a **mock signature** (`solver/src/index.ts:182`) to the custom middleware and receives an EIP-712 proof, not an on-chain ERC-20 transfer tx hash.
- `TransactionSubmitter` calls `fulfillIntent(intentId, proof, signature)` (`submitter.ts:58-66`), but the current `IntentRegistry` exposes `fulfillIntentWithBytes(intentId, solver, paymentProofBytes)`. The ABI and arguments used by the submitter do not match the deployed contract.
- No cross-chain strategy, no LayerZero/Stargate adapter.
- Typecheck fails on the solver package (`winston`, `better-sqlite3` modules/types missing, plus `solver-auction.ts` references non-existent contract functions).

### 5. x402 Middleware (Facilitator)

**Status:** Scaffolded / not x402 compliant

**Files/modules:**
- `packages/middleware/src/index.ts`
- `packages/middleware/package.json`

**What exists:**
- Express server with rate limiting, API-key auth, SQLite nonce store.
- `/v1/payment-request` returns HTTP 402 with amount/recipient/nonce (`middleware/src/index.ts:150`).
- `/v1/pay` accepts a solver signature and returns an EIP-712 `PaymentProof` signed by the middleware.
- `/v1/verify` verifies the middleware's EIP-712 signature.

**Missing vs plan:**
- The plan requires `@x402/express` middleware and `@x402/evm` payment scheme. The middleware does **not** import any `@x402/*` package (confirmed by repo-wide grep: only the word "x402" appears in `package.json` description/keywords).
- Plan requires the facilitator to verify an **on-chain ERC-20 transfer tx hash** before granting access. Current middleware verifies an off-chain solver signature (with a testnet skip) and signs an EIP-712 proof; it never checks chain state for a token transfer.
- No `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` headers as specified by x402 V2.
- The middleware's `token` field in the proof is set to `INTENT_REGISTRY_ADDRESS` (`middleware/src/index.ts:228`), not the actual ERC-20 token.

### 6. Agent SDK

**Status:** Partial / not aligned with plan contract interface

**Files/modules:**
- `packages/sdk/src/index.ts`
- `packages/sdk/src/constants.ts`
- `packages/sdk/test/sdk.test.ts`

**What exists:**
- `XDCIntentSDK` class with contract wrappers, event watchers, retry logic.
- `createIntent`, `signIntent`, `cancelIntent`, `expireIntent`, `watchIntents`, `watchFulfillments`, `watchCancellations`.
- Address normalization for `xdc...` prefix.

**Missing vs plan:**
- `createIntent` in the SDK calls `intentRegistry.createIntent(intentId, token, amount, expiry)` (`sdk/src/index.ts:176-188`), but the plan expects the SDK to build the full `IntentParams` struct (with source/dest chain, dest token, min output, max solver fee, nonce), derive the ID, and sign it before submitting.
- `computeIntentId` (`sdk/src/index.ts:159-172`) hashes `(user, token, amount, expiry, nonce)`; the plan's `deriveIntentId` hashes `(user, sourceChainId, sourceToken, sourceAmount, destChainId, destToken, minDestAmount, maxSolverFee, expiry, nonce)`. The SDK ID will not match a plan-compliant contract.
- `signIntent` signs a simplified `(intentId, token, amount, expiry)` struct (`sdk/src/index.ts:250-256`), not the plan's full intent struct.
- `fulfillIntent` expects `paymentProof` + `signature` (`sdk/src/index.ts:310-320`), not the plan's `destAmount` + `paymentTxHash`.
- `requestPaymentProof` from the plan's public API is missing.
- The SDK imports from `@xdc-intent/types`, `@xdc-intent/constants`, `@xdc-intent/utils` (`sdk/package.json:20-22`), but those shared packages have no source files.

### 7. Cross-chain Bridge

**Status:** Not started (package scaffold only)

**Files/modules:**
- `packages/bridge/package.json` only — no `src/` files.

**What exists:**
- Package manifest references `@xdc-intent/types` and `@xdc-intent/constants`.

**Missing vs plan:**
- No LayerZero V2 / Stargate integration.
- No `bridgeTokens()` adapter, no cross-chain intent strategy in the solver, no bridge state tracking in the DB.
- The plan's fallback (XDC-only intents first) is effectively the current state.
- Extra contracts `CrossChainBridgeAdapter.sol` and `CrossChainIntentBridge.sol` exist in `packages/contracts/contracts/`, but they are not LayerZero/Stargate adapters and are not wired into the main flow.

### 8. React Frontend (plan component #7)

**Status:** Partial / scaffolded, not using planned stack

**Files/modules:**
- `packages/frontend/src/app/page.tsx`
- `packages/frontend/src/app/create/page.tsx`
- `packages/frontend/src/app/my-intents/page.tsx`
- `packages/frontend/src/components/providers.tsx`
- `packages/frontend/src/lib/contracts.ts`

**What exists:**
- Next.js app with wallet connection via injected MetaMask/XDC Pay (`providers.tsx:27`).
- Create-intent form and my-intents list.
- Hardcoded Apothem contract addresses in `contracts.ts:3-24`.

**Missing vs plan:**
- Plan requires **React + Vite** and **wagmi + viem**. The frontend is **Next.js** and uses raw `ethers.js` (`providers.tsx:4`, `page.tsx:19`).
- The create form only collects `fromToken`, `toToken`, `fromAmount`, `minOutput`, `expiry` (`create/page.tsx:26-32`). It does not capture plan-required fields: `sourceChainId`, `destChainId`, `maxSolverFee`, `nonce`, and it does not produce an EIP-712 signature.
- The form uses hardcoded token addresses including zero-address placeholders (`create/page.tsx:19-23`).
- Live feed on the home page is mocked (`page.tsx:23-28`); stats are partly hardcoded.
- No user history with explorer links, no aggregate volume charts, no dark-mode toggle, no intent preview/confirmation modal.
- The wallet provider only supports chain ID 51 (`providers.tsx:69`), which matches testnet, but there is no wagmi-based XDC custom chain config.

---

## 3. Structural deviations summary

| Plan expectation | Current state |
|------------------|---------------|
| Monorepo: pnpm workspaces | npm workspaces + turbo |
| `packages/shared/src/types.ts`, constants, utils | `shared/*` packages are empty (only `package.json`) |
| Contracts: `IntentRegistry`, `Escrow`, `PaymentVerifier`, interfaces, `IntentLib`, mocks | Extra contracts (`SolverRegistry`, `PriceOracle`, `MEVProtection`, `BatchAuctionSettlement`, `DutchAuctionRFQ`, etc.); no `interfaces/` or `IntentLib.sol`; core intent model simplified |
| PaymentVerifier verifies on-chain ERC-20 transfer tx hash | PaymentVerifier verifies off-chain EIP-712 signatures |
| x402 Facilitator via `@x402/express` | Custom Express middleware with API keys and EIP-712 proofs |
| Solver uses XSwap V3 adapter | Solver uses `MockDEXAdapter` / `SimpleDEXAdapter` |
| Cross-chain via LayerZero + Stargate | No implementation; bridge package empty |
| Frontend: React + Vite + wagmi/viem | Frontend: Next.js + ethers |

---

## 4. Missing integration points

1. **IntentRegistry ↔ PaymentVerifier**: `IntentRegistry._fulfillIntent` never calls `PaymentVerifier.verifyPayment`. It stores a hash and releases escrow directly (`IntentRegistry.sol:283-296`). The plan requires verification before escrow release.

2. **Solver ↔ IntentRegistry events**: `solver/src/watcher.ts:40` subscribes to `IntentSubmitted(...)`, but `IntentRegistry.sol:89-96` emits `IntentCreated(...)`. The solver will miss intents.

3. **Solver ↔ PaymentVerifier / x402**: The solver does not fetch or verify an on-chain ERC-20 transfer tx hash. It uses a mock signature and the custom middleware's EIP-712 proof (`solver/src/index.ts:181-185`).

4. **Solver ↔ DEX**: No XSwap V3 integration; profitability evaluation is mocked.

5. **SDK ↔ Contracts**: The SDK's `createIntent`/`signIntent`/`computeIntentId` do not match the plan's intent struct or the current contract's actual interface. The SDK's `fulfillIntent` ABI (`constants.ts:97`) assumes a function signature the current `IntentRegistry` does not expose.

6. **Middleware ↔ x402 protocol**: No `@x402/express` usage and no on-chain transfer verification.

7. **Frontend ↔ SDK**: The frontend does not import or use the SDK; it constructs ethers contracts directly (`create/page.tsx:52`).

8. **Frontend ↔ Plan intent model**: The create form lacks source/dest chain, max solver fee, nonce, and signature handling.

---

## 5. Prioritized task list (dependency order)

1. **Re-align the on-chain intent data model** (blocks SDK, solver, frontend)
   - Update `IntentRegistry.sol` to the plan's `Intent` struct and functions: `submitIntent(IntentParams, signature)`, `fulfillIntent(intentId, destAmount, paymentTxHash)`, `cancelIntent`, `cancelExpiredIntents`, `deriveIntentId`.
   - Add `contracts/interfaces/IIntentRegistry.sol`, `IEscrow.sol`, `IPaymentVerifier.sol` and `contracts/libraries/IntentLib.sol` as specified.
   - Remove or isolate extra contracts (`SolverRegistry`, `PriceOracle`, `BatchAuctionSettlement`, etc.) so they do not block the core flow.

2. **Re-implement PaymentVerifier for x402 V2 on-chain transfer verification** (blocks solver/middleware)
   - Change `verifyPayment` to accept `(paymentTxHash, payer, payee, amount, intentId)` and verify the ERC-20 `Transfer` event/logs.
   - Add `registerFacilitator`/`revokeFacilitator` instead of `authorizedSigners`.
   - Call `PaymentVerifier.verifyPayment` from `IntentRegistry` before escrow release.

3. **Simplify Escrow to the plan interface**
   - Make constructor argument-less; add `setRegistry`, `addAllowedToken`, `removeAllowedToken`.
   - Keep ReentrancyGuard, allowlist, and `onlyRegistry`.

4. **Implement real x402 Facilitator middleware**
   - Add `@x402/express` and `@x402/evm` dependencies.
   - Return `402 PAYMENT-REQUIRED` headers with CAIP-2 chain info.
   - Verify on-chain ERC-20 transfer tx hash before issuing `PAYMENT-RESPONSE`.

5. **Rewrite Agent SDK to match the plan contract interface**
   - Implement `createIntent(params) -> UnsignedIntent` with full struct.
   - Implement `signIntent` with the plan's EIP-712 domain/types.
   - Ensure `computeIntentId` / contract derivation match exactly.
   - Implement `requestPaymentProof` using `@x402/fetch` and the facilitator.
   - Populate `shared/types`, `shared/constants`, `shared/utils`.

6. **Fix and extend Solver Engine**
   - Update watcher to listen to the correct `IntentCreated` event (or the aligned `IntentSubmitted` after step 1).
   - Replace `MockDEXAdapter` with an XSwap V3 (`Router` + `Quoter`) adapter.
   - Integrate x402 payment: request 402, pay on-chain, obtain tx hash, submit `fulfillIntent` with tx hash.
   - Add race-condition handling and real gas estimation.
   - Remove or fix non-compiling auction code (`solver/src/auction/solver-auction.ts`).

7. **Rebuild frontend against the plan stack**
   - Either migrate to Vite + React + wagmi/viem or, at minimum, align the Next.js app to the plan's intent fields and the SDK.
   - Add source/dest chain, dest token, min output, max solver fee, nonce, signature preview.
   - Replace mocked live feed with event-based real data.
   - Add user history, explorer links, stats dashboard.

8. **Add cross-chain bridge integration (LayerZero + Stargate)**
   - Implement bridge adapter in the solver.
   - Add bridge state tracking in the solver DB.
   - Only after XDC-only flow is end-to-end.

9. **Tooling and verification**
   - Fix package manager/workspace setup (pnpm or fully working npm workspaces) so `shared/*` packages build.
   - Add Foundry tests/fuzz tests as required by the plan (currently only Hardhat tests exist).
   - Run Slither static analysis.
   - Restore typecheck/lint across all packages.

---

## 6. Test / build notes

- `packages/contracts`: `npx hardhat compile` succeeds (47 Solidity files). `npx hardhat test` passes **148 tests** against the current (non-plan) design.
- `packages/solver`: `npx tsc --noEmit` fails (`winston`, `better-sqlite3` types missing; `solver-auction.ts` references non-existent contract functions).
- `packages/sdk`: `npx tsc --noEmit` fails (missing `hardhat` types, broken Vitest types, and unresolved shared-package imports).
- Shared packages (`shared/types`, `shared/constants`, `shared/utils`) have no source and will break any package that imports them.
