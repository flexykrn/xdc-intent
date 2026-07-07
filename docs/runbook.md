# XDC Intent Framework â€” Runbook

## Overview
This runbook covers operating the XDC Intent Framework on XDC Apothem testnet.

## Deployed Contracts (Apothem Testnet)

| Contract | Address |
|---|---|
| IntentRegistry | `0xfe1887C1686cF54d83107DAf7Ad7F5A5Ea95419b` |
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

Canonical deployment metadata is tracked in [`packages/contracts/deployments/apothem.json`](../packages/contracts/deployments/apothem.json). DEX-specific addresses are also mirrored in [`packages/dex/deployments/apothem.json`](../packages/dex/deployments/apothem.json).

## Environment Setup

1. Copy root `.env.example` to `.env` and fill:
   - `DEPLOYER_PRIVATE_KEY`
   - `SOLVER_PRIVATE_KEY`
   - `XDC_TESTNET_RPC`
2. Copy `.env` values into:
   - `packages/contracts/.env`
   - `packages/middleware/.env`
   - `packages/solver/.env` (or use `packages/solver/.env.solver-a` / `.env.solver-b` for multi-instance demos)

## Quick Start

### One-command demo
```bash
npm run demo
```
This starts middleware, Solver A, Solver B, and the frontend in parallel.

### Bridge keeper (cross-chain simulation)
The keeper watches `BridgeOut` events on `MockBridge` and calls `mintOnDest` to simulate tokens arriving on the destination chain. It must be run from the deployer/owner key.

Supported mock destination chains: `99999` (Mock L2 Alpha) and `88888` (Mock L2 Beta). Configure which chains the keeper watches with `KEEPER_DEST_CHAIN_IDS`.

```bash
cd packages/contracts
MOCK_BRIDGE_ADDRESS=0xB494122Fb840D928d0f0F98E69985a85E9EBC139 \
KEEPER_DEST_CHAIN_IDS=99999,88888 \
npx hardhat run scripts/bridge-keeper.ts --network apothem
```

The keeper persists its last scanned block in `packages/contracts/deployments/bridge-keeper-state.json` (gitignored) and skips already-processed intents.

### Manual startup

