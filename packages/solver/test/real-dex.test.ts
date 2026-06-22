import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import { SimpleDEXAdapter } from '../src/adapters/dex';

const DEX = {
  router: '0x118c80107B5819D0c6f8e7c8CB19D397dB323E93',
  factory: '0xa18a69a9a7Bbe60A842175F6c88c79f1679d4706',
  tokenA: '0x85D09e7A4332B4bF969661461C8C251D13d63043',
  tokenB: '0xc36296e2b0ff183FA90FFD95DeC9b919a81527a3',
};

describe('Real DEX Integration', () => {
  const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
  const deployer = new ethers.Wallet(
    '0x851f2396c6ff431410782c211db3a996a332f0decad132f21d5f60bb077f35e9',
    provider
  );
  
  let dexAdapter: SimpleDEXAdapter;

  beforeAll(() => {
    dexAdapter = new SimpleDEXAdapter(DEX.router, DEX.factory, provider);
  });

  it('should get real swap quote', async () => {
    const amount = ethers.parseEther('100');
    const quote = await dexAdapter.getQuote(DEX.tokenA, DEX.tokenB, amount);
    
    console.log('Quote:', {
      input: ethers.formatEther(quote.inputAmount),
      output: ethers.formatEther(quote.outputAmount),
      rate: quote.exchangeRate,
    });
    
    expect(quote.outputAmount).toBeGreaterThan(0);
    expect(quote.exchangeRate).toBeGreaterThan(0);
  }, 30000);

  it('should execute real swap', async () => {
    const amount = ethers.parseEther('10');
    const quote = await dexAdapter.getQuote(DEX.tokenA, DEX.tokenB, amount);
    
    // Approve tokens for router (need to approve max or exact amount)
    const erc20Abi = ['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)'];
    const tokenA = new ethers.Contract(DEX.tokenA, erc20Abi, deployer);
    
    // Check current allowance
    const allowance = await tokenA.allowance(deployer.address, DEX.router);
    console.log('Current allowance:', ethers.formatEther(allowance));
    
    if (allowance < amount) {
      console.log('Approving router...');
      await (await tokenA.approve(DEX.router, ethers.MaxUint256)).wait();
    }
    
    // Execute swap
    const tx = await dexAdapter.executeSwap(quote, deployer);
    console.log('Swap tx:', tx.hash);
    
    const receipt = await tx.wait();
    expect(receipt?.status).toBe(1);
  }, 60000);
});
