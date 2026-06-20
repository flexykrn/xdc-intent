import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';

export interface FeeAdjustment {
  baseMargin: number;
  currentMargin: number;
  adjustment: number; // percentage change
  gasPriceGwei: number;
  timestamp: number;
}

export class DynamicFeeManager {
  private currentMargin: number;
  private lastAdjustment: number = 0;
  private adjustmentHistory: FeeAdjustment[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: SolverConfig,
    private logger: Logger,
    private provider: ethers.Provider
  ) {
    this.currentMargin = config.minProfitMargin;
  }

  startMonitoring(intervalMinutes: number = 5): void {
    this.logger.info(`Starting dynamic fee monitoring (interval: ${intervalMinutes} minutes)`);
    
    // Initial adjustment
    this.adjustFee();

    // Periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.adjustFee();
    }, intervalMinutes * 60 * 1000);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Dynamic fee monitoring stopped');
    }
  }

  async adjustFee(): Promise<FeeAdjustment> {
    try {
      const gasPrice = await this.provider.getFeeData();
      const gasPriceGwei = gasPrice.gasPrice ? Number(ethers.formatUnits(gasPrice.gasPrice, 'gwei')) : 0;

      // Calculate adjustment based on gas price
      // Base: 0.1 gwei = base margin
      // Higher gas = wider margin
      const baseGasPrice = 0.1; // XDC typical gas price
      const gasRatio = gasPriceGwei / baseGasPrice;

      // Adjustment formula: +/- 50% cap
      // If gas is 2x base, increase margin by up to 50%
      // If gas is 0.5x base, decrease margin by up to 50%
      let adjustmentPercent = (gasRatio - 1) * 50; // 50% sensitivity
      adjustmentPercent = Math.max(-50, Math.min(50, adjustmentPercent)); // Cap at +/- 50%

      const newMargin = this.config.minProfitMargin * (1 + adjustmentPercent / 100);
      
      const adjustment: FeeAdjustment = {
        baseMargin: this.config.minProfitMargin,
        currentMargin: newMargin,
        adjustment: adjustmentPercent,
        gasPriceGwei,
        timestamp: Math.floor(Date.now() / 1000),
      };

      this.currentMargin = newMargin;
      this.lastAdjustment = adjustmentPercent;
      this.adjustmentHistory.push(adjustment);

      // Keep last 100 adjustments
      if (this.adjustmentHistory.length > 100) {
        this.adjustmentHistory.shift();
      }

      this.logger.info(`Fee adjusted: ${this.config.minProfitMargin}% → ${newMargin.toFixed(2)}% (${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent.toFixed(1)}%)`, {
        gasPriceGwei: gasPriceGwei.toFixed(4),
        reason: this.getAdjustmentReason(gasRatio, adjustmentPercent),
      });

      return adjustment;
    } catch (error) {
      this.logger.error('Failed to adjust fee:', error);
      return {
        baseMargin: this.config.minProfitMargin,
        currentMargin: this.currentMargin,
        adjustment: 0,
        gasPriceGwei: 0,
        timestamp: Math.floor(Date.now() / 1000),
      };
    }
  }

  getCurrentMargin(): number {
    return this.currentMargin;
  }

  getAdjustmentHistory(): FeeAdjustment[] {
    return [...this.adjustmentHistory];
  }

  private getAdjustmentReason(gasRatio: number, adjustment: number): string {
    if (adjustment > 20) return 'Gas prices high, widening margin for safety';
    if (adjustment > 5) return 'Gas prices elevated, slight margin increase';
    if (adjustment < -20) return 'Gas prices low, tightening margin for competitiveness';
    if (adjustment < -5) return 'Gas prices favorable, slight margin decrease';
    return 'Gas prices stable, margin unchanged';
  }
}
