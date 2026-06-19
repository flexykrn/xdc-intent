# XDC Intent Framework - Deployment Runbook

## Overview

This document describes the deployment process for the XDC Intent Framework contracts.

## Contract Deployment Order

Contracts MUST be deployed in the following order:

1. **Escrow** - Token vault with protocol fees
2. **PaymentVerifier** - EIP-712 signature verification
3. **IntentRegistry** - Intent lifecycle management

## Wiring

After deployment, the following connections must be established:

1. **Escrow.setRegistry(IntentRegistry)** - Allows registry to lock/release tokens
2. **PaymentVerifier.addSigner(deployer)** - Authorizes deployer to sign payment proofs

## Deployment Steps

### Local Testing

```bash
npx hardhat run scripts/deploy.ts --network hardhat
```

### XDC Apothem Testnet

1. Ensure `DEPLOYER_PRIVATE_KEY` is set in `.env`
2. Ensure `TREASURY_ADDRESS` is set in `.env`
3. Run:

```bash
npx hardhat run scripts/deploy.ts --network apothem
```

### XDC Mainnet

1. Ensure `DEPLOYER_PRIVATE_KEY` is set in `.env`
2. Ensure `TREASURY_ADDRESS` is set in `.env`
3. Run:

```bash
npx hardhat run scripts/deploy.ts --network xdc
```

## Verification

After deployment, verify contracts on the explorer:

```bash
npx hardhat run scripts/verify.ts --network apothem
```

## Deployment Output

Deployment information is saved to `deployments/<network>.json`:

```json
{
  "network": "apothem",
  "chainId": 51,
  "deployer": "0x...",
  "treasury": "0x...",
  "contracts": {
    "Escrow": "0x...",
    "PaymentVerifier": "0x...",
    "IntentRegistry": "0x..."
  },
  "timestamp": "2026-06-19T..."
}
```

## Post-Deployment Checks

1. Verify Escrow has correct treasury address
2. Verify IntentRegistry is set as registry in Escrow
3. Verify deployer is authorized signer in PaymentVerifier
4. Test creating an intent on testnet
5. Verify events are emitted correctly

## Troubleshooting

### "Insufficient funds"
- Ensure deployer wallet has enough XDC for gas
- On testnet, get XDC from faucet: https://faucet.apothem.network

### "Contract verification failed"
- Wait 5-10 minutes after deployment before verifying
- Ensure constructor arguments match exactly
- Check API key is correct in `.env`

### "Registry not set"
- Run wiring step manually:
```bash
npx hardhat run scripts/deploy.ts --network <network>
```
