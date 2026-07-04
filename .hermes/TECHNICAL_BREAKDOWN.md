# XDC Intent Framework — Complete Technical Breakdown

## 1. What It Does (Purpose)

The **XDC Intent Framework** is an **intent-based trading system** built on the **XDC Network**. Instead of users executing trades directly on-chain, they express a trading intent (e.g., "I want to swap 100 XDC for USDC at the best available rate"). Specialized off-chain agents called **solvers** compete to fulfill these intents. The protocol generates revenue by collecting a configurable protocol fee (default 1%) on every fulfilled intent.

### Core Value Proposition
- **User Experience**: Users only specify what they want, not how to get it
- **Solver Competition**: Multiple solvers compete, driving better prices
- **Protocol Revenue**: Fees are collected on every successful fulfillment
- **Security**: Funds are held in escrow until fulfillment is verified

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | XDC Network (Chain ID 50 mainnet, 51 Apothem testnet) |
| **Smart Contracts** | Solidity 0.8.19/0.8.20, OpenZeppelin v4/v5 |
| **Contract Framework** | Hardhat 2.19+ with hardhat-deploy, hardhat-verify, typechain |
| **Backend** | Node.js 20+, Express.js, TypeScript |
| **Database** | SQLite (better-sqlite3) |
| **Frontend** | React 18, Vite, TailwindCSS, Zustand, React Query |
| **SDK** | TypeScript, ethers.js v6, Zod for validation |
| **Solver** | TypeScript, ethers.js v6, Winston logging |
| **DEX** | Custom simplified Uniswap V2 fork (SimpleDEX) |
| **Build System** | Turbo (monorepo), npm workspaces |
| **CI/CD** | GitHub Actions (lint, typecheck, test, coverage) |
| **Security** | Gitleaks, npm audit, solhint |

---

## 3. Architecture

### High-Level Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   User      │────▶│   Frontend   │────▶│    SDK      │
│  (Wallet)   │     │  (React/Vite)│     │ (ethers.js) │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     XDC Blockchain                               │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐   │
│  │   Escrow     │◄───│  IntentRegistry │───►│PaymentVerifier│   │
│  │ (Token Vault)│     │ (Orchestrator)  │    │ (EIP-712 Sig) │   │
│  └──────────────┘     └─────────────────┘    └──────────────┘   │
│         ▲                                                       │
│         │                                                        │
│  ┌──────┴──────┐     ┌──────────────┐     ┌──────────────┐    │
│  │  SimpleDEX  │◄────│   Solver     │◄────│  Middleware  │    │
│  │  (Liquidity)│     │  (Off-chain) │     │ (x402 Payment)│    │
│  └─────────────┘     └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Monorepo Structure

```
xdc-intent/
├── packages/
│   ├── bridge/          # Cross-chain intent fulfillment (minimal)
│   ├── contracts/       # Solidity smart contracts + Hardhat
│   ├── dex/             # SimpleDEX (Uniswap V2 clone)
│   ├── frontend/        # React consumer UI
│   ├── middleware/      # Express x402 payment service
│   ├── sdk/             # TypeScript SDK for dApp integration
│   └── solver/          # Competitive intent fulfillment engine
├── shared/
│   ├── constants/       # Shared constants (empty placeholder)
│   ├── types/           # Shared TypeScript types (empty placeholder)
│   └── utils/           # Shared utilities (empty placeholder)
├── .github/workflows/   # CI/CD pipelines
├── .hermes/             # Project documentation & guides
├── docs/                # (empty)
├── scripts/             # Deployment & verification scripts
└── turbo.json           # Turborepo pipeline config
```

---

## 4. Data Flow

### Intent Lifecycle (Happy Path)