```bash
# Terminal 1 â€” Middleware
npm run build -w @xdc-intent/middleware
npm start -w @xdc-intent/middleware

# Terminal 2 â€” Solver A
npm run build -w @xdc-intent/solver
npm run start:a -w @xdc-intent/solver

# Terminal 3 â€” Solver B (competition)
npm run build -w @xdc-intent/solver
npm run start:b -w @xdc-intent/solver

# Terminal 4 â€” Frontend
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

Data on Dashboard, Market, and My Intents refreshes automatically every 3â€“10 seconds via SWR polling.

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

## LayerZero Testnet Cross-Chain E2E

This section documents how to run a real cross-chain intent over LayerZero testnet infrastructure, using **Sepolia** as the source chain and **Arbitrum Sepolia** as the destination chain.

### Prerequisites

1. A funded Sepolia ETH wallet (deployer/user).
2. A funded Arbitrum Sepolia ETH wallet (same deployer/user; solver wallet also needs gas on Sepolia).
3. A second private key for the solver.
4. RPC URLs for Sepolia and Arbitrum Sepolia (Infura/Alchemy public RPCs work).

### Faucets

- **Sepolia ETH**: https://sepoliafaucet.com (Infura), https://faucet.quicknode.com/ethereum/sepolia, or Alchemy Sepolia faucet.
- **Arbitrum Sepolia ETH**: https://faucet.quicknode.com/arbitrum/sepolia or bridge Sepolia ETH via the [Arbitrum Sepolia bridge](https://bridge.arbitrum.io/?l2ChainId=421614).

### Required Environment Variables

Add to `packages/contracts/.env` (and root `.env`):

```bash
DEPLOYER_PRIVATE_KEY=0x...
SOLVER_PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
ARBITRUM_SEPOLIA_RPC_URL=https://arbitrum-sepolia.infura.io/v3/YOUR_INFURA_KEY
ETHERSCAN_API_KEY=...
ARBISCAN_API_KEY=...
```

### Deploy the Testnet Stack

```bash
cd packages/contracts
npx hardhat run scripts/deploy-lz-testnet-stack.ts --network sepolia
```

This deploys:
- On Sepolia: MockUSDC, MockXDC, SimpleDEX (factory/router/pair), Escrow, PaymentVerifier, SolverRegistry, IntentRegistry, IntentLZBridge.
- On Arbitrum Sepolia: MockUSDC, IntentLZBridge.
- Configures trusted remotes between the two bridges.
- Writes all addresses to `packages/contracts/deployments/lz-testnet.json`.

The script is idempotent: if `lz-testnet.json` exists, it reuses existing deployments.

### Run the Cross-Chain E2E

```bash
cd packages/contracts
npx hardhat run scripts/run-lz-e2e.ts --network sepolia
```

The E2E script:
1. Mints test MockUSDC on Sepolia and Arbitrum Sepolia for the user and solver.
2. Creates a cross-chain intent (Sepolia USDC -> Arbitrum Sepolia USDC).
3. Fulfills the intent and releases source tokens to the solver.
4. Solver calls `bridgeOut` on the Sepolia IntentLZBridge, paying LayerZero fees in ETH.
5. Polls Arbitrum Sepolia until the destination bridge delivers the tokens.
6. Verifies the user's Arbitrum Sepolia MockUSDC balance increased.

### Expected Output

```
Intent ID: 0x...
Submitted: 0x...
Fulfilled by: 0x...
BridgeOut: 0x...
PASS: Destination balance increased. LayerZero cross-chain intent completed.
```

### Troubleshooting

#### "insufficient funds for intrinsic transaction cost"
Fund the deployer and solver wallets with Sepolia ETH and Arbitrum Sepolia ETH.

#### "IntentLZBridge: peer not set"
Run the deploy script first to configure trusted remotes.

#### "IntentLZBridge: insufficient fee"
The bridgeOut call did not include enough ETH for the LayerZero fee. The E2E script quotes the fee automatically; raise the buffer if gas prices spike.

#### LayerZero delivery takes too long
Real testnet delivery can take 1-10 minutes depending on DVN/executor congestion. The E2E script polls for up to 10 minutes. Check the bridgeOut transaction on [LayerZero Scan](https://layerzeroscan.com/) using the Sepolia bridgeOut tx hash.

#### "PaymentVerifier: not facilitator"
The IntentRegistry must be registered as a facilitator in PaymentVerifier. The deploy script does this automatically.

#### "IntentRegistry: solver not registered"
Set `SOLVER_PRIVATE_KEY` before running the deploy script so it registers the solver, or manually call `SolverRegistry.registerSolver`.

### Running the Full Solver + Middleware Stack (Optional)

To run the live solver stack instead of the scripted E2E:

1. Update `packages/solver/.env.solver-a`:
   ```bash
   RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
   CHAIN_ID=11155111
   ESCROW_ADDRESS=<from lz-testnet.json>
   PAYMENT_VERIFIER_ADDRESS=<from lz-testnet.json>
   INTENT_REGISTRY_ADDRESS=<from lz-testnet.json>
   SOLVER_REGISTRY_ADDRESS=<from lz-testnet.json>
   LZ_BRIDGE_ADDRESS=<Sepolia IntentLZBridge from lz-testnet.json>
   SUPPORTED_CHAINS=11155111,421614
   CHAIN_RPC_URLS={"11155111":"https://sepolia.infura.io/v3/YOUR_INFURA_KEY","421614":"https://arbitrum-sepolia.infura.io/v3/YOUR_INFURA_KEY"}
   ROUTER_ADDRESS=<Sepolia SimpleDEXRouter from lz-testnet.json>
   ```
2. Start the middleware and solver:
   ```bash
   npm run dev -w @xdc-intent/middleware
   npm run dev:a -w @xdc-intent/solver
   ```
3. Create an intent from the frontend or by adapting `scripts/run-lz-e2e.ts` to skip the scripted fulfillment step.

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

# DEX tests
cd packages/dex
npx hardhat test

# Two-solver quote competition E2E
cd packages/contracts
npx hardhat run scripts/e2e-quote-competition.ts --network apothem

# Cross-chain E2E
cd packages/contracts
npx hardhat run scripts/e2e-cross-chain.ts --network apothem

# LayerZero testnet E2E
cd packages/contracts
npx hardhat run scripts/run-lz-e2e.ts --network sepolia

# One-command automated demo (Windows PowerShell)
npm run demo:e2e
```

