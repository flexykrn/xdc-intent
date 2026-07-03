# XDC Intent Framework

Intent-based trading framework on the XDC Network. Users sign intents specifying desired swap outcomes; solvers compete to fulfill them atomically via smart contracts.

## Deployed Contracts (XDC Apothem Testnet)

| Contract | Address | Verified |
|---|---|---|
| Escrow | `0xE15BcFf9046D1c1aa446006839963576E882236f` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0xE15BcFf9046D1c1aa446006839963576E882236f/) |
| PaymentVerifier | `0x16Be0618263dD0C286E8A5ec2f62D5dFB0B9fA03` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0x16Be0618263dD0C286E8A5ec2f62D5dFB0B9fA03/) |
| IntentRegistry | `0xDc392f24c9F09E5FD7cAFfB61b1feeD17e7D652F` | [Sourcify](https://repo.sourcify.dev/contracts/full_match/51/0xDc392f24c9F09E5FD7cAFfB61b1feeD17e7D652F/) |
| MockUSDC | `0xB2F1309AA1C141C3B989085D20922ffA6e83cB1b` | — |
| MockXDC | `0x78932974fB9fbC7fceE9bd94e72764018C8C3D46` | — |

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
