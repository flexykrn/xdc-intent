import { ethers } from 'ethers';

export interface BridgeQuote {
  sourceChainId: number;
  destChainId: number;
  inputToken: string;
  outputToken: string;
  inputAmount: bigint;
  outputAmount: bigint;
  bridgeCost: bigint;
  gasEstimate: bigint;
}

export interface BridgeAdapter {
  getBridgeCost(sourceChainId: number, destChainId: number, amount: bigint): Promise<bigint>;
  quoteCrossChain(
    sourceChainId: number,
    destChainId: number,
    inputToken: string,
    outputToken: string,
    inputAmount: bigint
  ): Promise<BridgeQuote>;
  executeBridge?(quote: BridgeQuote, signer: ethers.Signer): Promise<ethers.TransactionResponse | undefined>;
}

export class MockBridgeAdapter implements BridgeAdapter {
  private bridge?: ethers.Contract;
  private bridgeFeeBps: number;

  constructor(
    bridgeAddress: string | undefined,
    private provider: ethers.Provider,
    bridgeFeeBps: number = 50
  ) {
    this.bridgeFeeBps = bridgeFeeBps;
    if (bridgeAddress) {
      const abi = [
        'function bridgeOut(bytes32 intentId, address token, uint256 amount, uint256 destChainId) external',
        'function processed(bytes32 intentId) external view returns (bool)',
      ];
      this.bridge = new ethers.Contract(bridgeAddress, abi, provider);
    }
  }

  async getBridgeCost(sourceChainId: number, destChainId: number, amount: bigint): Promise<bigint> {
    if (sourceChainId === destChainId) return 0n;
    return (amount * BigInt(this.bridgeFeeBps)) / 10000n;
  }

  async quoteCrossChain(
    sourceChainId: number,
    destChainId: number,
    inputToken: string,
    outputToken: string,
    inputAmount: bigint
  ): Promise<BridgeQuote> {
    const bridgeCost = await this.getBridgeCost(sourceChainId, destChainId, inputAmount);
    return {
      sourceChainId,
      destChainId,
      inputToken,
      outputToken,
      inputAmount,
      outputAmount: inputAmount - bridgeCost,
      bridgeCost,
      gasEstimate: 120000n,
    };
  }

  async executeBridge(
    quote: BridgeQuote,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse | undefined> {
    if (!this.bridge || quote.sourceChainId === quote.destChainId) return undefined;
    const bridgeWithSigner = this.bridge.connect(signer);
    const intentId = ethers.keccak256(ethers.randomBytes(32));
    return (bridgeWithSigner as any).bridgeOut(
      intentId,
      quote.inputToken,
      quote.inputAmount,
      quote.destChainId
    );
  }
}
