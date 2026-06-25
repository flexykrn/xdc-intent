# XDC Intent Framework Subgraph

## Overview

Graph Protocol subgraph for indexing XDC Intent Framework events.

## Entities

- **Intent** - Individual trading intents
- **User** - Intent creators
- **Solver** - Intent fulfillers
- **Token** - Traded tokens
- **Batch** - Auction batches
- **Bid** - Solver bids
- **EscrowLock/Release** - Token custody events
- **DailyStats** - Aggregated daily metrics

## Setup

```bash
# Install dependencies
npm install -g @graphprotocol/graph-cli

# Generate code from schema
graph codegen

# Build
graph build

# Deploy to The Graph
graph deploy --node https://api.thegraph.com/deploy/ --ipfs https://api.thegraph.com/ipfs/ flexykrn/xdc-intent
```

## Local Development

```bash
# Start local graph node
docker-compose up

# Create subgraph
graph create --node http://localhost:8020/ flexykrn/xdc-intent

# Deploy
graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 flexykrn/xdc-intent
```

## Query Examples

```graphql
# Get all pending intents
{
  intents(where: { status: Pending }) {
    id
    user { id }
    token { id symbol }
    amount
    expiryTimestamp
  }
}

# Get solver leaderboard
{
  solvers(orderBy: totalVolume, orderDirection: desc) {
    id
    totalFulfilled
    totalVolume
    reputationScore
  }
}

# Get daily stats
{
  dailyStats(orderBy: date, orderDirection: desc) {
    date
    totalIntents
    totalFulfilled
    totalVolume
  }
}
```
