import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'hardhat';
import { XDCIntentSDK, IntentStatus, CHAIN_IDS } from '../src/index';
import { MockERC20, Escrow, PaymentVerifier, IntentRegistry } from '../../contracts/typechain-types';

describe('XDCIntentSDK', () => {
  let sdk: XDCIntentSDK;
  let mockToken: MockERC20;
  let escrow: Escrow;
  let paymentVerifier: PaymentVerifier;
  let intentRegistry: IntentRegistry;
  let owner: any;
  let user: any;
  let solver: any;

  beforeEach(async () => {
    [owner, user, solver] = await ethers.getSigners();

    // Deploy MockERC20
    const MockTokenFactory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockTokenFactory.deploy('Mock Token', 'MOCK', ethers.parseEther('1000000'));
    await mockToken.waitForDeployment();

    // Deploy Escrow
    const EscrowFactory = await ethers.getContractFactory('Escrow');
    escrow = await EscrowFactory.deploy(owner.address, 100, owner.address);
    await escrow.waitForDeployment();

    // Deploy PaymentVerifier
    const PaymentVerifierFactory = await ethers.getContractFactory('PaymentVerifier');
    paymentVerifier = await PaymentVerifierFactory.deploy();
    await paymentVerifier.waitForDeployment();

    // Deploy IntentRegistry
    const IntentRegistryFactory = await ethers.getContractFactory('IntentRegistry');
    intentRegistry = await IntentRegistryFactory.deploy(
      await escrow.getAddress(),
      await paymentVerifier.getAddress()
    );
    await intentRegistry.waitForDeployment();

    // Set registry in escrow
    await escrow.setRegistry(await intentRegistry.getAddress());

    // Add authorized signer
    await paymentVerifier.addSigner(owner.address);

    // Add supported token
    await escrow.addSupportedToken(await mockToken.getAddress());

    // Mint tokens to user
    await mockToken.mint(user.address, ethers.parseEther('10000'));
    await mockToken.connect(user).approve(await intentRegistry.getAddress(), ethers.parseEther('10000'));

    // Create SDK instance
    const provider = ethers.provider;
    sdk = new XDCIntentSDK({
      provider,
      signer: user,
      chainId: 31337,
      contractAddresses: {
        escrow: await escrow.getAddress(),
        paymentVerifier: await paymentVerifier.getAddress(),
        intentRegistry: await intentRegistry.getAddress(),
      },
    });
  });

  describe('Intent Creation', () => {
    it('should create an intent successfully', async () => {
      const intentId = XDCIntentSDK.generateIntentId();
      const amount = ethers.parseEther('100');
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      const tx = await sdk.createIntent({
        intentId,
        token: await mockToken.getAddress(),
        amount,
        expiry,
      });

      expect(tx.hash).toBeDefined();

      const receipt = await tx.wait();
      expect(receipt?.status).toBe(1);
    });

    it('should compute deterministic intentId', async () => {
      const userAddress = await user.getAddress();
      const tokenAddress = await mockToken.getAddress();
      const amount = ethers.parseEther('100');
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const nonce = 1;

      const intentId = XDCIntentSDK.computeIntentId(userAddress, tokenAddress, amount, expiry, nonce);
      expect(intentId).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

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

  describe('Intent Cancellation', () => {
    it('should cancel a pending intent', async () => {
      const intentId = XDCIntentSDK.generateIntentId();
      const amount = ethers.parseEther('100');
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      await sdk.createIntent({
        intentId,
        token: await mockToken.getAddress(),
        amount,
        expiry,
      });

      const tx = await sdk.cancelIntent(intentId);
      expect(tx.hash).toBeDefined();

      const receipt = await tx.wait();
      expect(receipt?.status).toBe(1);

      const intent = await sdk.getIntent(intentId);
      expect(intent.status).toBe(IntentStatus.Cancelled);
    });

    it('should reject cancellation by non-owner', async () => {
      const intentId = XDCIntentSDK.generateIntentId();
      const amount = ethers.parseEther('100');
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      await sdk.createIntent({
        intentId,
        token: await mockToken.getAddress(),
        amount,
        expiry,
      });

      const solverSdk = new XDCIntentSDK({
        provider: ethers.provider,
        signer: solver,
        chainId: 31337,
        contractAddresses: {
          escrow: await escrow.getAddress(),
          paymentVerifier: await paymentVerifier.getAddress(),
          intentRegistry: await intentRegistry.getAddress(),
        },
      });

      await expect(solverSdk.cancelIntent(intentId)).rejects.toThrow('Only the intent owner');
    });
  });

  describe('Fee Estimation', () => {
    it('should estimate intent cost', async () => {
      const amount = ethers.parseEther('100');
      const estimate = await sdk.estimateIntentCost(
        await mockToken.getAddress(),
        amount
      );

      expect(estimate.gasLimit).toBeGreaterThan(0n);
      expect(estimate.gasPrice).toBeGreaterThan(0n);
      expect(estimate.protocolFee).toBeGreaterThan(0n);
      expect(estimate.totalCost).toBeGreaterThan(0n);
      expect(estimate.totalCostUsd).toBeGreaterThan(0);
    });
  });

  describe('Event Watching', () => {
    it('should watch for intent creation events', async () => {
      const events: any[] = [];
      
      const watcher = sdk.watchIntents((intentId, user, token, amount, expiry) => {
        events.push({ intentId, user, token, amount, expiry });
      });

      expect(watcher.isActive()).toBe(true);

      const intentId = XDCIntentSDK.generateIntentId();
      await sdk.createIntent({
        intentId,
        token: await mockToken.getAddress(),
        amount: ethers.parseEther('100'),
        expiry: Math.floor(Date.now() / 1000) + 3600,
      });

      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].intentId).toBe(intentId);

      watcher.unsubscribe();
      expect(watcher.isActive()).toBe(false);
    });

    it('should cleanup listeners', () => {
      const watcher = sdk.watchIntents(() => {});
      watcher.unsubscribe();
      
      // Should not throw
      sdk.cleanupAllListeners();
    });
  });

  describe('Batch Intent Creation', () => {
    it('should create batch of signed intents', async () => {
      const inputs = [
        {
          token: await mockToken.getAddress(),
          amount: ethers.parseEther('100'),
          expiry: Math.floor(Date.now() / 1000) + 3600,
        },
        {
          token: await mockToken.getAddress(),
          amount: ethers.parseEther('200'),
          expiry: Math.floor(Date.now() / 1000) + 3600,
        },
      ];

      const signedIntents = await sdk.createIntentBatch(inputs);
      
      expect(signedIntents.length).toBe(2);
      expect(signedIntents[0].intentId).toBeDefined();
      expect(signedIntents[1].intentId).toBeDefined();
      expect(signedIntents[0].intentId).not.toBe(signedIntents[1].intentId);
      expect(signedIntents[0].signature).toBeDefined();
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

      await expect(
        (sdk as any).submitWithRetry(txFn, { maxRetries: 3, delayMs: 100 })
      ).rejects.toThrow();
      
      expect(attempts).toBe(1);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from transient errors', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('NETWORK_ERROR');
        }
        return 'success';
      };

      const result = await (sdk as any).recover(operation, { maxRetries: 3, delayMs: 100 });
      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should not recover from permanent errors', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error('INSUFFICIENT_FUNDS');
      };

      await expect(
        (sdk as any).recover(operation, { maxRetries: 3, delayMs: 100 })
      ).rejects.toThrow('INSUFFICIENT_FUNDS');
      
      expect(attempts).toBe(1);
    });
  });

  describe('User Messages', () => {
    it('should return user-friendly error messages', () => {
      const message = (sdk as any).getUserMessage(new Error('IntentRegistry: not pending'));
      expect(message).toBe('Intent is not pending. It may have been fulfilled, cancelled, or expired.');
    });
  });

  describe('WebSocket Detection', () => {
    it('should detect WebSocket is not connected', () => {
      expect(sdk.isWebSocketConnected()).toBe(false);
    });
  });
});