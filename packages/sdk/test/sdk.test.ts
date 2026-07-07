import { describe, it, expect, beforeEach } from 'vitest';
import { XDCIntentSDK, IntentStatus, CHAIN_IDS } from '../src/index';

const LOCAL_CHAIN_ID = 31337;

describe('XDCIntentSDK', () => {
  let sdk: XDCIntentSDK;
  let mockToken: any;
  let escrow: any;
  let paymentVerifier: any;
  let solverRegistry: any;
  let intentRegistry: any;
  let owner: any;
  let user: any;
  let solver: any;
  let ethers: any;

  beforeEach(async () => {
    const hre = await import('hardhat');
    ethers = hre.ethers;

    [owner, user, solver] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockTokenFactory.deploy('Mock Token', 'MOCK', ethers.parseEther('1000000'));
    await mockToken.waitForDeployment();

    const EscrowFactory = await ethers.getContractFactory('Escrow');
    escrow = await EscrowFactory.deploy();
    await escrow.waitForDeployment();

    const PaymentVerifierFactory = await ethers.getContractFactory('PaymentVerifier');
    paymentVerifier = await PaymentVerifierFactory.deploy(owner.address);
    await paymentVerifier.waitForDeployment();

    const SolverRegistryFactory = await ethers.getContractFactory('SolverRegistry');
    solverRegistry = await SolverRegistryFactory.deploy();
    await solverRegistry.waitForDeployment();

    const IntentRegistryFactory = await ethers.getContractFactory('IntentRegistry');
    intentRegistry = await IntentRegistryFactory.deploy(
      await escrow.getAddress(),
      await paymentVerifier.getAddress(),
      await solverRegistry.getAddress()
    );
    await intentRegistry.waitForDeployment();

    await escrow.setRegistry(await intentRegistry.getAddress());
    await escrow.addAllowedToken(await mockToken.getAddress());

    await mockToken.mint(user.address, ethers.parseEther('10000'));
    await mockToken.connect(user).approve(await escrow.getAddress(), ethers.parseEther('10000'));

    const provider = ethers.provider;
    sdk = new XDCIntentSDK({
      provider,
      signer: user,
      chainId: LOCAL_CHAIN_ID,
      contractAddresses: {
        escrow: await escrow.getAddress(),
        paymentVerifier: await paymentVerifier.getAddress(),
        intentRegistry: await intentRegistry.getAddress(),
        solverRegistry: await solverRegistry.getAddress(),
      },
      pollingInterval: 200,
    });
  });

  async function buildIntentParams(overrides: Record<string, any> = {}) {
    return {
      sourceChainId: LOCAL_CHAIN_ID,
      sourceToken: await mockToken.getAddress(),
      sourceAmount: ethers.parseEther('100'),
      destChainId: LOCAL_CHAIN_ID,
      destToken: await mockToken.getAddress(),
      minDestAmount: ethers.parseEther('100'),
      maxSolverFee: ethers.parseEther('1'),
      expiry: Math.floor(Date.now() / 1000) + 3600,
      nonce: 1,
      allowedSolvers: [],
      ...overrides,
    };
  }

  describe('Chain ID Detection', () => {
    it('should pass with correct chain ID', async () => {
      await expect(sdk.checkChainId()).resolves.not.toThrow();
    });

    it('should throw with wrong chain ID', async () => {
      const wrongSdk = new XDCIntentSDK({
        provider: ethers.provider,
        signer: user,
        chainId: 999,
        contractAddresses: {
          escrow: await escrow.getAddress(),
          paymentVerifier: await paymentVerifier.getAddress(),
          intentRegistry: await intentRegistry.getAddress(),
          solverRegistry: await solverRegistry.getAddress(),
        },
      });

      await expect(wrongSdk.checkChainId()).rejects.toThrow('Wrong network');
    });
  });

  describe('Address Normalization', () => {
    it('should normalize xdc prefix to 0x', () => {
      const normalized = XDCIntentSDK.normalizeAddress('xdc1234567890123456789012345678901234567890');
      expect(normalized).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should keep 0x prefix unchanged', () => {
      const normalized = XDCIntentSDK.normalizeAddress('0x1234567890123456789012345678901234567890');
      expect(normalized).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('Intent ID Derivation', () => {
    it('should derive a deterministic intent id', async () => {
      const userAddress = await user.getAddress();
      const params = await buildIntentParams();
      const intentId = XDCIntentSDK.deriveIntentId(userAddress, params);
      expect(intentId).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('Intent Signing and Submission', () => {
    it('should sign and submit an intent successfully', async () => {
      const userAddress = await user.getAddress();
      const params = await buildIntentParams();
      const signed = await sdk.signIntent(userAddress, params);

      expect(signed.intentId).toBe(XDCIntentSDK.deriveIntentId(userAddress, params));
      expect(signed.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

      const tx = await sdk.submitIntent(signed);
      expect(tx.hash).toBeDefined();

      const receipt = await tx.wait();
      expect(receipt?.status).toBe(1);

      const stored = await sdk.getIntent(signed.intentId);
      expect(stored.status).toBe(IntentStatus.Open);
      expect(stored.user.toLowerCase()).toBe(userAddress.toLowerCase());
    });

    it('should retrieve the user nonce', async () => {
      const userAddress = await user.getAddress();
      const nonceBefore = await sdk.getUserNonce(userAddress);
      expect(nonceBefore).toBe(0n);

      const signed = await sdk.signIntent(userAddress, await buildIntentParams());
      await (await sdk.submitIntent(signed)).wait();

      const nonceAfter = await sdk.getUserNonce(userAddress);
      expect(nonceAfter).toBe(1n);
    });
  });

  describe('Intent Cancellation', () => {
    it('should cancel a pending intent', async () => {
      const userAddress = await user.getAddress();
      const signed = await sdk.signIntent(userAddress, await buildIntentParams());
      await (await sdk.submitIntent(signed)).wait();

      const tx = await sdk.cancelIntent(signed.intentId);
      expect(tx.hash).toBeDefined();

      const receipt = await tx.wait();
      expect(receipt?.status).toBe(1);

      const stored = await sdk.getIntent(signed.intentId);
      expect(stored.status).toBe(IntentStatus.Cancelled);
    });

    it('should reject cancellation by non-owner', async () => {
      const userAddress = await user.getAddress();
      const signed = await sdk.signIntent(userAddress, await buildIntentParams());
      await (await sdk.submitIntent(signed)).wait();

      const solverSdk = new XDCIntentSDK({
        provider: ethers.provider,
        signer: solver,
        chainId: LOCAL_CHAIN_ID,
        contractAddresses: {
          escrow: await escrow.getAddress(),
          paymentVerifier: await paymentVerifier.getAddress(),
          intentRegistry: await intentRegistry.getAddress(),
          solverRegistry: await solverRegistry.getAddress(),
        },
      });

      await expect(solverSdk.cancelIntent(signed.intentId)).rejects.toThrow();
    });
  });

  describe('Event Watching', () => {
    it('should watch for submitted intents', async () => {
      const events: any[] = [];
      const watcher = sdk.watchIntents((intent) => {
        events.push(intent);
      });

      expect(watcher.isActive()).toBe(true);

      const userAddress = await user.getAddress();
      const signed = await sdk.signIntent(userAddress, await buildIntentParams());
      await (await sdk.submitIntent(signed)).wait();

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].intentId).toBe(signed.intentId);

      watcher.unsubscribe();
      expect(watcher.isActive()).toBe(false);
    });

    it('should watch for fulfillments', async () => {
      const events: any[] = [];
      const watcher = sdk.watchFulfillments((intentId, solverAddr, destAmount, paymentTxHash) => {
        events.push({ intentId, solver: solverAddr, destAmount, paymentTxHash });
      });

      expect(watcher.isActive()).toBe(true);
      watcher.unsubscribe();
      expect(watcher.isActive()).toBe(false);
    });
  });

  describe('Ether Helpers', () => {
    it('should parse and format ether amounts', () => {
      expect(XDCIntentSDK.parseEther('1')).toBe(ethers.parseEther('1'));
      expect(XDCIntentSDK.formatEther(ethers.parseEther('1'))).toBe('1.0');
    });
  });

  describe('Transaction Retry', () => {
    it('should retry on transient errors', async () => {
      let attempts = 0;
      const txFn = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('NETWORK_ERROR');
        }
        return { hash: '0x123' } as any;
      };

      const result = await (sdk as any).submitWithRetry(txFn, { maxRetries: 3, delayMs: 100 });
      expect(result.hash).toBe('0x123');
      expect(attempts).toBe(2);
    });

    it('should not retry on permanent errors', async () => {
      let attempts = 0;
      const txFn = async () => {
        attempts++;
        throw new Error('INSUFFICIENT_FUNDS');
      };

      await expect((sdk as any).submitWithRetry(txFn, { maxRetries: 3, delayMs: 100 })).rejects.toThrow();
      expect(attempts).toBe(1);
    });
  });
});
