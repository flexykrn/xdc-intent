# Go-Live Execution Plan — XDC Intent Framework

**Date:** 2026-07-01  
**Prepared by:** Technical Lead (AI agent)  
**Source:** QA audit report `qa-audit-2026-07-01.md`

---

## 1. GO-LIVE DEFINITION

For this project, "done enough to demo/test live" means:

- A single user can open the frontend in a browser, connect MetaMask, and load a page without build/runtime errors.
- The user can create a token-swap intent on XDC Apothem testnet and see it appear in the explorer.
- The user can view their own intents, cancel a pending intent, and observe expiry behavior.
- The middleware builds, starts, and responds to `/health` and `/v1/payment-request` on a live port.
- The contract test suite runs and passes at least the core `IntentRegistry` + `Escrow` + `PaymentVerifier` lifecycle tests.
- No placeholder secrets or mock addresses are actively breaking a live flow (real WalletConnect project ID, real RPC endpoint, real DEX pair address).

Everything else — natural language intent creation, MEV protection, subgraph production deployment, Vercel, mobile polish — is out of scope for this milestone.

---

## 2. CRITICAL PATH (🔴 Blockers only)

From the audit, these are the blockers in dependency order:

| # | Blocker | What exactly needs to be done | Estimated time | Verification check |
|---|---------|------------------------------|----------------|-------------------|
| 1 | **Frontend workspace is corrupted** — `next` package invalid, `node_modules/.bin` missing, build fails with `next: not found` | Wipe `node_modules` and lockfiles at root and in `packages/frontend`, then run `npm install` from the workspace root. Do NOT install from inside `packages/frontend` to avoid workspace corruption. If WSL install still fails, run `npm install` from Windows PowerShell. | 2-3h | `cd packages/frontend && npm run build` exits 0 and produces `.next/` output. |
| 2 | **Hardhat tests hang** — `npx hardhat test` produces no output in 300s | Add `apothem` network config with `earpc.apothem.network` URL (confirmed working for `eth_getCode`) to `packages/contracts/hardhat.config.ts`. Add timeout and retry config. If tests still hang, run a single targeted test file first: `npx hardhat test test/IntentRegistry.ts --network hardhat`. | 2-3h | `npx hardhat test test/IntentRegistry.ts --network hardhat` completes and prints pass/fail output within 60s. |
| 3 | **WalletConnect project ID is placeholder** | Replace `WALLET_CONNECT_PROJECT_ID = "YOUR_PROJECT_ID"` with a real project ID from `https://cloud.walletconnect.com` (free tier). Add it to `.env` and reference via `process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` in `useWallet.ts`. | 30min | Browser console no longer shows "Invalid project ID" when WalletConnect QR modal opens. |
| 4 | **DEX pair address is mock** | Replace `dexPair: "0x69a11B8F6..."` in `packages/frontend/src/lib/contracts.ts` with a real deployed pair address from `packages/dex` deployment, or remove the DEX pair feature from the frontend if no real pair exists. | 1-2h | `eth_getCode` for the new DEX pair address returns bytecode > 1000 chars on `earpc.apothem.network`. |

---

## 3. DAY-BY-DAY / SESSION-BY-SESSION PLAN

Assume focused sessions of 2-4 hours.

### Session 1 — Fix frontend dependency/workspace corruption
**Goal:** Frontend builds cleanly.

**Tasks:**
- `cd /mnt/c/Users/karan/Desktop/openscans/xdc-intent`
- `rm -rf node_modules packages/frontend/node_modules package-lock.json packages/frontend/package-lock.json`
- `npm install` (from WSL first; if it fails, repeat from PowerShell)
- `cd packages/frontend && npm run build`

**Checkpoint before next session:** `npm run build` exits 0 and `.next/` is populated.

**AI-agent usage:** Heavy. This is mechanical environment repair.

---

### Session 2 — Fix Hardhat test execution
**Goal:** Contract tests run locally.

**Tasks:**
- Update `packages/contracts/hardhat.config.ts` to use `earpc.apothem.network` for the `apothem` network.
- Run `npx hardhat test test/IntentRegistry.ts --network hardhat`.
- If that passes, run `npx hardhat test test/Escrow.ts --network hardhat`.
- If both pass, run the full suite.

**Checkpoint before next session:** At least `IntentRegistry.ts` and `Escrow.ts` print pass/fail results and exit.

**AI-agent usage:** Heavy. RPC/network config changes are mechanical.

---

### Session 3 — Replace placeholder secrets and mock addresses
**Goal:** Frontend connects to real services.

**Tasks:**
- Create/get WalletConnect project ID from cloud.walletconnect.com.
- Add `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` to root `.env` and read it in `useWallet.ts`.
- Replace mock `dexPair` address with a real deployed pair or remove the feature from the page that uses it.
- Verify `eth_getCode` succeeds for all frontend contract addresses.

**Checkpoint before next session:** No `"YOUR_PROJECT_ID"` or `0x69a11B8F6...` strings remain in the frontend code. All contract addresses return bytecode.

**AI-agent usage:** Medium. Needs user input for WalletConnect setup (create project in browser).

---

### Session 4 — End-to-end frontend smoke test
**Goal:** A user can click through the app without errors.

