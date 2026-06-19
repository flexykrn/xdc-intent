# @xdc-intent/sdk

XDC Intent Framework SDK — Intent-based trading on XDC Network

## Installation

```bash
npm install @xdc-intent/sdk
```

## Quick Start

```typescript
import { XDCIntentSDK, IntentStatus, CHAIN_IDS } from '@xdc-intent/sdk';
import { ethers } from 'ethers';

// Initialize SDK
const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

const sdk = new XDCIntentSDK({
  provider,
  signer,
  chainId: CHAIN_IDS.XDC_APOTHEM, // 51 for testnet, 50 for mainnet
});

// Create an intent
const intentId = XDCIntentSDK.generateIntentId();
const tx = await sdk.createIntent({
  intentId,
  token: '0x...', // Token address
  amount: ethers.parseEther('100'),
  expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
});

await tx.wait();
console.log('Intent created:', tx.hash);

// Check intent status
const intent = await sdk.getIntent(intentId);
console.log('Status:', intent.status === IntentStatus.Pending ? 'Pending' : 'Other');

// Cancel intent (if still pending)
const cancelTx = await sdk.cancelIntent(intentId);
await cancelTx.wait();
console.log('Intent cancelled:', cancelTx.hash);
```

## Features

### Intent Operations
- `createIntent()` — Create and submit an intent
- `createIntentBatch()` — Create multiple intents at once
- `cancelIntent()` — Cancel a pending intent (owner only)
- `expireIntent()` — Expire an intent after expiry time
- `fulfillIntent()` — Fulfill an intent with payment proof

### Payment Proofs
- `createPaymentProof()` — Generate a payment proof
- `signPaymentProof()` — Sign a payment proof with EIP-712
- `signIntent()` — Sign an intent with EIP-712

### Event Watching (WebSocket + Polling)

```typescript
// WebSocket (real-time)
const wsSdk = new XDCIntentSDK({
  provider,
  signer,
  chainId: CHAIN_IDS.XDC_APOTHEM,
  webSocketUrl: 'wss://erpc.apothem.network/ws',
});

const watcher = wsSdk.watchIntents((intentId, user, token, amount, expiry) => {
  console.log('New intent:', intentId);
});

// Check if watcher is active
console.log(watcher.isActive()); // true

// Unsubscribe
watcher.unsubscribe();

// HTTP Polling (fallback if no WebSocket)
const httpSdk = new XDCIntentSDK({
  provider,
  signer,
  chainId: CHAIN_IDS.XDC_APOTHEM,
  pollingInterval: 5000, // 5 seconds
});

const pollWatcher = httpSdk.watchIntents((intentId, user, token, amount, expiry) => {
  console.log('New intent:', intentId);
});
```

### Error Recovery

```typescript
// Automatic retry for transient errors
try {
  const result = await sdk.recover(
    () => sdk.createIntent({ intentId, token, amount, expiry }),
    { maxRetries: 3, delayMs: 1000 }
  );
} catch (error) {
  // Get user-friendly message
  const message = sdk.getUserMessage(error);
  console.log(message); // "Intent is not pending. It may have been fulfilled..."
}
```

### Utilities
- `checkChainId()` — Verify wallet is on correct network
- `normalizeAddress()` — Convert xdc-prefixed addresses to 0x
- `computeIntentId()` — Compute deterministic intent ID
- `generateIntentId()` — Generate random intent ID
- `estimateIntentCost()` — Estimate gas and protocol fees
- `submitWithRetry()` — Submit transaction with automatic retry

### Error Handling
- User-friendly error messages instead of raw reverts
- Automatic retry for transient errors (network, timeout)
- No retry for permanent errors (insufficient funds, invalid signature)

## API Reference

### XDCIntentSDK

#### Constructor
```typescript
new XDCIntentSDK(config: {
  provider: ethers.Provider;
  signer?: ethers.Signer;
  chainId: number;
  contractAddresses?: {
    escrow: string;
    paymentVerifier: string;
    intentRegistry: string;
  };
})
```

#### Intent Methods
- `createIntent(input: CreateIntentInput): Promise<TransactionResponse>`
- `createIntentBatch(inputs: IntentInput[], nonce?: number): Promise<SignedIntent[]>`
- `cancelIntent(intentId: string): Promise<TransactionResponse>`
- `expireIntent(intentId: string): Promise<TransactionResponse>`
- `fulfillIntent(input: FulfillIntentInput): Promise<TransactionResponse>`

#### View Methods
- `getIntent(intentId: string): Promise<Intent>`
- `getUserIntents(user: string): Promise<string[]>`
- `getSolverIntents(solver: string): Promise<string[]>`
- `isIntentPending(intentId: string): Promise<boolean>`
- `getEscrowBalance(token: string, user: string, intentId: string): Promise<bigint>`
- `getTotalIntents(): Promise<bigint>`
- `getTotalIntentsFulfilled(): Promise<bigint>`

#### Event Methods
- `watchIntents(callback, filter?): EventWatcher`
- `watchFulfillments(callback, filter?): EventWatcher`
- `watchCancellations(callback): EventWatcher`
- `pollIntents(userAddress?, fromBlock?, toBlock?): Promise<Intent[]>`
- `cleanupAllListeners(): void`

#### Utility Methods
- `checkChainId(): Promise<void>`
- `estimateIntentCost(token, amount, gasPrice?): Promise<CostEstimate>`
- `submitWithRetry(txFn, options?): Promise<T>`
- `recover(operation, options?): Promise<T>`
- `getUserMessage(error): string`
- `isWebSocketConnected(): boolean`

### Types

```typescript
interface Intent {
  intentId: string;
  user: string;
  token: string;
  amount: bigint;
  expiry: number;
  status: IntentStatus;
  solver: string;
  createdAt: number;
  fulfilledAt: number;
  cancelledAt: number;
  expiredAt: number;
}

enum IntentStatus {
  Pending = 0,
  Fulfilled = 1,
  Cancelled = 2,
  Expired = 3,
}

interface CreateIntentInput {
  intentId: string;
  token: string;
  amount: string | bigint;
  expiry: number;
}

interface CostEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  gasCost: bigint;
  protocolFee: bigint;
  totalCost: bigint;
  totalCostUsd: number;
}

interface EventWatcher {
  unsubscribe: () => void;
  isActive: () => boolean;
}

interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

## Chain IDs

| Network | Chain ID |
|---------|----------|
| XDC Mainnet | 50 |
| XDC Apothem Testnet | 51 |
| Hardhat Local | 31337 |

## Error Handling

The SDK provides user-friendly error messages:

| Raw Error | User-Friendly Message |
|-----------|----------------------|
| `IntentRegistry: not pending` | Intent is not pending. It may have been fulfilled, cancelled, or expired. |
| `IntentRegistry: not intent owner` | You are not the owner of this intent. |
| `Escrow: token not supported` | This token is not supported. Please use a supported token. |
| `SafeERC20: low-level call failed` | Token transfer failed. Please check your token balance and allowance. |

## Testing

```bash
npm test
```

## License

MIT
