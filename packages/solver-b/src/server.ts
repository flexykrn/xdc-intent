import http from 'http';
import { ethers } from 'ethers';
import { Logger } from './logger';
import { StateManager } from './state';
import { TransactionSubmitter } from './submitter';
import { SolverConfig } from './config';
import { CircuitBreaker } from './circuit-breaker';
import { InventoryTracker } from './inventory';

export function startSolverHttpServer(
  port: number,
  state: StateManager,
  submitter: TransactionSubmitter,
  config: SolverConfig,
  fulfillmentBreaker: CircuitBreaker,
  inventory: InventoryTracker,
  logger: Logger,
  facilitatorUrl?: string
): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';

    if (url === '/health' && req.method === 'GET') {
      const health = await buildHealth(state, submitter, config, fulfillmentBreaker, facilitatorUrl);
      res.writeHead(health.status === 'healthy' ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
      return;
    }

    if (url === '/metrics' && req.method === 'GET') {
      const metrics = await buildPrometheusMetrics(state, fulfillmentBreaker, config, inventory);
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(metrics);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    logger.info(`Solver HTTP server listening on port ${port}`);
  });

  server.on('error', (err) => {
    logger.error('Solver HTTP server error:', err.message);
  });

  return server;
}

async function buildHealth(
  state: StateManager,
  submitter: TransactionSubmitter,
  config: SolverConfig,
  breaker: CircuitBreaker,
  facilitatorUrl?: string
): Promise<Record<string, unknown>> {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};
  let healthy = true;

  // RPC check
  try {
    const start = Date.now();
    const provider = submitter.getSigner().provider;
    const block = await provider?.getBlockNumber();
    checks.rpc = { status: 'ok', latencyMs: Date.now() - start };
    if (!block || block <= 0) {
      checks.rpc = { status: 'degraded', error: 'Unexpected block number' };
      healthy = false;
    }
  } catch (e: any) {
    checks.rpc = { status: 'error', error: e.message };
    healthy = false;
  }

  // Middleware check
  if (facilitatorUrl) {
    try {
      const start = Date.now();
      const res = await fetch(`${facilitatorUrl}/health`, { signal: AbortSignal.timeout(5000) });
      checks.middleware = { status: res.ok ? 'ok' : 'error', latencyMs: Date.now() - start };
      if (!res.ok) healthy = false;
    } catch (e: any) {
      checks.middleware = { status: 'error', error: e.message };
      healthy = false;
    }
  }

  checks.circuitBreaker = { status: breaker.getState() };
  if (breaker.getState() === 'OPEN') healthy = false;

  return {
    status: healthy ? 'healthy' : 'degraded',
    solver: submitter.getAddress(),
    chainId: config.chainId,
    lastProcessedBlock: state.getLastProcessedBlock(),
    checks,
    timestamp: new Date().toISOString(),
  };
}

async function buildPrometheusMetrics(
  state: StateManager,
  breaker: CircuitBreaker,
  config: SolverConfig,
  inventory: InventoryTracker
): Promise<string> {
  const metrics = state.getMetrics();
  const lines: string[] = [];

  const gauge = (name: string, help: string, value: number, labels?: Record<string, string>) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    const labelStr = labels
      ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}'
      : '';
    lines.push(`${name}${labelStr} ${value}`);
  };

  const counter = (name: string, help: string, value: number) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  };

  gauge('xdcintent_solver_pending_intents', 'Number of intents waiting to be processed', metrics.pending);
  gauge('xdcintent_solver_inflight_intents', 'Number of intents currently being processed', metrics.inFlight);
  counter('xdcintent_solver_completed_intents_total', 'Total number of completed intents', metrics.completed);
  counter('xdcintent_solver_failed_intents_total', 'Total number of failed intents', metrics.failed);
  gauge('xdcintent_solver_seen_intents_total', 'Total number of unique intents seen', metrics.totalSeen);
  gauge('xdcintent_solver_retryable_intents', 'Number of intents eligible for retry', metrics.retryable);
  gauge('xdcintent_solver_last_processed_block', 'Last block processed by the watcher', state.getLastProcessedBlock());
  gauge('xdcintent_solver_circuit_breaker_state', 'Circuit breaker state (0=closed,1=half-open,2=open)', circuitStateValue(breaker.getState()));
  gauge('xdcintent_solver_max_retries', 'Configured maximum retry attempts', config.maxRetries);

  for (const entry of inventory.getCachedBalances()) {
    gauge(
      'xdcintent_solver_inventory',
      'Solver token balance per chain',
      parseFloat(ethers.formatUnits(entry.balance, entry.decimals)),
      { token: entry.token.toLowerCase(), chain_id: String(entry.chainId) }
    );
  }

  return lines.join('\n') + '\n';
}

function circuitStateValue(state: string): number {
  switch (state) {
    case 'CLOSED':
      return 0;
    case 'HALF_OPEN':
      return 1;
    case 'OPEN':
      return 2;
    default:
      return 0;
  }
}
