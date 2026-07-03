import http from 'http';
import { Logger } from './logger';
import { StateManager } from './state';
import { TransactionSubmitter } from './submitter';

export function startSolverHttpServer(
  port: number,
  state: StateManager,
  submitter: TransactionSubmitter,
  logger: Logger
): http.Server {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        solver: submitter.getAddress(),
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    if (req.url === '/metrics' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        ...state.getMetrics(),
        lastProcessedBlock: state.getLastProcessedBlock(),
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    res.writeHead(404);
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
