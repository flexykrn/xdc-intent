import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { join } from 'path';

// Load environment
dotenv.config({ path: join(__dirname, '..', '.env') });

describe('Apothem Testnet Integration', () => {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const solverWallet = new ethers.Wallet(
    process.env.SOLVER_PRIVATE_KEY || '0x871746e8ee247e63ee6b1bb1e770f1d18b194629e8efd6b3f04851a02005bb5e',
    provider
  );

  const CONTRACTS = {
    escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
    paymentVerifier: '0x14699d436E3c5d870A7C6aC3825C500C8f86d270',
    intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
  };

  it('should connect to Apothem testnet', async () => {
    const blockNumber = await provider.getBlockNumber();
    console.log(`Connected to Apothem at block ${blockNumber}`);
    expect(blockNumber).toBeGreaterThan(0);
  });

  it('should verify solver wallet has balance', async () => {
    const balance = await provider.getBalance(solverWallet.address);
    console.log(`Solver balance: ${ethers.formatEther(balance)} XDC`);
    expect(balance).toBeGreaterThan(0);
  });

  it('should verify contracts are deployed', async () => {
    for (const [name, address] of Object.entries(CONTRACTS)) {
      const code = await provider.getCode(address);
      console.log(`${name}: ${code.length > 2 ? 'DEPLOYED' : 'NOT FOUND'}`);
      expect(code.length).toBeGreaterThan(2);
    }
  });

  it('should read intent registry state', async () => {
    const registryAbi = [
      'function getTotalIntents() external view returns (uint256)',
      'function getIntent(bytes32 intentId) external view returns (bytes32, address, address, uint256, uint256, uint8, address, uint256, uint256, uint256, uint256)',
    ];
    
    const registry = new ethers.Contract(CONTRACTS.intentRegistry, registryAbi, provider);
    const totalIntents = await registry.getTotalIntents();
    console.log(`Total intents: ${totalIntents}`);
    expect(totalIntents).toBeDefined();
  });

  it('should verify gas prices are reasonable', async () => {
    const feeData = await provider.getFeeData();
    const gasPriceGwei = Number(ethers.formatUnits(feeData.gasPrice || 0, 'gwei'));
    console.log(`Gas price: ${gasPriceGwei} gwei`);
    expect(gasPriceGwei).toBeLessThan(100); // Should be cheap on XDC
  });

  it('should measure block time', async () => {
    const block1 = await provider.getBlock('latest');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const block2 = await provider.getBlock('latest');
    
    if (block1 && block2) {
      const timeDiff = block2.timestamp - block1.timestamp;
      console.log(`Block time: ${timeDiff}s`);
      expect(timeDiff).toBeLessThanOrEqual(5); // XDC is ~2s
    }
  });
});
