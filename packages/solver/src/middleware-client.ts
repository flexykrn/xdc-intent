import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';

export interface PaymentRequest {
  amount: string;
  recipient: string;
  nonce: string;
  message: string;
  intentId: string;
  payer: string;
}

export interface PaymentProof {
  proof: {
    intentId: string;
    solver: string;
    token: string;
    amount: string;
    protocolFee: string;
    expiryTimestamp: number;
    chainId: number;
  };
  signature: string;
  middlewareAddress: string;
}

export class MiddlewareClient {
  constructor(
    private config: SolverConfig,
    private logger: Logger
  ) {}

  async requestPayment(intentId: string, payer: string): Promise<PaymentRequest> {
    try {
      const response = await fetch(
        `${this.config.middlewareUrl}/v1/payment-request?intentId=${intentId}&payer=${payer}`,
        {
          headers: {
            'X-API-Key': this.config.middlewareApiKey,
          },
        }
      );

      if (response.status === 402) {
        const paymentRequest = await response.json() as PaymentRequest;
        this.logger.info(`Payment requested for intent ${intentId}`, {
          amount: paymentRequest.amount,
          recipient: paymentRequest.recipient,
        });
        return paymentRequest;
      } else if (response.status === 404) {
        throw new Error('Intent not found or not pending');
      } else if (response.status === 401) {
        throw new Error('Invalid API key');
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to request payment for intent ${intentId}:`, error);
      throw error;
    }
  }

  async submitPayment(
    paymentRequest: PaymentRequest,
    solverAddress: string,
    signature: string
  ): Promise<PaymentProof> {
    try {
      const response = await fetch(`${this.config.middlewareUrl}/v1/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.middlewareApiKey,
        },
        body: JSON.stringify({
          intentId: paymentRequest.intentId,
          solverAddress,
          amount: paymentRequest.amount,
          nonce: paymentRequest.nonce,
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Payment failed: ${error}`);
      }

      const proof = await response.json() as PaymentProof;
      this.logger.info(`Payment accepted for intent ${paymentRequest.intentId}`, {
        middlewareAddress: proof.middlewareAddress,
      });

      return proof;
    } catch (error: any) {
      this.logger.error(`Failed to submit payment for intent ${paymentRequest.intentId}:`, error);
      throw error;
    }
  }

  async verifyProof(proof: PaymentProof): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.middlewareUrl}/v1/verify?proof=${encodeURIComponent(
          JSON.stringify(proof.proof)
        )}&signature=${proof.signature}`
      );

      const result = await response.json() as { valid: boolean };
      return result.valid === true;
    } catch (error) {
      this.logger.error('Proof verification failed:', error);
      return false;
    }
  }
}
