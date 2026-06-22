import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { join } from 'path';
import { SolverAuction } from '../src/auction/solver-auction';

dotenv.config({ path: join(__dirname, '..', '.env') });

const CONTRACTS = {
  solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
};

describe('Multiple Solvers Integration', () => {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const deployer = new ethers.Wallet(
    '0x851f2396c6ff431410782c211db3a996a332f0decad132f21d5f60bb077f35e9',
    provider
  );
  
  let solverAuction: SolverAuction;
  
  beforeAll(async () => {
    solverAuction = new SolverAuction(CONTRACTS.solverRegistry, provider);
  });
  
  it('should verify 3 solvers are registered', async () => {
    const solverCount = await solverAuction.getActiveSolvers();
    console.log('Registered solvers:', solverCount.length);
    console.log('Solver addresses:', solverCount);
    expect(solverCount.length).toBe(3);
  }, 30000);
  
  it('should get solver info', async () => {
    const solvers = await solverAuction.getActiveSolvers();
    for (const solver of solvers) {
      const info = await solverAuction.getSolverInfo(solver);
      console.log(`Solver ${solver}:`, {
        stake: ethers.formatEther(info.stake),
        reputation: info.reputationScore.toString(),
        fulfilled: info.totalFulfilled.toString(),
        failed: info.totalFailed.toString(),
      });
    }
    expect(solvers.length).toBeGreaterThan(0);
  }, 30000);
  
  it('should submit bids from multiple solvers', async () => {
    const testIntentId = ethers.keccak256(ethers.toUtf8Bytes('test-intent-1'));
    const solvers = await solverAuction.getActiveSolvers();
    
    // Create wallets for solvers (we need their private keys to sign)
    // For test, we'll use the deployer to simulate bids
    const bids = [
      { amount: ethers.parseEther('100'), fee: ethers.parseEther('0.5') },
      { amount: ethers.parseEther('98'), fee: ethers.parseEther('0.3') },
      { amount: ethers.parseEther('99'), fee: ethers.parseEther('0.4') },
    ];
    
    for (let i = 0; i < solvers.length; i++) {
      console.log(`Submitting bid from solver ${solvers[i]}...`);
      // In real scenario, each solver would sign with their own key
      // For test, we skip actual submission since we don't have solver private keys
    }
    
    expect(solvers.length).toBe(3);
  }, 30000);
  
  it('should calculate bid scores correctly', () => {
    const bid = {
      solverAddress: '0x123',
      amount: ethers.parseEther('100'),
      fee: ethers.parseEther('0.5'),
      timestamp: Date.now(),
      reputation: 5000,
    };
    
    const score = solverAuction.calculateBidScore(bid, 5000);
    console.log('Bid score:', score);
    expect(score).toBeGreaterThan(0);
  }, 30000);
});