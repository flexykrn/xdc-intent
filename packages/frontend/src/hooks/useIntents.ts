import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { getProvider, getIntentRegistry, getMEVProtection, getSolverRegistry } from '../utils/contracts';

export interface Intent {
  id: string;
  creator: string;
  token: string;
  amount: string;
  status: 'pending' | 'fulfilled' | 'cancelled' | 'expired';
  createdAt: Date;
  expiry: Date;
  solver?: string;
  fulfilledAt?: Date;
}

export function useIntents() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = getProvider();
      const registry = getIntentRegistry(provider);

      // Get total intents count
      const totalIntents = await registry.getTotalIntents();
      console.log('Total intents:', totalIntents.toString());

      // For demo, fetch recent intents (in production, use events or indexing)
      // This is a simplified approach - in production you'd use an indexer
      const recentIntents: Intent[] = [];

      setIntents(recentIntents);
    } catch (err: any) {
      console.error('Error fetching intents:', err);
      setError(err.message || 'Failed to fetch intents');
    } finally {
      setLoading(false);
    }
  }, []);

  const createIntent = async (
    signer: ethers.JsonRpcSigner,
    token: string,
    amount: string,
    expiryHours: number = 1
  ) => {
    try {
      const registry = getIntentRegistry(signer);
      
      // Generate unique intent ID
      const intentId = ethers.keccak256(
        ethers.solidityPacked(
          ['address', 'string', 'uint256'],
          [await signer.getAddress(), token, Date.now()]
        )
      );

      const amountWei = ethers.parseUnits(amount, 18);
      const expiryTimestamp = Math.floor(Date.now() / 1000) + expiryHours * 3600;

      // Create intent transaction
      const tx = await registry.createIntent(intentId, token, amountWei, expiryTimestamp);
      const receipt = await tx.wait();

      console.log('Intent created:', receipt.hash);
      return { intentId, txHash: receipt.hash };
    } catch (err: any) {
      console.error('Error creating intent:', err);
      throw new Error(err.message || 'Failed to create intent');
    }
  };

  const getUserIntents = async (address: string) => {
    try {
      const provider = getProvider();
      const registry = getIntentRegistry(provider);

      const intentIds = await registry.getUserIntents(address);
      
      const userIntents: Intent[] = [];
      for (const intentId of intentIds) {
        try {
          const intent = await registry.getIntent(intentId);
          userIntents.push({
            id: intentId,
            creator: intent.user,
            token: intent.token,
            amount: ethers.formatUnits(intent.amount, 18),
            status: ['pending', 'fulfilled', 'cancelled', 'expired'][intent.status] as Intent['status'],
            createdAt: new Date(Number(intent.createdAt) * 1000),
            expiry: new Date(Number(intent.expiryTimestamp) * 1000),
            solver: intent.solver,
            fulfilledAt: intent.fulfilledAt > 0 ? new Date(Number(intent.fulfilledAt) * 1000) : undefined,
          });
        } catch (err) {
          console.error(`Error fetching intent ${intentId}:`, err);
        }
      }

      return userIntents;
    } catch (err: any) {
      console.error('Error fetching user intents:', err);
      throw new Error(err.message || 'Failed to fetch user intents');
    }
  };

  useEffect(() => {
    fetchIntents();
    const interval = setInterval(fetchIntents, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchIntents]);

  return {
    intents,
    loading,
    error,
    fetchIntents,
    createIntent,
    getUserIntents,
  };
}

export function useStats() {
  const [stats, setStats] = useState({
    totalIntents: 0,
    totalFulfilled: 0,
    activeSolvers: 0,
    avgSavings: '0.4',
  });
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const provider = getProvider();
      const registry = getIntentRegistry(provider);
      const solverRegistry = getSolverRegistry(provider);

      const [totalIntents, totalFulfilled, activeSolvers] = await Promise.all([
        registry.getTotalIntents().catch(() => 0n),
        registry.getTotalIntentsFulfilled().catch(() => 0n),
        solverRegistry.getActiveSolversCount().catch(() => 0n),
      ]);

      setStats({
        totalIntents: Number(totalIntents),
        totalFulfilled: Number(totalFulfilled),
        activeSolvers: Number(activeSolvers),
        avgSavings: '0.4', // This would come from actual calculation
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, fetchStats };
}
