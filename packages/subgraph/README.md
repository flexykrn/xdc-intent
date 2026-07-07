# XDC Intent Framework Subgraph

## Overview

Graph Protocol subgraph for indexing XDC Intent Framework events on the Apothem testnet.

## Deployed Contracts (Apothem)

- **IntentRegistry**: `0xfe1887C1686cF54d83107DAf7Ad7F5A5Ea95419b`
- **Escrow**: `0x5c6fb5D7E81e11C303e5cE00fBE7AE748a47690d`
- **PaymentVerifier**: `0x6Ce223bD961217917aa16654E77A6A440f35A70A`
- **SolverRegistry**: `0x4F87a92E3950ec53AFC1776F14Af33c6E9aab360`
- **MockBridge**: `0xB494122Fb840D928d0f0F98E69985a85E9EBC139`

## Entities

- **Intent** - Individual cross-chain trading intents
- **User** - Intent creators
- **Solver** - Registered intent fulfillers
- **Token** - Source/destination tokens
- **EscrowLock** - Tokens locked in escrow
- **EscrowRelease** - Tokens released to solver or refunded to user
- **DailyStats** - Aggregated daily metrics

## Setup

```bash
# Install dependencies
npm install

# Generate code from schema and ABIs
npm run codegen

# Build
npm run build

# Run smoke test (codegen + build)
npm run test
```

## Deploy

```bash
# Deploy to The Graph Hosted Service
graph deploy --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs/ flexykrn/xdc-intent
```

## Local Development

```bash
# Start local graph node
npm run create-local
npm run deploy-local
```

## Query Examples

```graphql
# Get all open intents
{
  intents(where: { status: Open }) {
    id
    user { id }
    sourceToken { id symbol }
    destToken { id symbol }
    sourceAmount
    minDestAmount
    expiry
  }
}

# Get solver leaderboard
{
  solvers(orderBy: totalVolume, orderDirection: desc) {
    id
    name
    active
    totalFulfilled
    totalVolume
  }
}

# Get daily stats
{
  dailyStats(orderBy: date, orderDirection: desc) {
    date
    totalIntents
    totalFulfilled
    totalVolume
    totalFulfilledAmount
  }
}
```