**Tasks:**
- `npm run dev` from PowerShell (or WSL if Session 1 fixed it).
- Open `http://localhost:3000`.
- Click through `/`, `/create`, `/explorer`, `/my-intents`, `/solver`, `/cross-chain`, `/dutch-auction`, `/partial-fill`, `/solver-incentives`, `/gasless`.
- Connect MetaMask if possible.
- Check browser console for errors.

**Checkpoint before next session:** All 10 pages render without runtime errors. Console has no red errors.

**AI-agent usage:** Light. Requires manual browser interaction.

---

### Session 5 — Live intent flow test
**Goal:** Create and view an intent on testnet.

**Tasks:**
- With MetaMask connected, create an intent on `/create` with a small amount of testnet XDC.
- Wait for transaction confirmation.
- Check `/explorer` and `/my-intents` for the new intent.
- Cancel a pending intent and verify status changes.
- Leave an intent to expire and verify expiry handling.

**Checkpoint before next session:** At least one create + cancel flow completes successfully on Apothem testnet.

**AI-agent usage:** Light. Requires real wallet and testnet gas.

---

### Session 6 — Middleware startup verification
**Goal:** Middleware starts and responds to API calls.

**Tasks:**
- `cd packages/middleware && npm run build`
- `node dist/index.js`
- `curl http://localhost:3000/health`
- `curl /v1/payment-request` with a valid intent ID.

**Checkpoint before next session:** Middleware returns JSON from both endpoints.

**AI-agent usage:** Medium. Build/start is mechanical; intent ID testing may need contract interaction.

---

### Session 7 — Final regression + commit
**Goal:** Working state is committed and pushed.

**Tasks:**
- Run full frontend build again.
- Run contract tests again.
- Commit all fixes with meaningful messages.
- Ask for user "go ahead" before pushing (per user rule).

**Checkpoint before next session:** All checks pass, commit ready.

**AI-agent usage:** Heavy. Requires user's final approval.

---

## 4. DEFERRED LIST

Items from the audit deliberately postponed past go-live:

| Audit item | Why deferred |
|------------|--------------|
| Switch all frontend RPC to `earpc.apothem.network` | Only needed if `xdcrpc.com` breaks mid-demo. The existing frontend RPC still returns block numbers so it is not a go-live blocker. |
| No `NEXT_PUBLIC_*` env pattern | Hardcoded addresses work for a demo. Env pattern is a maintainability improvement, not a blocker. |
| Mobile responsiveness | Not required for a desktop demo. |
| Natural-language intent creation | Out of scope for this milestone. |
| MEV protection module | Present in contracts but not wired into demo flow. |
| Subgraph production deployment | Not needed if the frontend reads directly from RPC. |
| Vercel deployment | User explicitly said no deployment; local demo only. |

---

## 5. FREE-TIER SAFETY CHECK

| Plan step | Free-tier risk | Mitigation |
|-----------|----------------|------------|
| WalletConnect free project | 1M relay messages/month, 10 project IDs | One demo will not exceed this. Monitor at cloud.walletconnect.com. |
| `apothem.xdcrpc.com` RPC | Public, no SLA, `eth_getCode` unreliable | Keep `earpc.apothem.network` as fallback. Pre-flight demo with a `eth_blockNumber` ping. |
| `earpc.apothem.network` RPC | Public, unknown rate limits | Use only for read calls; avoid polling faster than 5s. |
| MetaMask + testnet XDC | Free | Ensure testnet wallet has gas before demo. |
| Middleware running locally | Local only | For live demo, run it on your machine; no free-tier hosting dependency. |

---

## 6. RISK LOG

| Risk | Likelihood | Contingency |
|------|------------|--------------|
| WSL `npm install` still corrupts workspace after wipe | High | Move to Windows PowerShell for all `npm install` and `npm run dev` commands. |
| Hardhat tests still hang after RPC fix | Medium | Skip full suite; run targeted `IntentRegistry.ts` and `Escrow.ts` only. If even those hang, test manually via deploy script. |
| WalletConnect project setup takes time | Low | Have a fallback to MetaMask-only demo if WalletConnect is not ready. |
| Real DEX pair does not exist | Medium | Remove the DEX pair page from the nav until a real pair is deployed. |
| Testnet RPC is down during demo | Medium | Pre-warm with `earpc.apothem.network` and keep the fallback endpoint configured. |

---

## 7. FINAL PRE-LAUNCH CHECKLIST

Run this right before demoing:

- [ ] `git status` shows no uncommitted work.
- [ ] `packages/frontend` builds with `npm run build` (exit 0).
- [ ] `packages/middleware` builds with `npm run build` (exit 0).
- [ ] At least `packages/contracts/test/IntentRegistry.ts` and `Escrow.ts` pass.
- [ ] No `"YOUR_PROJECT_ID"` string anywhere in frontend code.
- [ ] No `0x69a11B8F6...` mock DEX pair address in frontend code.
- [ ] All frontend contract addresses return bytecode from `earpc.apothem.network`.
- [ ] `npm run dev` starts and `http://localhost:3000` loads.
- [ ] All 10 pages open without console errors.
- [ ] MetaMask connects and shows correct XDC Apothem chain.
- [ ] Testnet wallet has gas for at least 3 transactions.
- [ ] Middleware starts and `/health` returns 200.
- [ ] `.env` is not committed (verify with `git diff --name-only origin/main`).
- [ ] Rollback plan: last known good commit is `a528756`; can reset to it with `git reset --hard a528756`.
