# XDCIntent Development Plan (Post-Research)

> Status: V1 testnet demo running on XDC Apothem. Core contracts deployed, single-solver fulfillment works, frontend/SDK functional.
> Constraint: Testnet only. No mainnet planning, production hardening, or paid audits.

---

## 1. North Star

Build an **x402 + NEAR Intents-inspired intent settlement demo on XDC Apothem**.
- Users/agents sign intents declaring desired outcomes.
- Multiple solvers compete off-chain to fulfill.
- x402-style payment proofs bridge off-chain payment to on-chain settlement.
- V1 stays single-chain, mock-token, simplified — but the demo must visibly prove the intent → solver competition → payment verification loop.

---

## 2. What We Have Now

| Component | Status |
|---|---|
| IntentRegistry + Escrow + PaymentVerifier | Deployed and verified on Apothem |
| Signed intent schema + EIP-712 | Implemented in SDK |
| One hardcoded solver | Works, auto-fills intents |
| Middleware with `/v1/pay`, `/v1/payment-request` | Functional but not spec-compliant x402 |
| Next.js frontend (swap form + my intents) | Build passes, basic manual test pending |
| SDK | Functional |
| Tests + Slither | Passing, 0 findings |

---

## 3. Gaps vs. Vision

1. **No solver competition.** Only one solver exists. The vision explicitly says solvers compete.
2. **Payment verifier is tx-hash based, not x402-style.** Vision calls for EIP-3009 / standard ERC-20 payment proofs.
3. **Frontend looks like a DEX swap, not an intent/agent demo.** Vision use cases are agent services, trade finance, RWAs — not manual token swapping.
4. **No intent market / quote visibility.** User can't see open intents or competing solver quotes.
5. **Middleware doesn't return HTTP 402.** It's a JSON API, not an x402 resource server.

---

## 4. Development Plan

### Phase A: Solver Competition (Highest Priority)

**Goal:** Make "solvers compete to fulfill" real and visible.

- [ ] Add `SolverRegistry` contract
  - `registerSolver(name, feeBps)` — permissioned or free for testnet
  - `getSolvers()` view
  - owner can disable solvers
  - Deploy to Apothem and wire into `IntentRegistry`
- [ ] Add off-chain quote API
  - `POST /quote` — solvers submit `{ intentId, solverAddress, outputAmount, signature }`
  - `GET /quotes/:intentId` — list quotes for an intent
  - Store quotes in-memory (testnet-appropriate)
- [ ] Update solver client
  - Monitor open intents
  - Evaluate and POST signed quotes
  - Fulfill only if its quote is selected
- [ ] Update frontend
  - Show quote table for each open intent
  - Auto-select best quote (highest output for user)
  - Display winning solver before fulfillment
- [ ] Add second mock solver
  - Run a second solver instance with different fee/rate settings
  - Competes against first solver

### Phase B: x402-Aligned Payment Proofs

**Goal:** Move from tx-hash verification to real x402-style payment authorization.

- [ ] Add EIP-3009 support to `MockERC20`
  - `transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)`
  - `authorizationState` nonce mapping
- [ ] Add `x402ExactEvmScheme` helper to middleware
  - Return proper `PaymentRequired` with `PAYMENT-REQUIRED` header
  - Accept `PAYMENT-SIGNATURE` header with EIP-3009 payload
  - Verify signature + simulate on-chain
- [ ] Update solver to sign EIP-3009 authorizations instead of doing raw `transfer`
  - Middleware/facilitator broadcasts the settlement tx
- [ ] Keep legacy `/v1/pay` tx-hash path as fallback for quick testing

### Phase C: Intent Market + Agent Demo Frontend

**Goal:** Surface the protocol story instead of hiding it behind a swap form.

- [ ] Build `/market` page
  - Lists all open intents from `IntentSubmitted` events
  - Shows best quote, expiry, status
  - Links to explorer
- [ ] Repurpose `/create` as intent builder
  - Fields: source token, source amount, dest token, min dest amount, max solver fee, expiry, allowed solvers
  - Show raw signed intent JSON (agent-friendly)
  - Add "Copy intent" for agents
- [ ] Add `/agent-demo` page
  - Simulates an AI agent paying for a service via x402
  - Service: "Mint RWA token for 5 MUSDC"
  - Walks through: 402 response → sign payment → submit proof → receive result
- [ ] Fix `/api/intents` and `/api/stats`
  - Read real data from `IntentRegistry`
  - Return counts, open intents, recent fills

### Phase D: Middleware as x402 Resource Server

**Goal:** Make middleware spec-shaped even if simplified.

- [ ] Add Express middleware that intercepts protected routes and returns HTTP 402
- [ ] Define `PaymentRequired` / `PaymentPayload` types matching x402 v2
- [ ] Add `/supported` endpoint for solver discovery
- [ ] Add `/settle` endpoint alongside existing `/pay`
- [ ] Document that this is a simplified x402-compatible flow, not full SDK integration

### Phase E: Demo Day Polish

**Goal:** Make the testnet demo impressive and easy to run.

- [ ] One-command demo script (`scripts/demo-v2.ps1`)
  - Starts registry, two solvers, middleware, frontend
  - Submits an intent
  - Shows quote competition
  - Shows fulfillment
- [ ] Update `docs/runbook.md` with exact commands and addresses
- [ ] Add `docs/architecture.md` with diagrams
- [ ] Add `docs/agent-guide.md` for programmatic intent submission
- [ ] Record demo transactions on Apothem for the README
- [ ] Final build + test pass

---

## 5. Out of Scope

- Cross-chain intents
- Real DEX routing/quoting
- Batch auctions (CoW style)
- Slashing / bonds
- Mainnet deployment
- Production monitoring
- Paid audits
- Real bridges

---

## 6. Suggested Order of Work

1. SolverRegistry contract + deploy
2. Quote API + second solver
3. Frontend market + quote display
4. EIP-3009 MockUSDC + x402 payment verifier update
5. Middleware 402 headers + `/settle`
6. Agent demo page
7. API stats + runbook polish
8. Final demo script + README

---

## 7. Success Criteria

- Two solvers register and submit competing quotes for the same intent.
- Frontend shows the quote competition and the winning solver.
- Fulfillment is triggered after quote selection.
- Payment proof can be verified via EIP-3009 authorization (not just tx hash).
- `/market` page displays live open intents.
- `/agent-demo` walks through a complete x402 intent flow.
- Demo script runs end-to-end on Apothem without manual intervention.

---

## 8. Current Apothem Addresses

| Contract | Address |
|---|---|
| IntentRegistry | `0x443Ba13baE4D122430737B72eA90E821F3C015Dc` |
| Escrow | `0x972E97d4898AfDF642627C3E05b105fCAc3F84D4` |
| PaymentVerifier | `0xf15AE12caF60fFA09CAcd6f823187aDC2fe4AeC6` |
| MockUSDC | `0xa3f37BBd132C6DA9088B4A63622CacbCBee394A4` |
| MockXDC | `0x6DC37E3ca98E49e923E953c5A7229726513eaf6E` |

*These will change when SolverRegistry and updated contracts are deployed.*

---

## 9. Notes

- Keep everything testnet-appropriate. Use in-memory stores, mock tokens, and simple signatures.
- Do not gate work behind mainnet readiness.
- Security work is scoped to "sound enough for testnet demo + learning."
- Reuse existing contract and SDK structure where possible; don't rewrite for elegance.
