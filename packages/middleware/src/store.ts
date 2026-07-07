import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { CAIP2 } from '@xdc-intent/constants';

dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://erpc.apothem.network';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '51');
const NETWORK = CAIP2[CHAIN_ID] || `eip155:${CHAIN_ID}`;

const provider = new ethers.JsonRpcProvider(RPC_URL);

const IntentRegistryABI = [
  'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))',
  'function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash, address solver) external returns (bool)',
];

const SolverRegistryABI = [
  'function isRegistered(address solver) external view returns (bool)',
  'function supportsChain(address solver, uint256 chainId) external view returns (bool)',
];

const PaymentVerifierABI = [
  'function facilitators(address) external view returns (bool)',
];

const MockBridgeABI = [
  'event BridgeOut(bytes32 indexed intentId, address indexed token, uint256 amount, uint256 indexed destChainId, address sender)',
  'event BridgeIn(bytes32 indexed intentId, address indexed token, uint256 amount, uint256 indexed sourceChainId, address recipient)',
  'function processed(bytes32 intentId) external view returns (bool)',
  'function bridgeOutProcessed(bytes32 intentId) external view returns (bool)',
  'function mintProcessed(bytes32 intentId) external view returns (bool)',
  'function lockedBalances(address token) external view returns (uint256)',
];

const intentRegistry = new ethers.Contract(process.env.INTENT_REGISTRY_ADDRESS || '', IntentRegistryABI, provider);
const solverRegistry = new ethers.Contract(process.env.SOLVER_REGISTRY_ADDRESS || '', SolverRegistryABI, provider);
const paymentVerifier = new ethers.Contract(process.env.PAYMENT_VERIFIER_ADDRESS || '', PaymentVerifierABI, provider);
const mockBridge = new ethers.Contract(process.env.MOCK_BRIDGE_ADDRESS || '', MockBridgeABI, provider);

export interface BridgeStatus {
  intentId: string;
  sourceChainId: number;
  destChainId: number;
  state: 'pending' | 'locked' | 'minted' | 'failed';
  locked: boolean;
  lockedAmount: string;
  lockedToken: string;
  minted: boolean;
  mintedAmount: string;
  mintedToken?: string;
  bridgeOutTxHash?: string;
  bridgeInTxHash?: string;
  processed: boolean;
  error?: string;
  updatedAt: number;
}

export const SUPPORTED_MOCK_DEST_CHAINS = (process.env.SUPPORTED_MOCK_DEST_CHAIN_IDS || '99999,88888')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n));

const bridgeStatusCache = new Map<string, BridgeStatus>();

function isCrossChain(sourceChainId: number, destChainId: number): boolean {
  return sourceChainId !== destChainId;
}

export function isSupportedMockDestChain(chainId: number): boolean {
  return SUPPORTED_MOCK_DEST_CHAINS.includes(chainId);
}

export async function getBridgeStatus(intentId: string): Promise<BridgeStatus> {
  const cached = bridgeStatusCache.get(intentId);
  if (cached) return cached;

  const intent = await getIntentDetails(intentId);
  const status: BridgeStatus = {
    intentId,
    sourceChainId: intent.sourceChainId,
    destChainId: intent.destChainId,
    state: 'pending',
    locked: false,
    lockedAmount: '0',
    lockedToken: intent.sourceToken,
    minted: false,
    mintedAmount: '0',
    processed: false,
    updatedAt: Date.now(),
  };

  if (!isCrossChain(intent.sourceChainId, intent.destChainId)) {
    status.state = 'minted';
    status.minted = true;
    status.processed = true;
    return status;
  }

  if (!isSupportedMockDestChain(intent.destChainId)) {
    status.error = `Unsupported destination chain ${intent.destChainId}`;
    status.state = 'failed';
    return status;
  }

  try {
    const [processed, bridgeOutProcessed, mintProcessed, currentBlock] = await Promise.all([
      mockBridge.processed(intentId).catch(() => false),
      mockBridge.bridgeOutProcessed(intentId).catch(() => false),
      mockBridge.mintProcessed(intentId).catch(() => false),
      provider.getBlockNumber(),
    ]);
    status.processed = processed;

    const fromBlock = Math.max(0, currentBlock - 100000);

    const outEvents = await mockBridge.queryFilter(mockBridge.filters.BridgeOut(intentId), fromBlock, currentBlock);
    if (outEvents.length > 0) {
      const event = outEvents[outEvents.length - 1] as ethers.EventLog;
      status.locked = true;
      status.lockedAmount = event.args[2].toString();
      status.lockedToken = event.args[1];
      status.bridgeOutTxHash = event.transactionHash;
      status.destChainId = Number(event.args[3]);
      status.state = mintProcessed ? 'minted' : 'locked';
    }

    const inEvents = await mockBridge.queryFilter(mockBridge.filters.BridgeIn(intentId), fromBlock, currentBlock);
    if (inEvents.length > 0) {
      const event = inEvents[inEvents.length - 1] as ethers.EventLog;
      status.minted = true;
      status.mintedAmount = event.args[2].toString();
      status.mintedToken = event.args[1];
      status.bridgeInTxHash = event.transactionHash;
      status.state = 'minted';
    } else if (bridgeOutProcessed && !mintProcessed) {
      status.state = 'locked';
    }
  } catch (error: any) {
    console.error(`Failed to fetch bridge status for ${intentId}:`, error.message);
    status.error = error.message;
    if (status.state === 'pending') {
      status.state = 'failed';
    }
  }

  status.updatedAt = Date.now();
  bridgeStatusCache.set(intentId, status);
  return status;
}