## Demo Transaction History

| Run | Intent ID | Winner | Fulfilled Amount | Payment Tx | Bridge Mint Tx |
|---|---|---|---|---|---|
| Two-solver competition (2026-07-06) | `0x97e290cb...f1525a7d` | `0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe` | `1974.32` MXDC | â€” | â€” |
| Cross-chain (2026-07-06) | `0xe921dac5...4133a219` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `198.21` MXDC | â€” | â€” |
| AI agent demo (2026-07-06) | `0xbe165976f566fc509aae1a382347d218edd2c10e5623869b3a40828e15af5939` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `219.78` MXDC | `0x9465e9b4228f71361f3051c4d7096212614dfa6c8169a6f2adc8e0496a3423e5` | â€” |
| Cross-chain (2026-07-07) | `0x247a2a3d...b4554951` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `199.00` MXDC | `0x72094194...2f0efa4f` | `0x3d19ed9d...76648f7` |
| Same-chain (2026-07-07) | `0xbd5188b2...e8b3e578` | `0x9f629D06...34AE1e16` | `200.00` MXDC | `0x3b8dbd79...dfdde6ed` | â€” |
| Cross-chain (2026-07-07) | `0xfcfa747e...a6e49f5` | `0x9f629D06...34AE1e16` | `199.00` MXDC | `0x63c1193f...ee9fbb6` | â€” |
| Same-chain (2026-07-07) | `0x6b48dbd8...0c651003` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `200.00` MXDC | `0xd2d7fd35...c98938df` | â€” |
| Cross-chain (2026-07-07) | `0xd93ef9e7...98e5080` | `0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe` | `199.00` MXDC | `0x3c378b57...48739dc6` | `0xb643a6d4...d0ee57a` |
| Same-chain (2026-07-07) | `0xb6d8d766...fc90795e` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `200.00` MXDC | `0xe8c788c0...f2b7d301` | â€” |
| Cross-chain Beta 88888 (2026-07-07) | `0xd777be92...bb5585e1` | `0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe` | `199.00` MXDC | `0x8eeb8e57...aa1053e9` | `0x8554ad5e...64a8eace1` |
| Same-chain (2026-07-07) | `0x196478c8...d0435214` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `200.00` MXDC | `0x335882e6...0d259684` | â€” |
| Cross-chain Alpha 99999 (2026-07-07) | `0xfa5ef1a3...562233e3e` | `0xd83A98ad44896E841C16Be58b663f70a827c93Ff` | `199.00` MXDC | `0x9e6b3093...2b069eaff` | `0x8dc04f95...ea1fdc51` |

**Note:** `IntentRegistry.fulfillIntent` now accepts an explicit `solver` parameter. The middleware passes the actual winning solver address, so on-chain `solver` matches the off-chain quote winner and source tokens are released to the solver.

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

1. **Describe swap** â€” LLM/local parser returns `inputToken`, `inputAmount`, `outputToken`, `minDestAmount`, `maxSolverFee`.
2. **Create intent** â€” Frontend approves the Escrow to spend MockUSDC and calls `IntentRegistry.submitIntent`.
3. **Quote competition** â€” Solvers A and B submit off-chain quotes to the middleware.
4. **Wait for fulfillment** â€” The best quote wins, the solver pays the middleware via x402 EIP-3009, and `IntentRegistry.fulfillIntent` is called on-chain.

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
2. Solver state is persisted to `packages/solver/data/solver-state-a.json` and `packages/solver/data/solver-state-b.json`.
3. Start again with `npm run demo`.
4. Solvers will resume from the last processed block and re-evaluate any pending intents.

## Security Notes

- `PaymentVerifier.registerFacilitator` is `onlyOwner`. Do not expose the owner key.
- `.env` files are gitignored; never commit keys.
- This is a testnet deployment. Before mainnet, conduct a full audit.
