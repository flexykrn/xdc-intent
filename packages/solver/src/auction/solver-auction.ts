import { ethers } from 'ethers';

// Simple logger for auction module
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

export interface SolverBid {
  solverAddress: string;
  amount: bigint;
  fee: bigint;
  timestamp: number;
  reputation: number;
}

export interface AuctionResult {
  winner: string;
  amount: bigint;
  fee: bigint;
  score: number;
}

/**
 * Manages solver competition and auction mechanism
 */
export class SolverAuction {
  private registry: ethers.Contract;
  private provider: ethers.Provider;
  
  constructor(
    registryAddress: string,
    provider: ethers.Provider
  ) {
    this.provider = provider;
    
    const registryAbi = [
      'function submitBid(bytes32 intentId, uint256 amount, uint256 fee) external',
      'function selectWinner(bytes32 intentId) external returns (address)',
      'function getBids(bytes32 intentId) external view returns (tuple(address solver, uint256 amount, uint256 fee, uint256 timestamp, bool isWinner)[])',
      'function getWinner(bytes32 intentId) external view returns (address)',
      'function isSolver(address) external view returns (bool)',
      'function getSolverInfo(address) external view returns (tuple(address solverAddress, uint256 stake, uint256 totalFulfilled, uint256 totalFailed, uint256 totalProfit, uint256 reputationScore, bool isActive, uint256 registeredAt, uint256 lastActivity))',
      'function getActiveSolversCount() external view returns (uint256)',
      'function getSolverList() external view returns (address[])',
      'event BidSubmitted(bytes32 indexed intentId, address indexed solver, uint256 amount, uint256 fee)',
      'event WinnerSelected(bytes32 indexed intentId, address indexed solver, uint256 amount, uint256 fee)'
    ];
    
    this.registry = new ethers.Contract(registryAddress, registryAbi, provider);
  }
  
  /**
   * Submit a bid for an intent
   */
  async submitBid(
    intentId: string,
    amount: bigint,
    fee: bigint,
    solverWallet: ethers.Wallet
  ): Promise<ethers.ContractTransactionResponse> {
    const registryWithSigner = this.registry.connect(solverWallet);
    
    logger.info(`Submitting bid for intent ${intentId}: amount=${amount}, fee=${fee}`);
    
    return await registryWithSigner.submitBid(intentId, amount, fee);
  }
  
  /**
   * Select winner for an intent (called by intent creator or automated)
   */
  async selectWinner(
    intentId: string,
    callerWallet: ethers.Wallet
  ): Promise<AuctionResult> {
    const registryWithSigner = this.registry.connect(callerWallet);
    
    logger.info(`Selecting winner for intent ${intentId}`);
    
    const tx = await registryWithSigner.selectWinner(intentId);
    const receipt = await tx.wait();
    
    // Parse event to get winner
    const event = receipt?.logs.find(
      (log: any) => log.topics[0] === ethers.id('WinnerSelected(bytes32,address,uint256,uint256)')
    );
    
    if (event) {
      const decoded = this.registry.interface.parseLog(event);
      return {
        winner: decoded?.args.solver,
        amount: decoded?.args.amount,
        fee: decoded?.args.fee,
        score: 0
      };
    }
    
    // Fallback: query winner
    const winner = await this.registry.getWinner(intentId);
    const bids = await this.registry.getBids(intentId);
    const winningBid = bids.find((b: any) => b.isWinner);
    
    return {
      winner,
      amount: winningBid?.amount || 0n,
      fee: winningBid?.fee || 0n,
      score: 0
    };
  }
  
  /**
   * Get all bids for an intent
   */
  async getBids(intentId: string): Promise<SolverBid[]> {
    const bids = await this.registry.getBids(intentId);
    
    return bids.map((bid: any) => ({
      solverAddress: bid.solver,
      amount: bid.amount,
      fee: bid.fee,
      timestamp: Number(bid.timestamp),
      reputation: 0
    }));
  }
  
  /**
   * Get winner for an intent
   */
  async getWinner(intentId: string): Promise<string> {
    return await this.registry.getWinner(intentId);
  }
  
  /**
   * Check if address is registered solver
   */
  async isSolver(address: string): Promise<boolean> {
    return await this.registry.isSolver(address);
  }
  
  /**
   * Get solver info
   */
  async getSolverInfo(address: string): Promise<any> {
    return await this.registry.getSolverInfo(address);
  }
  
  /**
   * Get active solvers
   */
  async getActiveSolvers(): Promise<string[]> {
    return await this.registry.getSolverList();
  }
  
  /**
   * Calculate bid score for solver selection
   * Score = (amount * reputation) / (fee + 1)
   */
  calculateBidScore(bid: SolverBid, reputation: number): number {
    const amountNum = Number(ethers.formatEther(bid.amount));
    const feeNum = Number(ethers.formatEther(bid.fee));
    const reputationNum = reputation / 100; // 0-100
    
    return (amountNum * reputationNum) / (feeNum + 0.0001);
  }
  
  /**
   * Find best solver for an intent (off-chain calculation)
   */
  async findBestSolver(
    intentId: string,
    requiredAmount: bigint
  ): Promise<AuctionResult | null> {
    const bids = await this.getBids(intentId);
    
    if (bids.length === 0) {
      logger.warn(`No bids found for intent ${intentId}`);
      return null;
    }
    
    let bestScore = 0;
    let bestBid: SolverBid | null = null;
    
    for (const bid of bids) {
      // Get solver reputation
      const solverInfo = await this.getSolverInfo(bid.solverAddress);
      const reputation = Number(solverInfo.reputationScore);
      
      // Calculate score
      const score = this.calculateBidScore(bid, reputation);
      
      if (score > bestScore && bid.amount >= requiredAmount) {
        bestScore = score;
        bestBid = bid;
      }
    }
    
    if (!bestBid) {
      logger.warn(`No valid bid found for intent ${intentId}`);
      return null;
    }
    
    return {
      winner: bestBid.solverAddress,
      amount: bestBid.amount,
      fee: bestBid.fee,
      score: bestScore
    };
  }
}

export default SolverAuction;
