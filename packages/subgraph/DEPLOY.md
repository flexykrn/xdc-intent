# Subgraph Deployment Guide

This guide covers deploying the XDC Intent subgraph to a hosted service so the frontend can query indexed intent data instead of (or in addition to) RPC polling.

## Current Configuration

- `subgraph.yaml` is configured for **Apothem** (`network: apothem`) using these contracts:
  - `IntentRegistry`: `0xfe1887C1686cF54d83107DAf7Ad7F5A5Ea95419b`
  - `Escrow`: `0x5c6fb5D7E81e11C303e5cE00fBE7AE748a47690d`
  - `SolverRegistry`: `0x4F87a92E3950ec53AFC1776F14Af33c6E9aab360`

- The subgraph indexes `IntentSubmitted`, `IntentFulfilled`, `IntentCancelled`, escrow lock/release events, and solver registry events.
- Solver quotes are **not** indexed by the subgraph; they are served by the middleware/API and remain a frontend RPC/API fallback.

## Prerequisites

1. Install dependencies (run from the workspace root):

```bash
npm install
```

2. Build the subgraph locally to make sure it compiles:

```bash
npm run build -w @xdc-intent/subgraph
```

## Option A: The Graph Studio

The Graph Studio is the recommended hosted service for EVM chains that The Graph supports.

### 1. Create a subgraph on The Graph Studio

1. Go to https://thegraph.com/studio/ and connect your wallet.
2. Click **Create Subgraph** and choose a slug, e.g. `xdc-intent`.
3. Note your **subgraph name** (e.g. `flexykrn/xdc-intent`) and **deploy key** from the studio UI.

> **Note:** The Graph Studio may not support the `apothem` network name. If deployment fails with an unsupported network error, use **Goldsky** (Option B) or verify whether Studio expects `xdc-testnet`, `xdc-apothem`, or another alias.

### 2. Authenticate the CLI

```bash
npx graph auth --studio <YOUR_DEPLOY_KEY>
```

### 3. Deploy

```bash
cd packages/subgraph
npx graph codegen
npx graph build
npx graph deploy --studio xdc-intent
```

- The CLI will ask for a version label (e.g. `v0.0.1`).
- After indexing, the query URL will look like:

```text
https://api.studio.thegraph.com/query/<YOUR_ACCOUNT>/xdc-intent/<VERSION>
```

Copy this URL into the frontend environment:

```text
NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/<YOUR_ACCOUNT>/xdc-intent/<VERSION>
```

## Option B: Goldsky (Recommended if Apothem is Unsupported by Studio)

Goldsky supports Apothem and is compatible with the same `subgraph.yaml` format.

1. Install the Goldsky CLI and log in:

```bash
npm install -g @goldskycom/cli
goldsky login
```

2. Create and deploy the subgraph:

```bash
cd packages/subgraph
npx graph codegen
npx graph build

# Replace <VERSION> with a semver tag, e.g. v0.0.1
goldsky subgraph create xdc-intent/<VERSION> --network apothem
goldsky subgraph deploy xdc-intent/<VERSION> --path .
```

3. After deployment, Goldsky will provide a query URL. Set it in the frontend:

```text
NEXT_PUBLIC_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_clz.../subgraphs/xdc-intent/<VERSION>/gn
```

## Frontend Wiring

Once deployed, add the query URL to `packages/frontend/.env.local`:

```text
NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/<YOUR_ACCOUNT>/xdc-intent/<VERSION>
```

The Dashboard page will prefer subgraph data when this variable is set and fall back to the existing RPC/API endpoints if it is missing, the subgraph errors, or the URL is unreachable.

## Deployed Subgraph URL Placeholder

```text
https://api.studio.thegraph.com/query/<YOUR_ACCOUNT>/xdc-intent/<VERSION>
```

Replace `<YOUR_ACCOUNT>` and `<VERSION>` with the values from your The Graph Studio dashboard (or the equivalent Goldsky URL).
