# XDC Intent Framework

Intent-based trading framework on the XDC Network. Users sign intents specifying desired swap outcomes; solvers compete to fulfill them atomically via smart contracts.

## Deployed Contracts (XDC Apothem Testnet)

| Contract | Address | Verified |
|---|---|---|
| Escrow | `0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288/) |
| PaymentVerifier | `0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6/) |
| IntentRegistry | `0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4/) |
| MockUSDC | `0x86530A99784D188e8343e119140114d9e5fD0546` | — |
| MockXDC | `0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312` | — |

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
