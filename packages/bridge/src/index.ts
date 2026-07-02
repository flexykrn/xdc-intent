export interface BridgeQuote {
  srcChainId: number;
  dstChainId: number;
  token: string;
  amount: bigint;
  fee: bigint;
  estimatedDstAmount: bigint;
}

export interface BridgeRequest {
  srcChainId: number;
  dstChainId: number;
  token: string;
  amount: bigint;
  recipient: string;
  slippageBps: number;
}

export interface BridgeResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface BridgeAdapter {
  readonly name: string;
  isSupported(srcChainId: number, dstChainId: number, token: string): boolean;
  quote(request: Omit<BridgeRequest, 'recipient' | 'slippageBps'>): Promise<BridgeQuote>;
  bridge(request: BridgeRequest, signer: import('ethers').Signer): Promise<BridgeResult>;
}

// Placeholder for same-chain / no-bridge-required fallback.
export class NoOpBridgeAdapter implements BridgeAdapter {
  readonly name = 'noop';

  isSupported(srcChainId: number, dstChainId: number): boolean {
    return srcChainId === dstChainId;
  }

  async quote(request: Omit<BridgeRequest, 'recipient' | 'slippageBps'>): Promise<BridgeQuote> {
    return {
      srcChainId: request.srcChainId,
      dstChainId: request.dstChainId,
      token: request.token,
      amount: request.amount,
      fee: 0n,
      estimatedDstAmount: request.amount,
    };
  }

  async bridge(request: BridgeRequest): Promise<BridgeResult> {
    return {
      success: true,
      txHash: '0x' + '0'.repeat(64),
    };
  }
}

// Stargate / LayerZero bridge adapter skeleton.
// Addresses and pool IDs are placeholders; populate from deployment config.
export class StargateBridgeAdapter implements BridgeAdapter {
  readonly name = 'stargate';

  constructor(
    private routerAddress: string,
    private endpointAddress: string,
    private poolIds: Record<number, Record<string, number>>,
    private provider: import('ethers').Provider
  ) {}

  isSupported(srcChainId: number, dstChainId: number, token: string): boolean {
    return !!this.poolIds[srcChainId]?.[token.toLowerCase()] && !!this.poolIds[dstChainId]?.[token.toLowerCase()];
  }

  async quote(request: Omit<BridgeRequest, 'recipient' | 'slippageBps'>): Promise<BridgeQuote> {
    const router = this.getRouter();
    const poolId = this.poolIds[request.srcChainId][request.token.toLowerCase()];

    // Stargate swap fee is composed of pool fee + protocol fee.
    const fee = await router.quoteLayerZeroFee(
      request.dstChainId,
      1, // TYPE_SWAP_REMOTE
      '0x0000000000000000000000000000000000000000',
      '0x',
      {
        dstGasForCall: 0,
        dstNativeAmount: 0,
        dstNativeAddr: '0x',
      }
    );

    return {
      srcChainId: request.srcChainId,
      dstChainId: request.dstChainId,
      token: request.token,
      amount: request.amount,
      fee: fee[0],
      estimatedDstAmount: request.amount - fee[0],
    };
  }

  async bridge(request: BridgeRequest, signer: import('ethers').Signer): Promise<BridgeResult> {
    try {
      const router = this.getRouter().connect(signer);
      const poolId = this.poolIds[request.srcChainId][request.token.toLowerCase()];
      const dstPoolId = this.poolIds[request.dstChainId][request.token.toLowerCase()];
      const minAmount = (request.amount * BigInt(10000 - request.slippageBps)) / 10000n;

      const tx = await router.swap(
        request.dstChainId,
        poolId,
        dstPoolId,
        request.recipient,
        request.amount,
        minAmount,
        {
          dstGasForCall: 0,
          dstNativeAmount: 0,
          dstNativeAddr: '0x',
        },
        request.recipient,
        '0x'
      );

      const receipt = await tx.wait();
      return { success: true, txHash: receipt?.hash || tx.hash };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private getRouter() {
    const routerAbi = [
      'function quoteLayerZeroFee(uint16 _dstChainId, uint8 _functionType, bytes _toAddress, bytes _transferAndCallPayload, tuple(uint256 dstGasForCall, uint256 dstNativeAmount, bytes dstNativeAddr) _lzTxParams) external view returns (uint256 nativeFee, uint256 zroFee)',
      'function swap(uint16 _dstChainId, uint256 _srcPoolId, uint256 _dstPoolId, address _refundAddress, uint256 _amountLD, uint256 _minAmountLD, tuple(uint256 dstGasForCall, uint256 dstNativeAmount, bytes dstNativeAddr) _lzTxParams, bytes _to, bytes calldata _payload) external payable returns (uint256 nonce)',
    ];
    return new (require('ethers').Contract)(this.routerAddress, routerAbi, this.provider);
  }
}

export function createBridgeAdapter(config: {
  type: 'noop' | 'stargate';
  routerAddress?: string;
  endpointAddress?: string;
  poolIds?: Record<number, Record<string, number>>;
  provider?: import('ethers').Provider;
}): BridgeAdapter {
  if (config.type === 'stargate') {
    if (!config.routerAddress || !config.endpointAddress || !config.poolIds || !config.provider) {
      throw new Error('Stargate adapter requires routerAddress, endpointAddress, poolIds, and provider');
    }
    return new StargateBridgeAdapter(config.routerAddress, config.endpointAddress, config.poolIds, config.provider);
  }
  return new NoOpBridgeAdapter();
}
