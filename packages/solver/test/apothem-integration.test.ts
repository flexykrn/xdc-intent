import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '..', '.env') });

describe('Apothem Testnet Integration', () => {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const solverWallet = new ethers.Wallet(
    process.env.SOLVER_PRIVATE_KEY || '0x871746e8ee247e63ee6b1bb1e770f1d18b194629e8efd6b3f04851a02005bb5e',
    provider
  );

  const CONTRACTS = {
    escrow: process.env.ESCROW_ADDRESS || '0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288',
    paymentVerifier: process.env.PAYMENT_VERIFIER_ADDRESS || '0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6',
    intentRegistry: process.env.INTENT_REGISTRY_ADDRESS || '0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4',
    solverRegistry: process.env.SOLVER_REGISTRY_ADDRESS || '0xC4db3B088781431ea29201BaF931FD4B731F3B91',
  };

  it('should connect to Apothem testnet', async () => {
    const blockNumber = await provider.getBlockNumber();
    console.log(`Connected to Apothem at block ${blockNumber}`);
    expect(blockNumber).toBeGreaterThan(0);
  });

  it('should verify solver wallet has balance', async () => {
    const balance = await provider.getBalance(solverWallet.address);
    console.log(`Solver ${solverWallet.address} balance: ${ethers.formatEther(balance)} XDC`);
    expect(balance).toBeGreaterThan(0n);
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
      'function totalIntents() external view returns (uint256)',
      'function totalIntentsFulfilled() external view returns (uint256)',
      'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))',
    ];

    const registry = new ethers.Contract(CONTRACTS.intentRegistry, registryAbi, provider);
    const totalIntents = await registry.getTotalIntents();
    const fulfilled = await registry.totalIntentsFulfilled();
    console.log(`Total intents: ${totalIntents}, fulfilled: ${fulfilled}`);
    expect(totalIntents).toBeDefined();
  });

  it('should verify solver is registered', async () => {
    const solverRegistryAbi = [
      'function isRegistered(address solver) external view returns (bool)',
      'function getSolverByAddress(address solver) external view returns (tuple(address solverAddress, string name, uint256 feeBps, bool active, uint256 registeredAt))',
    ];
    const registry = new ethers.Contract(CONTRACTS.solverRegistry, solverRegistryAbi, provider);
    const isRegistered = await registry.isRegistered(solverWallet.address);
    const info = await registry.getSolverByAddress(solverWallet.address);
    console.log(`Solver ${solverWallet.address} registered: ${isRegistered}, active: ${info.active}, feeBps: ${info.feeBps}`);
    expect(typeof isRegistered).toBe('boolean');
    expect(info.active).toBe(true);
  });

  it('should verify gas prices are reasonable', async () => {
    const feeData = await provider.getFeeData();
    const gasPriceGwei = Number(ethers.formatUnits(feeData.gasPrice || 0n, 'gwei'));
    console.log(`Gas price: ${gasPriceGwei} gwei`);
    expect(gasPriceGwei).toBeLessThan(100);
  });

  it('should measure block time', async () => {
    const block1 = await provider.getBlock('latest');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const block2 = await provider.getBlock('latest');

    if (block1 && block2) {
      const timeDiff = block2.timestamp - block1.timestamp;
      console.log(`Block time: ${timeDiff}s`);
      expect(timeDiff).toBeLessThanOrEqual(5);
    }
  });
});
