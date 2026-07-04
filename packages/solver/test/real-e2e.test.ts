import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '..', '.env') });

describe('Real Contract Interaction', () => {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const solver = new ethers.Wallet(
    process.env.SOLVER_PRIVATE_KEY || '0x871746e8ee247e63ee6b1bb1e770f1d18b194629e8efd6b3f04851a02005bb5e',
    provider
  );

  const CONTRACTS = {
    escrow: process.env.ESCROW_ADDRESS || '0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288',
    paymentVerifier: process.env.PAYMENT_VERIFIER_ADDRESS || '0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6',
    intentRegistry: process.env.INTENT_REGISTRY_ADDRESS || '0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4',
    solverRegistry: process.env.SOLVER_REGISTRY_ADDRESS || '0xC4db3B088781431ea29201BaF931FD4B731F3B91',
  };

  const registryAbi = [
    'function getTotalIntents() external view returns (uint256)',
    'function totalIntents() external view returns (uint256)',
    'function totalIntentsFulfilled() external view returns (uint256)',
    'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))',
    'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address sourceToken, uint256 sourceAmount, address destToken, uint256 minDestAmount, uint256 expiry)',
  ];

  it('should read intent registry totals', async () => {
    const registry = new ethers.Contract(CONTRACTS.intentRegistry, registryAbi, provider);
    const totalIntents = await registry.getTotalIntents();
    const fulfilled = await registry.totalIntentsFulfilled();
    console.log(`Total intents: ${totalIntents}, fulfilled: ${fulfilled}`);
    expect(totalIntents).toBeGreaterThanOrEqual(0n);
  }, 60000);

  it('should verify solver wallet has balance', async () => {
    const balance = await provider.getBalance(solver.address);
    console.log(`Solver ${solver.address} balance: ${ethers.formatEther(balance)} XDC`);
    expect(balance).toBeGreaterThan(0n);
  }, 30000);

  it('should verify contracts are deployed', async () => {
    for (const [name, address] of Object.entries(CONTRACTS)) {
      const code = await provider.getCode(address);
      console.log(`${name}: ${code.length > 2 ? 'DEPLOYED' : 'NOT FOUND'}`);
      expect(code.length).toBeGreaterThan(2);
    }
  }, 30000);
});