export function invalidateBridgeStatus(intentId: string): void {
  bridgeStatusCache.delete(intentId);
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  resource: {
    url: string;
    description?: string;
  };
  accepts: PaymentRequirements[];
}

export interface PaymentPayload {
  x402Version: number;
  accepted: PaymentRequirements;
  payload: {
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
  };
}

export interface Quote {
  intentId: string;
  solverAddress: string;
  outputAmount: string;
  feeBps: number;
  signature: string;
  createdAt: number;
}

const quotes = new Map<string, Quote[]>();

const tokenMetadataCache = new Map<string, { name: string; version: string }>();

async function getTokenMetadata(tokenAddress: string): Promise<{ name: string; version: string }> {
  const cached = tokenMetadataCache.get(tokenAddress);
  if (cached) return cached;

  try {
    const token = new ethers.Contract(
      tokenAddress,
      [
        'function name() view returns (string)',
        'function version() view returns (string)',
      ],
      provider
    );
    const name = await token.name();
    let version = '1';
    try {
      version = await token.version();
    } catch {
      // OpenZeppelin EIP712 defaults to "1"
    }
    const metadata = { name, version };
    tokenMetadataCache.set(tokenAddress, metadata);
    return metadata;
  } catch (error: any) {
    return { name: 'Mock Token', version: '1' };
  }
}

export async function getIntentPaymentRequirements(intentId: string, destToken: string, maxSolverFee: string, payTo: string, url: string): Promise<PaymentRequired> {
  const metadata = await getTokenMetadata(destToken);
  return {
    x402Version: 2,
    resource: {
      url,
      description: `Fulfill intent ${intentId}`,
    },
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        asset: destToken,
        amount: maxSolverFee,
        payTo,
        maxTimeoutSeconds: 600,
        extra: { intentId, tokenName: metadata.name, tokenVersion: metadata.version },
      },
    ],
  };
}

export async function getIntentDetails(intentId: string) {
  const result = await intentRegistry.getIntent(intentId);
  return {
    intentId: result.intentId,
    user: result.user,
    sourceChainId: Number(result.sourceChainId),
    sourceToken: result.sourceToken,
    sourceAmount: result.sourceAmount.toString(),
    destChainId: Number(result.destChainId),
    destToken: result.destToken,
    minDestAmount: result.minDestAmount.toString(),
    maxSolverFee: result.maxSolverFee.toString(),
    expiry: Number(result.expiry),
    nonce: result.nonce.toString(),
    allowedSolvers: result.allowedSolvers,
    status: Number(result.status),
    solver: result.solver,
    fulfilledAmount: result.fulfilledAmount.toString(),
    paymentTxHash: result.paymentTxHash,
  };
}

export function addQuote(quote: Quote): void {
  const normalized: Quote = {
    ...quote,
    solverAddress: ethers.getAddress(quote.solverAddress),
  };
  const list = quotes.get(normalized.intentId) || [];
  const index = list.findIndex((q) => ethers.getAddress(q.solverAddress) === normalized.solverAddress);
  if (index >= 0) {
    list[index] = normalized;
  } else {
    list.push(normalized);
  }
  quotes.set(normalized.intentId, list);
}

export function verifyQuoteSignature(quote: Quote): boolean {
  try {
    const message = JSON.stringify({
      intentId: quote.intentId,
      outputAmount: quote.outputAmount.toString(),
      solver: ethers.getAddress(quote.solverAddress),
    });
    const recovered = ethers.verifyMessage(message, quote.signature);
    return ethers.getAddress(recovered) === ethers.getAddress(quote.solverAddress);
  } catch {
    return false;
  }
}

export function isAllowedSolver(solverAddress: string, allowedSolvers: string[]): boolean {
  if (allowedSolvers.length === 0) return true;
  const normalized = ethers.getAddress(solverAddress);
  return allowedSolvers.some((addr) => ethers.getAddress(addr) === normalized);
}

export async function isSolverRegisteredAndSupportsChain(solverAddress: string, destChainId: number): Promise<boolean> {
  const normalized = ethers.getAddress(solverAddress);
  const [registered, supports] = await Promise.all([
    solverRegistry.isRegistered(normalized),
    solverRegistry.supportsChain(normalized, BigInt(destChainId)),
  ]);
  return registered && supports;
}

export async function isFacilitator(address: string): Promise<boolean> {
  return paymentVerifier.facilitators(ethers.getAddress(address));
}

export async function fulfillIntent(
  intentId: string,
  destAmount: string,
  paymentTxHash: string,
  solver: string,
  signer: ethers.Signer
): Promise<ethers.ContractTransactionResponse> {
  const contract = new ethers.Contract(process.env.INTENT_REGISTRY_ADDRESS || '', IntentRegistryABI, signer);
  const tx = await contract.fulfillIntent(intentId, destAmount, paymentTxHash, solver);
  await tx.wait();
  return tx;
}

export function getQuotes(intentId: string): Quote[] {
  return quotes.get(intentId) || [];
}

export function clearQuotes(intentId: string): void {
  quotes.delete(intentId);
}

export function getBestQuote(intentId: string): Quote | null {
  const list = getQuotes(intentId);
  if (list.length === 0) return null;
  return list.reduce((best, current) =>
    BigInt(current.outputAmount) > BigInt(best.outputAmount) ? current : best
  );
}

export function validatePaymentPayload(payload: any): payload is PaymentPayload {
  return (
    payload &&
    payload.x402Version === 2 &&
    payload.accepted &&
    payload.payload &&
    payload.payload.authorization &&
    typeof payload.payload.signature === 'string'
  );
}

export function safeBase64Encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

export function safeBase64Decode(str: string): unknown {
  return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
}
