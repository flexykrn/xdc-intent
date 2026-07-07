import { describe, it, expect, afterEach } from 'vitest';
import { ethers } from 'ethers';
import * as store from '../src/store';

describe('Quote store helpers', () => {
  afterEach(() => {
    store.clearQuotes('0xquote-test');
  });

  it('deduplicates quotes per (intentId, solverAddress)', () => {
    store.addQuote({
      intentId: '0xquote-test',
      solverAddress: '0x0000000000000000000000000000000000000001',
      outputAmount: '100',
      feeBps: 10,
      signature: '0x1',
      createdAt: 1,
    });
    store.addQuote({
      intentId: '0xquote-test',
      solverAddress: '0x0000000000000000000000000000000000000001',
      outputAmount: '200',
      feeBps: 20,
      signature: '0x2',
      createdAt: 2,
    });
    const quotes = store.getQuotes('0xquote-test');
    expect(quotes).toHaveLength(1);
    expect(quotes[0].outputAmount).toBe('200');
  });

  it('returns the best quote by outputAmount', () => {
    store.addQuote({
      intentId: '0xquote-test',
      solverAddress: '0x0000000000000000000000000000000000000001',
      outputAmount: '100',
      feeBps: 10,
      signature: '0x1',
      createdAt: 1,
    });
    store.addQuote({
      intentId: '0xquote-test',
      solverAddress: '0x0000000000000000000000000000000000000002',
      outputAmount: '300',
      feeBps: 10,
      signature: '0x2',
      createdAt: 2,
    });
    const best = store.getBestQuote('0xquote-test');
    expect(best?.outputAmount).toBe('300');
  });

  it('verifies a valid quote signature', async () => {
    const wallet = ethers.Wallet.createRandom();
    const quote = {
      intentId: '0xquote-test',
      solverAddress: wallet.address,
      outputAmount: '150',
      feeBps: 10,
      signature: '',
      createdAt: Date.now(),
    };
    const message = JSON.stringify({
      intentId: quote.intentId,
      outputAmount: quote.outputAmount,
      solver: ethers.getAddress(wallet.address),
    });
    quote.signature = await wallet.signMessage(message);
    expect(store.verifyQuoteSignature(quote)).toBe(true);
  });

  it('rejects a tampered quote signature', () => {
    const quote = {
      intentId: '0xquote-test',
      solverAddress: '0x0000000000000000000000000000000000000001',
      outputAmount: '150',
      feeBps: 10,
      signature: '0x' + '00'.repeat(65),
      createdAt: Date.now(),
    };
    expect(store.verifyQuoteSignature(quote)).toBe(false);
  });

  it('isAllowedSolver returns true when list is empty', () => {
    expect(store.isAllowedSolver('0x0000000000000000000000000000000000000001', [])).toBe(true);
  });

  it('isAllowedSolver matches checksum addresses', () => {
    expect(
      store.isAllowedSolver('0x0000000000000000000000000000000000000001', [
        '0x0000000000000000000000000000000000000001',
      ])
    ).toBe(true);
  });
});