```
1. USER CREATES INTENT
   User ──▶ IntentRegistry.createIntent(intentId, token, amount, expiry)
   IntentRegistry ──▶ ERC20.transferFrom(user, Escrow, amount)
   IntentRegistry ──▶ Escrow.lockTokens(token, user, amount, intentId)
   Status: Pending

2. SOLVER DETECTS INTENT
   Solver ──▶ EventWatcher (WebSocket or polling)
   Solver ──▶ IntentEvaluator.evaluate() → shouldFulfill: true

3. SOLVER REQUESTS PAYMENT PROOF
   Solver ──▶ Middleware /v1/payment-request
   Middleware ──▶ Returns 402 with payment details

4. SOLVER SUBMITS PAYMENT
   Solver ──▶ Middleware /v1/pay (with signature)
   Middleware ──▶ Generates EIP-712 PaymentProof
   Middleware ──▶ Signs proof with authorized signer key
   Middleware ──▶ Stores nonce (replay protection)
   Middleware ──▶ Returns proof + signature

5. SOLVER FULFILLS ON-CHAIN
   Solver ──▶ IntentRegistry.fulfillIntent(intentId, solver, proof, signature)
   IntentRegistry ──▶ PaymentVerifier.verifyPayment(proof, signature)
   PaymentVerifier ──▶ ECDSA.recover() → checks authorized signer
   IntentRegistry ──▶ Escrow.releaseTokens(token, solver, amount, intentId)
   Escrow ──▶ ERC20.transfer(treasury, protocolFee)
   Escrow ──▶ ERC20.transfer(solver, amount - protocolFee)
   Status: Fulfilled
```

### Cancellation Flow

```
User ──▶ IntentRegistry.cancelIntent(intentId)
IntentRegistry ──▶ Escrow.refundTokens(token, user, amount, intentId)
Escrow ──▶ ERC20.transfer(user, amount)
Status: Cancelled
```

### Expiry Flow

```
Anyone ──▶ IntentRegistry.expireIntent(intentId) [after block.timestamp > expiry]
IntentRegistry ──▶ Escrow.refundTokens(token, user, amount, intentId)
Status: Expired
```

---

## 5. Every File/Folder Explained

### Root Level

| File/Folder | Purpose |
|-------------|---------|
| `package.json` | Root monorepo config, npm workspaces, Turbo scripts |
| `turbo.json` | Turborepo pipeline (build, test, lint, dev, clean) |
| `.env` | Root environment variables (secret) |
| `.nvmrc` | Node version: `>=20.11.0` |
| `.gitignore` | Standard Node.js + Hardhat + Vite ignore patterns |
| `README.md` | Minimal project title |

### `.github/`

| File | Purpose |
|------|---------|
| `workflows/ci.yml` | CI: lint, typecheck, test, build on push/PR |
| `workflows/security.yml` | Gitleaks secret scanning + npm audit |
| `pull_request_template.md` | PR template |

### `.hermes/`

| File | Purpose |
|------|---------|
| `work-summary.md` | Project overview, completed phases, architecture |
| `testnet-deployment.md` | Apothem testnet deployment details, tx hashes |
| `user-guide.md` | End-user guide for creating/cancelling/expiring intents |
| `verification-guide.md` | Manual XDCScan contract verification instructions |
| `implementation-plan-v3.md` | Detailed implementation plan |
| `implementation-plan-v4.md` | Updated implementation plan |
| `xdc-intent-framework-timeline.md` | Project timeline |
| `documentation/phase6-qa-report.md` | QA report for Phase 6 |
| `documentation/project-guide.md` | Project guide |

### `packages/contracts/`

