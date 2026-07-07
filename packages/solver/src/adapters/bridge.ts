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
  executeBridge(quote: BridgeQuote, signer: ethers.Signer): Promise<ethers.TransactionResponse | undefined>;
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

function buildLzReceiveOptions(gas: number): string {
  const type3 = 3;
  const workerId = 1;
  const optionType = 1;
  const optionLength = 17;
  return ethers.solidityPacked(
    ['uint16', 'uint8', 'uint16', 'uint8', 'uint128'],
    [type3, workerId, optionLength, optionType, gas]
  );
}

export class LayerZeroBridgeAdapter implements BridgeAdapter {
  private bridge?: ethers.Contract;

  constructor(
    lzBridgeAddress: string | undefined,
    private provider: ethers.Provider,
    private eids: Record<string, number> = {},
    private receiveGas: number = 200_000
  ) {
    if (lzBridgeAddress) {
      const abi = [
        'function bridgeOut(bytes32 intentId, address sourceToken, uint256 amount, uint32 dstEid, uint256 destChainId, address recipient, address destToken, bytes calldata options) external payable',
        'function quoteBridgeFee(uint32 _dstEid, bytes calldata _message, bytes calldata _options) external view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))',
        'function processed(bytes32 intentId) external view returns (bool)',
      ];
      this.bridge = new ethers.Contract(lzBridgeAddress, abi, provider);
    }
  }

  private getDstEid(destChainId: number): number {
    const eid = this.eids[destChainId.toString()];
    if (!eid) throw new Error(`No LZ eid configured for destination chain ${destChainId}`);
    return eid;
  }

  private dummyMessage(inputAmount: bigint, destChainId: number): string {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256'],
      [ethers.ZeroHash, ethers.ZeroAddress, ethers.ZeroAddress, inputAmount, destChainId]
    );
  }

  async getBridgeCost(sourceChainId: number, destChainId: number, amount: bigint): Promise<bigint> {
    if (sourceChainId === destChainId || !this.bridge) return 0n;
    const dstEid = this.getDstEid(destChainId);
    const options = buildLzReceiveOptions(this.receiveGas);
    const message = this.dummyMessage(amount, destChainId);
    const fee = await (this.bridge as any).quoteBridgeFee(dstEid, message, options);
    return BigInt(fee.nativeFee.toString());
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
      gasEstimate: 300000n,
    };
  }

  async executeBridge(
    quote: BridgeQuote,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse | undefined> {
    if (!this.bridge || quote.sourceChainId === quote.destChainId) return undefined;
    const dstEid = this.getDstEid(quote.destChainId);
    const options = buildLzReceiveOptions(this.receiveGas);
    const message = this.dummyMessage(quote.inputAmount, quote.destChainId);
    const fee = await (this.bridge as any).quoteBridgeFee(dstEid, message, options);
    const nativeFee = BigInt(fee.nativeFee.toString());
    const intentId = ethers.keccak256(ethers.randomBytes(32));
    const recipient = await signer.getAddress();
    const destToken = quote.outputToken;
    const bridgeWithSigner = this.bridge.connect(signer);
    return (bridgeWithSigner as any).bridgeOut(
      intentId,
      quote.inputToken,
      quote.inputAmount,
      dstEid,
      quote.destChainId,
      recipient,
      destToken,
      options,
      { value: nativeFee }
    );
  }
}
