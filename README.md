# XDC Intent Framework

Intent-based trading framework on the XDC Network. Users sign intents specifying desired swap outcomes; solvers compete to fulfill them atomically via smart contracts.

## Deployed Contracts (XDC Apothem Testnet)

| Contract | Address | Verified |
|---|---|---|
| Escrow | `0x972E97d4898AfDF642627C3E05b105fCAc3F84D4` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0x972E97d4898AfDF642627C3E05b105fCAc3F84D4/) |
| PaymentVerifier | `0xf15AE12caF60fFA09CAcd6f823187aDC2fe4AeC6` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0xf15AE12caF60fFA09CAcd6f823187aDC2fe4AeC6/) |
| IntentRegistry | `0x443Ba13baE4D122430737B72eA90E821F3C015Dc` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0x443Ba13baE4D122430737B72eA90E821F3C015Dc/) |
| MockUSDC | `0xa3f37BBd132C6DA9088B4A63622CacbCBee394A4` | — |
| MockXDC | `0x6DC37E3ca98E49e923E953c5A7229726513eaf6E` | — |

Explorer: https://testnet.xdcscan.com

## Architecture

- **Contracts** (`packages/contracts`): `IntentRegistry`, `Escrow`, `PaymentVerifier`.
- **SDK** (`packages/sdk`): EIP-712 intent signing and contract interaction.
- **Solver** (`packages/solver`): Watches chain, evaluates profitability, pays facilitator, fulfills intents.
- **Middleware** (`packages/middleware`): x402-style facilitator that verifies on-chain ERC-20 payments.
- **Frontend** (`packages/frontend`): Next.js app for creating and tracking intents.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
copy .env.example .env
# fill DEPLOYER_PRIVATE_KEY, SOLVER_PRIVATE_KEY, XDC_TESTNET_RPC

# Run the full demo (PowerShell)
.\scripts\demo.ps1
```

See [`docs/runbook.md`](docs/runbook.md) for detailed operations.

## Verification

```bash
# Contract tests
cd packages/contracts
npx hardhat test test/IntentRegistry.ts test/SmokeTest.ts

# Static analysis
npm run slither

# Build all packages
npm run build -w @xdc-intent/sdk
npm run build -w @xdc-intent/middleware
npm run build -w @xdc-intent/solver
npm run build -w @xdc-intent/bridge
npm run build -w frontend

# Auto end-to-end test
cd packages/contracts
npx hardhat run scripts/e2e-apothem-auto.ts --network apothem
```

## Status

- Contracts deployed and verified on Sourcify.
- Auto-fulfillment loop tested end-to-end on Apothem.
- Solver has persistent JSON state, health/metrics endpoints, and block polling.
- Frontend builds and runs; manual wallet test is the final step before mainnet.

## Security

- `PaymentVerifier.registerFacilitator` is `onlyOwner`.
- Slither runs with 0 findings.
- This is a testnet deployment; audit before mainnet.