| File | Purpose |
|------|---------|
| `hardhat.config.ts` | Hardhat config: Solidity 0.8.19, networks (hardhat/apothem/xdc), etherscan |
| `package.json` | Dependencies: hardhat-toolbox, openzeppelin, typechain, coverage |
| `DEPLOYMENT.md` | Deployment runbook: order, wiring, troubleshooting |
| `.env` / `.env.example` | RPC URLs, private keys, API keys |
| **contracts/** | |
| `Escrow.sol` | Token vault: lock/release/refund, protocol fees, emergency withdrawal |
| `IntentRegistry.sol` | Core orchestrator: intent lifecycle, status management |
| `PaymentVerifier.sol` | EIP-712 signature verification, authorized signers, batch verify |
| `MockERC20.sol` | Test ERC20 token for local testing |
| **deploy/** | |
| `00_deploy_contracts.ts` | hardhat-deploy script: deploys Escrow → PaymentVerifier → IntentRegistry, wires them |
| `01_verify_contracts.ts` | Contract verification script |
| **deployments/** | |
| `apothem.json` | Apothem testnet deployment addresses + test results |
| `hardhat.json` | Local hardhat deployment addresses |
| **scripts/** | |
| `deploy.ts` | Standalone deployment script |
| `verify.ts` | Standalone verification script |
| `integration-test.ts` | Integration test script |
| `test-deployment.ts` | Deployment testing script |
| `test-full-lifecycle.ts` | Full lifecycle test |
| `test-expire-fix.ts` | Expiry test with block.timestamp fix |
| `check-time.ts` | Time checking utility |
| **test/** | |
| `Escrow.ts` | Escrow unit tests |
| `IntentRegistry.ts` | IntentRegistry unit tests |
| `PaymentVerifier.ts` | PaymentVerifier unit tests |
| `Integration.ts` | End-to-end integration tests |
| **artifacts/** | Hardhat compilation artifacts (JSON) |
| **typechain-types/** | TypeChain generated TypeScript types |
| **coverage/** | Solidity coverage reports |

### `packages/dex/`

| File | Purpose |
|------|---------|
| `hardhat.config.ts` | Hardhat config for DEX (Solidity 0.8.20) |
| `package.json` | Minimal package, only `@openzeppelin/contracts` dep |
| `.env` | Environment variables |
| **contracts/** | |
| `SimpleDEXFactory.sol` | Uniswap V2-style factory: CREATE2 pair deployment, pair tracking |
| `SimpleDEXRouter.sol` | Router: swapExactTokensForTokens, getAmountsOut, path routing |
| `TestToken.sol` | ERC20 test token for DEX testing |
| **scripts/** | |
| `deploy.ts` | DEX deployment script |
| `add-liquidity.ts` | Liquidity addition script |
| **artifacts/** | Compilation artifacts |
| **typechain-types/** | TypeChain types |

### `packages/middleware/`

| File | Purpose |
|------|---------|
| `package.json` | Express, better-sqlite3, ethers, cors, helmet, rate-limit |
| `tsconfig.json` | TypeScript config (CommonJS, ES2020, dist output) |
| `vitest.config.ts` | Vitest test config |
| `.env` / `.env.example` | RPC URL, signer key, API key, contract addresses |
| **src/index.ts** | Main Express server: health, payment-request (402), pay, verify, metrics, webhooks, refund |
| **test/middleware.test.ts** | Supertest-based API tests |
| **dist/** | Compiled JavaScript output |
| `middleware.db` | SQLite database (nonces, webhooks, payments) |

### `packages/sdk/`

| File | Purpose |
|------|---------|
| `package.json` | SDK package: ethers, zod, shared deps |
| `tsconfig.json` | TypeScript config |
| `vitest.config.ts` | Vitest config |
| `.env.example` | Example environment variables |
| `README.md` | SDK documentation |
| **src/constants.ts** | Zod schemas, ABIs, chain IDs, contract addresses, error messages |
| **src/index.ts** | Main SDK class: `XDCIntentSDK` — create, fulfill, cancel, expire, watch events, estimate fees |
| **test/sdk.test.ts** | SDK unit tests with Hardhat local network |
| **dist/** | Compiled output (JS + .d.ts + source maps) |

### `packages/solver/`

| File | Purpose |
|------|---------|
| `package.json` | Solver: ethers, winston, zod, better-sqlite3 |
| `tsconfig.json` | TypeScript config |
| `vitest.config.ts` | Vitest config |
| `.env.example` | Solver config: RPC, private key, contract addresses, middleware URL |
| **src/index.ts** | Main `Solver` class: orchestrates watcher → evaluator → strategy → middleware → submitter |
| **src/config.ts** | Zod-based config validation with `loadConfig()` |
| **src/watcher.ts** | `EventWatcher`: WebSocket + polling fallback, backfill, dedup, reconnection |
| **src/evaluator.ts** | `IntentEvaluator`: profitability, slippage, token support checks |
| **src/strategies.ts** | `FallbackStrategyManager`: primary → partial-fill → multi-hop → retry-later |
| **src/strategies/xdc-only.ts** | `XDCOnlyStrategy`: direct swap evaluation, partial fill support |
| **src/routes.ts** | `MultiHopRouter`: 1/2/3-hop route finding across DEX adapters |
| **src/fees.ts** | `DynamicFeeManager`: gas-price-based margin adjustment |
| **src/state.ts** | `StateManager`: SQLite persistence for intents, decision logs |
| **src/middleware-client.ts** | `MiddlewareClient`: HTTP client for middleware API |
| **src/submitter.ts** | `TransactionSubmitter`: on-chain fulfillment with nonce management |
| **src/logger.ts** | Winston logger with JSON + console output |
| **src/adapters/dex.ts** | `DEXAdapter` interface, `MockDEXAdapter`, `SimpleDEXAdapter` |
| **test/** | Solver tests: unit, integration, real DEX, real E2E |
| **dist/** | Compiled output |

### `packages/frontend/`

| File | Purpose |
|------|---------|
| `package.json` | React 18, Vite, Tailwind, ethers, SDK deps |
| `.env.example` | Frontend environment variables |
| *(Note: No src/ directory found — package exists but implementation may be minimal)* |

### `packages/bridge/`

| File | Purpose |
|------|---------|
| `package.json` | Bridge package: ethers, axios, shared deps |
| `.env.example` | Bridge environment variables |
| *(Note: No src/ directory found — placeholder for cross-chain bridge)* |

### `shared/`

| Package | Status |
|---------|--------|
| `constants/` | Package.json only — placeholder |
| `types/` | Package.json only — placeholder |
| `utils/` | Package.json only — placeholder |

---

## 6. Key Functions & Logic

### Smart Contracts

#### Escrow.sol

| Function | Description |
|----------|-------------|
| `lockTokens(token, user, amount, intentId)` | Records token balance for an intent (called by IntentRegistry) |
| `releaseTokens(token, recipient, amount, intentId)` | Releases tokens to solver minus protocol fee |
| `refundTokens(token, user, amount, intentId)` | Returns tokens to user on cancel/expire |
| `addSupportedToken(token)` | Owner-only: whitelist a token |
| `proposeEmergencyWithdrawal(token, amount)` | Owner: initiate 48-hour timelock withdrawal |
| `executeEmergencyWithdrawal()` | Owner: execute after timelock expires |
| `calculateProtocolFee(amount)` | View: returns `(amount * protocolFeeBps) / 10000` |

#### IntentRegistry.sol

| Function | Description |
|----------|-------------|
| `createIntent(intentId, token, amount, expiry)` | Creates intent, transfers tokens to Escrow, locks them |
| `fulfillIntent(intentId, solver, paymentProof, signature)` | Verifies proof, releases tokens to solver |
| `cancelIntent(intentId)` | User-only: cancels pending intent, refunds tokens |
| `expireIntent(intentId)` | Anyone: expires intent after `block.timestamp > expiry`, refunds |
| `getIntent(intentId)` | View: returns full Intent struct |
| `getUserIntents(user)` | View: returns array of user's intent IDs |
| `isIntentPending(intentId)` | View: checks status == Pending |

#### PaymentVerifier.sol

| Function | Description |
|----------|-------------|
| `verifyPayment(proof, signature)` | Recovers EIP-712 signer, checks authorization, marks intent verified |
| `verifyPaymentBatch(proofs, signatures)` | Batch verify up to 50 proofs (gas efficient) |
| `addSigner(signer)` / `removeSigner(signer)` | Owner-only signer management |
| `isIntentVerified(intentId)` | View: replay protection check |

### SDK (XDCIntentSDK)

| Method | Description |
|--------|-------------|
| `createIntent(input)` | Validates with Zod, submits `createIntent` tx |
| `createIntentBatch(inputs, nonce)` | Creates multiple signed intents deterministically |
| `fulfillIntent(input)` | Submits fulfillment with payment proof |
| `cancelIntent(intentId)` | Validates ownership, submits cancellation |
| `expireIntent(intentId)` | Validates expiry, submits expiration |
| `watchIntents(callback)` | WebSocket real-time or polling fallback for IntentCreated events |
| `watchFulfillments(callback)` | Watches IntentFulfilled events |
| `estimateIntentCost(token, amount)` | Estimates gas + protocol fee in XDC and USD |
| `submitWithRetry(txFn, options)` | Exponential backoff retry with permanent error detection |
| `checkChainId()` | Validates connected network matches expected chain ID |

### Middleware API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Returns service status, RPC connectivity, contract reachability |
| `GET /v1/payment-request` | API Key | Returns 402 with payment details for an intent |
| `POST /v1/pay` | API Key + Rate Limit | Accepts solver payment, generates EIP-712 proof, stores nonce |
| `GET /v1/verify` | None | Verifies a proof signature against middleware signer |
| `GET /v1/metrics` | None | Returns request/proof/refund metrics |
| `POST /v1/webhooks` | API Key | Registers solver webhook URL |
| `POST /v1/refund` | API Key | Processes refunds within 24-hour window |

### Solver

| Component | Key Logic |
|-----------|-----------|
| `EventWatcher` | WebSocket → HTTP polling fallback, exponential reconnection, dedup Set, backfill |
| `IntentEvaluator` | Token support check, expiry check, min amount, profit margin, slippage |
| `FallbackStrategyManager` | Primary → partial fill (75/50/25/10%) → multi-hop → retry-later |
| `DynamicFeeManager` | Adjusts margin ±50% based on gas price ratio |
| `TransactionSubmitter` | Nonce management, gas price ceiling, 20% gas buffer, error classification |
| `StateManager` | SQLite: pending_intents, decision_logs with status tracking |

---

## 7. APIs & Integrations

### External APIs

| Service | Integration | Purpose |
|---------|-------------|---------|
| **XDC RPC** | `https://erpc.apothem.network` (testnet), `https://erpc.xinfin.network` (mainnet) | Blockchain reads/writes |
| **XDCScan API** | `api.xdcscan.io`, `api-testnet.xdcscan.com` | Contract verification |
| **CoinMarketCap** | Optional via `COINMARKETCAP_API_KEY` | Gas reporter USD pricing |

### Internal APIs

| Service | Protocol | Consumers |
|---------|----------|-----------|
| **Middleware** | HTTP REST (Express) | Solver, Frontend |
| **SDK** | TypeScript library | Frontend, external dApps |
| **Solver** | Event-driven (ethers events) | Blockchain |

### Contract Addresses (Apothem Testnet)

| Contract | Address |
|----------|---------|
| Escrow | `0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09` |
| PaymentVerifier | `0x14699d436E3c5d870A7C6aC3825C500C8f86d270` |
| IntentRegistry | `0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf` |
| MockToken | `0xa24EB2F71C57F1e701ce85181Cf8Cc544397Ab0E` |

---

## 8. Database / State

### Middleware SQLite (`middleware.db`)

```sql
-- Replay protection
CREATE TABLE used_nonces (nonce TEXT PRIMARY KEY, created_at INTEGER);

-- Webhook registrations
CREATE TABLE webhooks (solver_address TEXT PRIMARY KEY, url TEXT, created_at INTEGER);

-- Payment records
CREATE TABLE payments (id INTEGER PRIMARY KEY, intent_id TEXT, solver_address TEXT, 
  amount TEXT, nonce TEXT UNIQUE, proof TEXT, created_at INTEGER);
```

### Solver SQLite (`solver.db`)

```sql
-- Intent tracking
CREATE TABLE pending_intents (intent_id TEXT PRIMARY KEY, user TEXT, token TEXT, 
  amount TEXT, expiry INTEGER, block_number INTEGER, transaction_hash TEXT, 
  status TEXT, created_at INTEGER);

-- Decision audit trail
CREATE TABLE decision_logs (id INTEGER PRIMARY KEY, timestamp INTEGER, 
  intent_id TEXT, decision TEXT, reason TEXT, metadata TEXT);
```

### On-Chain State

| Contract | State |
|----------|-------|
| **Escrow** | `balances[token][user][intentId]`, `intentToUser[intentId]`, `supportedTokens[token]`, `totalTokenBalance[token]`, `pendingEmergencyWithdrawal` |
| **IntentRegistry** | `intents[intentId]`, `userIntents[user]`, `solverIntents[solver]`, `totalIntents`, `totalIntentsFulfilled`, `totalProtocolFees` |
| **PaymentVerifier** | `authorizedSigners[address]`, `verifiedIntents[intentId]`, `totalFeesVerified`, `totalIntentsVerified`, `signerNonce` |

---

## 9. Entry Points

### User Entry Points

| Entry | Command/File | Description |
|-------|-------------|-------------|
| **Frontend** | `cd packages/frontend && npm run dev` | Vite dev server for consumer UI |
| **SDK** | `import { XDCIntentSDK } from '@xdc-intent/sdk'` | Programmatic intent creation/management |

### Operator Entry Points

| Entry | Command/File | Description |
|-------|-------------|-------------|
| **Middleware** | `cd packages/middleware && npm run dev` | Express server on port 3000 |
| **Solver** | `cd packages/solver && npm run dev` | Intent fulfillment engine |
| **Deploy Contracts** | `cd packages/contracts && npx hardhat run deploy/00_deploy_contracts.ts --network apothem` | Deploy to testnet |

### Developer Entry Points

| Entry | Command | Description |
|-------|---------|-------------|
| **Build All** | `npm run build` (root) | Turbo builds all packages |
| **Test All** | `npm run test` (root) | Turbo runs all test suites |
| **Lint** | `npm run lint` | ESLint across packages |
| **Typecheck** | `npm run typecheck` | TypeScript checking |
| **Dev Mode** | `npm run dev` | Turbo runs all dev servers in parallel |

---

## 10. How to Run It

### Prerequisites

- Node.js >= 20.11.0 (use `.nvmrc`)
- npm >= 10.2.4
- XDC wallet with testnet XDC (from https://faucet.apothem.network)

### Step-by-Step Setup

```bash
# 1. Clone and install
cd /mnt/c/Users/karan/Desktop/openscans/xdc-intent
npm ci

# 2. Build all packages
npm run build

# 3. Set up environment
cp packages/contracts/.env.example packages/contracts/.env
cp packages/middleware/.env.example packages/middleware/.env
cp packages/solver/.env.example packages/solver/.env
# Edit .env files with your private keys and addresses

# 4. Run tests
npm run test

# 5. Deploy contracts locally
cd packages/contracts
npx hardhat run deploy/00_deploy_contracts.ts --network hardhat

# 6. Deploy to testnet
npx hardhat run deploy/00_deploy_contracts.ts --network apothem

# 7. Start middleware
cd packages/middleware
npm run dev

# 8. Start solver (in another terminal)
cd packages/solver
npm run dev

# 9. Start frontend (in another terminal)
cd packages/frontend
npm run dev
```

### Running Individual Components

```bash
# Contracts only
cd packages/contracts
npx hardhat test              # Run contract tests
npx hardhat coverage          # Generate coverage report
npx hardhat node              # Start local hardhat node

# Middleware only
cd packages/middleware
npm run build
npm run start                 # Production mode
npm run test                  # Run API tests

# SDK only
cd packages/sdk
npm run build
npm run test                  # Run SDK tests

# Solver only
cd packages/solver
npm run build
npm run start                 # Start solver
npm run test                  # Run solver tests

# DEX only
cd packages/dex
npx hardhat test
npx hardhat run scripts/deploy.ts --network apothem
```

---

## 11. What Can Break

### Smart Contract Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Reentrancy** | Fund drain | `ReentrancyGuard` on all state-changing functions, checks-effects-interactions pattern |
| **Access Control Bypass** | Unauthorized token release | `onlyRegistry` modifier on Escrow, `onlyOwner` on admin functions |
| **Signature Replay** | Double-spend proofs | `verifiedIntents` mapping in PaymentVerifier, chainId in EIP-712 domain |
| **Signature Malleability** | Invalid proof acceptance | OpenZeppelin ECDSA library with malleability protection |
| **Malicious Tokens** | ERC20 reentrancy, fee-on-transfer | Token allowlist in Escrow; only approved tokens |
| **Emergency Withdrawal Abuse** | Owner rug pull | 48-hour timelock, pending withdrawal struct |
| **Front-running** | Solver MEV | Intent expiry provides time bounds; competitive solver market |
| **Gas Price Spike** | Failed fulfillments | Solver gas price ceiling (`maxGasPriceGwei`) |

### Infrastructure Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **RPC Downtime** | Solver can't detect intents | WebSocket → HTTP polling fallback; multiple RPC endpoints |
| **Middleware Down** | Solver can't get proofs | Solver retries; middleware can be self-hosted |
| **Nonce Replay** | Double payment | SQLite `used_nonces` table with UNIQUE constraint |
| **Rate Limit Abuse** | DoS on middleware | Express rate limiting per API key and per address |
| **Database Corruption** | Lost intent state | SQLite is file-based; backup strategy needed |
| **Private Key Leak** | Solver/middleware compromise | `.env` files excluded from git; use hardware wallets |

### Integration Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Block Timestamp Lag** | Expiry tests fail | Use `block.timestamp` not `Date.now()` for expiry |
| **Wrong Chain ID** | Transactions on wrong network | SDK `checkChainId()` validation |
| **Contract Address Mismatch** | Calls to wrong contracts | `CONTRACT_ADDRESSES` per chain ID in SDK |
| **API Key Leak** | Unauthorized middleware access | Rotate keys, use environment variables |
| **Insufficient Allowance** | Intent creation fails | SDK validates allowance before creating intent |

---

## 12. How to Add a Feature

### Example: Add a New Token Pair to the Solver

1. **Add token addresses** to `packages/solver/src/evaluator.ts`:
   ```typescript
   const knownTokens: Record<string, string> = {
     '0x...': 'NEWTOKEN',
   };
   ```

2. **Update supported tokens** in `.env`:
   ```
   SUPPORTED_TOKENS=USDC,USDT,XDC,NEWTOKEN
   ```

3. **Add DEX pair** in `packages/solver/src/adapters/dex.ts`:
   ```typescript
   this.exchangeRates.set('XDC-NEWTOKEN', 0.1);
   ```

4. **Test**:
   ```bash
   cd packages/solver
   npm run test
   ```

### Example: Add a New Contract Function

1. **Add to contract** (e.g., `IntentRegistry.sol`):
   ```solidity
   function newFeature() external onlyOwner { ... }
   ```

2. **Add ABI to SDK** (`packages/sdk/src/constants.ts`):
   ```typescript
   export const IntentRegistryABI = [
     'function newFeature() external',
   ];
   ```

3. **Add SDK method** (`packages/sdk/src/index.ts`):
   ```typescript
   async newFeature(): Promise<ethers.TransactionResponse> {
     return this.intentRegistry.newFeature();
   }
   ```

4. **Add test** (`packages/sdk/test/sdk.test.ts`):
   ```typescript
   it('should call newFeature', async () => { ... });
   ```

5. **Run tests**:
   ```bash
   npm run test
   ```

### Example: Add a New Middleware Endpoint

1. **Add route** in `packages/middleware/src/index.ts`:
   ```typescript
   app.post('/v1/new-feature', apiKeyAuth, (req, res) => { ... });
   ```

2. **Add test** in `packages/middleware/test/middleware.test.ts`:
   ```typescript
   it('should handle new feature', async () => { ... });
   ```

3. **Run tests**:
   ```bash
   cd packages/middleware && npm run test
   ```

### Example: Add a New Solver Strategy

1. **Create strategy file** `packages/solver/src/strategies/my-strategy.ts`:
   ```typescript
   export class MyStrategy { ... }
   ```

2. **Register in FallbackStrategyManager** (`packages/solver/src/strategies.ts`):
   ```typescript
   // Add to evaluateWithFallback() chain
   ```

3. **Test**:
   ```bash
   cd packages/solver && npm run test
   ```

### General Pattern

1. **Contract changes** → `packages/contracts/contracts/`
2. **ABI updates** → `packages/sdk/src/constants.ts`
3. **SDK updates** → `packages/sdk/src/index.ts`
4. **Middleware updates** → `packages/middleware/src/index.ts`
5. **Solver updates** → `packages/solver/src/`
6. **Tests** → respective `test/` directories
7. **Build** → `npm run build`
8. **Deploy** → `cd packages/contracts && npx hardhat run deploy/00_deploy_contracts.ts --network apothem`

---

## Appendix: Deployment Verification

### Apothem Testnet Deployment (2026-06-19)

| Contract | Address | Status |
|----------|---------|--------|
| Escrow | `0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09` | Deployed ✅ |
| PaymentVerifier | `0x14699d436E3c5d870A7C6aC3825C500C8f86d270` | Deployed ✅ |
| IntentRegistry | `0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf` | Deployed ✅ |
| MockToken | `0xa24EB2F71C57F1e701ce85181Cf8Cc544397Ab0E` | Deployed ✅ |

### Test Results

- **Create Intent**: ✅ Success (Block 83275738, Gas 384,913)
- **Cancel Intent**: ✅ Success (Block 83275741, Gas 92,837)
- **Expire Intent**: ⚠️ Failed due to network timeout (not contract bug)

---

*Report generated from comprehensive analysis of the xdc-intent monorepo at `/mnt/c/Users/karan/Desktop/openscans/xdc-intent`.*
