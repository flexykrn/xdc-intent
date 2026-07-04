import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  resource: { url: string; description?: string };
  accepts: PaymentRequirements[];
}

export interface Quote {
  intentId: string;
  solverAddress: string;
  outputAmount: string;
  feeBps: number;
  signature: string;
  createdAt: number;
}

export class FacilitatorClient {
  constructor(private config: SolverConfig, private logger: Logger) {}

  async submitQuote(quote: {
    intentId: string;
    solverAddress: string;
    outputAmount: string;
    feeBps: number;
    signature: string;
  }): Promise<{ success: boolean; quote?: Quote; error?: string }> {
    const res = await fetch(`${this.config.facilitatorUrl}/v1/quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.facilitatorApiKey,
      },
      body: JSON.stringify(quote),
    });
    const body = (await res.json()) as any;
    if (!res.ok) {
      return { success: false, error: body.error || `Status ${res.status}` };
    }
    return { success: true, quote: body.quote as Quote };
  }

  async getQuotes(intentId: string): Promise<Quote[]> {
    const res = await fetch(`${this.config.facilitatorUrl}/v1/intents/${intentId}/quotes`);
    if (!res.ok) return [];
    const body = (await res.json()) as any;
    return (body.quotes || []) as Quote[];
  }

  async requestPayment(intentId: string): Promise<PaymentRequired> {
    const res = await fetch(`${this.config.facilitatorUrl}/v1/intents/${intentId}/payment-required`);
    const body = (await res.json()) as any;
    if (!res.ok && res.status !== 402) {
      throw new Error(`Unexpected facilitator status: ${res.status}`);
    }
    if (res.headers.get('PAYMENT-REQUIRED')) {
      const decoded = Buffer.from(res.headers.get('PAYMENT-REQUIRED')!, 'base64').toString('utf8');
      return JSON.parse(decoded) as PaymentRequired;
    }
    return body as PaymentRequired;
  }

  async settlePayment(
    intentId: string,
    paymentPayload: {
      x402Version: number;
      accepted: PaymentRequirements;
      payload: {
        authorization: {
          from: string;
          to: string;
          value: string;
          validAfter: string;
          validBefore: string;
          nonce: string;
        };
        signature: string;
      };
    }
  ): Promise<{ success: boolean; transaction?: string; error?: string }> {
    const encoded = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    const res = await fetch(`${this.config.facilitatorUrl}/v1/intents/${intentId}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.facilitatorApiKey,
        'PAYMENT-SIGNATURE': encoded,
      },
    });
    const body = (await res.json()) as any;
    if (!res.ok) {
      return { success: false, error: body.error || `Status ${res.status}` };
    }
    return { success: true, transaction: body.transaction as string };
  }
}
