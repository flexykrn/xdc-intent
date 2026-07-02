import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';

export interface PaymentRequest {
  amount: string;
  asset: string;
  payTo: string;
  network: string;
  nonce: string;
  deadline: number;
  intentId: string;
}

export interface PaymentProof {
  paymentTxHash: string;
}

export class FacilitatorClient {
  constructor(private config: SolverConfig, private logger: Logger) {}

  async requestPayment(intentId: string, solverAddress: string): Promise<PaymentRequest> {
    const res = await fetch(
      `${this.config.facilitatorUrl}/v1/payment-request?intentId=${intentId}&payer=${solverAddress}`,
      { headers: { 'X-API-Key': this.config.facilitatorApiKey } }
    );
    const body = await res.json();
    this.logger.debug('Payment request response', body);
    if (res.ok) {
      return body as PaymentRequest;
    }
    throw new Error(`Unexpected facilitator status: ${res.status}`);
  }

  async submitPaymentProof(
    paymentTxHash: string,
    intentId: string,
    solverAddress: string
  ): Promise<PaymentProof> {
    const res = await fetch(`${this.config.facilitatorUrl}/v1/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.config.facilitatorApiKey },
      body: JSON.stringify({ intentId, solverAddress, paymentTxHash }),
    });
    if (!res.ok) throw new Error(`Payment proof failed: ${await res.text()}`);
    return (await res.json()) as PaymentProof;
  }
}
