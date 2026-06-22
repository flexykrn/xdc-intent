import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '..', '.env') });

const CONTRACTS = {
  mevProtection: '0xC1C3eE61Cdde366Bc48D81e367D9D62D91Fb6b42',
  intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
  solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
};

describe('MEV Protection', () => {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const deployer = new ethers.Wallet(
    '0x851f2396c6ff431410782c211db3a996a332f0decad132f21d5f60bb077f35e9',
    provider
  );

  it('should verify MEVProtection is deployed', async () => {
    const code = await provider.getCode(CONTRACTS.mevProtection);
    expect(code.length).toBeGreaterThan(2);
    console.log('MEVProtection deployed at:', CONTRACTS.mevProtection);
    console.log('Contract code length:', code.length);
  }, 30000);

  it('should verify contract constants', async () => {
    const mev = new ethers.Contract(
      CONTRACTS.mevProtection,
      [
        'function COMMIT_DELAY() view returns (uint256)',
        'function REVEAL_WINDOW() view returns (uint256)',
        'function BATCH_DURATION() view returns (uint256)',
        'function MIN_BID() view returns (uint256)',
        'function intentRegistry() view returns (address)',
        'function solverRegistry() view returns (address)',
      ],
      provider
    );

    const commitDelay = await mev.COMMIT_DELAY();
    const revealWindow = await mev.REVEAL_WINDOW();
    const batchDuration = await mev.BATCH_DURATION();
    const minBid = await mev.MIN_BID();
    const intentRegistry = await mev.intentRegistry();
    const solverRegistry = await mev.solverRegistry();

    console.log('Commit delay:', commitDelay.toString(), 'blocks');
    console.log('Reveal window:', revealWindow.toString(), 'blocks');
    console.log('Batch duration:', batchDuration.toString(), 'blocks');
    console.log('Min bid:', ethers.formatEther(minBid), 'TXDC');
    console.log('IntentRegistry:', intentRegistry);
    console.log('SolverRegistry:', solverRegistry);

    expect(commitDelay).toBe(2n);
    expect(revealWindow).toBe(10n);
    expect(batchDuration).toBe(5n);
    expect(intentRegistry).toBe(CONTRACTS.intentRegistry);
    expect(solverRegistry).toBe(CONTRACTS.solverRegistry);
  }, 30000);

  it('should commit an intent hash', async () => {
    const mev = new ethers.Contract(
      CONTRACTS.mevProtection,
      [
        'function commitIntent(bytes32 _intentHash) external',
        'function getCommitment(bytes32 _commitmentHash) external view returns (tuple(bytes32 intentHash, uint256 commitBlock, uint256 revealBlock, bool revealed, bool executed, address committer))',
        'event IntentCommitted(bytes32 indexed commitmentHash, bytes32 intentHash, uint256 blockNumber)',
      ],
      deployer
    );

    // Create a test intent hash
    const intentData = ethers.toUtf8Bytes('test-intent-1');
    const intentHash = ethers.keccak256(intentData);
    
    // Commit the intent
    const tx = await mev.commitIntent(intentHash);
    const receipt = await tx.wait();
    
    console.log('Commit transaction:', receipt.hash);
    console.log('Block number:', receipt.blockNumber);

    // Get commitment hash
    const commitmentHash = ethers.keccak256(
      ethers.solidityPacked(['bytes32', 'address', 'uint256'], [intentHash, deployer.address, receipt.blockNumber])
    );

    // Verify commitment
    const commitment = await mev.getCommitment(commitmentHash);
    console.log('Commitment:', {
      intentHash: commitment.intentHash,
      commitBlock: commitment.commitBlock.toString(),
      revealed: commitment.revealed,
      executed: commitment.executed,
      committer: commitment.committer,
    });

    expect(commitment.intentHash).toBe(intentHash);
    expect(commitment.committer).toBe(deployer.address);
    expect(commitment.revealed).toBe(false);
    expect(commitment.executed).toBe(false);
  }, 30000);

  it('should create a batch', async () => {
    const mev = new ethers.Contract(
      CONTRACTS.mevProtection,
      [
        'function createBatch(bytes32[] calldata _intentIds) external returns (uint256)',
        'function getBatch(uint256 _batchId) external view returns (bytes32[] memory intentIds, uint256 startBlock, uint256 endBlock, uint256 minBid, address winningSolver, bool settled)',
        'event BatchCreated(uint256 indexed batchId, uint256 startBlock, uint256 endBlock)',
      ],
      deployer
    );

    // Create test intent IDs
    const intentIds = [
      ethers.keccak256(ethers.toUtf8Bytes('batch-intent-1')),
      ethers.keccak256(ethers.toUtf8Bytes('batch-intent-2')),
      ethers.keccak256(ethers.toUtf8Bytes('batch-intent-3')),
    ];

    // Create batch
    const tx = await mev.createBatch(intentIds, { nonce: await provider.getTransactionCount(deployer.address) });
    const receipt = await tx.wait();
    
    // Parse event to get batch ID
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = mev.interface.parseLog(log);
        return parsed?.name === 'BatchCreated';
      } catch {
        return false;
      }
    });
    
    const batchId = event ? event.args[0] : 0;
    console.log('Batch created:', batchId.toString());
    console.log('Transaction:', receipt.hash);

    // Get batch details
    const batch = await mev.getBatch(batchId);
    console.log('Batch details:', {
      intentCount: batch.intentIds.length,
      startBlock: batch.startBlock.toString(),
      endBlock: batch.endBlock.toString(),
      minBid: ethers.formatEther(batch.minBid),
      settled: batch.settled,
    });

    expect(batch.intentIds.length).toBe(3);
    expect(batch.settled).toBe(false);
  }, 30000);
});
