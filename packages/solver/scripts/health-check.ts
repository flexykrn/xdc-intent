interface SolverEndpoint {
  name: string;
  url: string;
}

interface HealthResult {
  endpoint: SolverEndpoint;
  healthOk: boolean;
  healthStatus?: number;
  healthBody?: unknown;
  healthError?: string;
  metricsOk: boolean;
  metricsStatus?: number;
  metricsError?: string;
}

function parseEndpoints(): SolverEndpoint[] {
  const raw = process.env.SOLVER_HEALTH_URLS || 'http://localhost:3001,http://localhost:3003';
  return raw.split(',').map((entry, index) => {
    const [name, url] = entry.includes('=') ? entry.split('=') : [`solver-${index + 1}`, entry];
    return { name: name.trim(), url: url.trim() };
  });
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<{ ok: boolean; status: number; body?: unknown; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error: any) {
    return { ok: false, status: 0, error: error.message };
  }
}

async function checkEndpoint(endpoint: SolverEndpoint): Promise<HealthResult> {
  const healthUrl = `${endpoint.url.replace(/\/$/, '')}/health`;
  const metricsUrl = `${endpoint.url.replace(/\/$/, '')}/metrics`;

  const health = await fetchJson(healthUrl);
  const metrics = await fetchJson(metricsUrl);

  const healthOk = health.ok && (health.body as any)?.status === 'healthy';
  const metricsOk = metrics.ok;

  return {
    endpoint,
    healthOk,
    healthStatus: health.status,
    healthBody: health.body,
    healthError: health.error,
    metricsOk,
    metricsStatus: metrics.status,
    metricsError: metrics.error,
  };
}

export async function runHealthCheck(): Promise<HealthResult[]> {
  const endpoints = parseEndpoints();
  const results = await Promise.all(endpoints.map(checkEndpoint));

  for (const r of results) {
    const status = r.healthOk && r.metricsOk ? 'OK' : 'FAIL';
    console.log(`[${status}] ${r.endpoint.name} (${r.endpoint.url})`);
    if (!r.healthOk) {
      console.log(`  /health  -> ${r.healthStatus || 'ERROR'} ${r.healthError || JSON.stringify(r.healthBody)}`);
    }
    if (!r.metricsOk) {
      console.log(`  /metrics -> ${r.metricsStatus || 'ERROR'} ${r.metricsError}`);
    }
  }

  const failed = results.filter((r) => !r.healthOk || !r.metricsOk);
  if (failed.length > 0) {
    throw new Error(`${failed.length} solver(s) unhealthy`);
  }

  return results;
}

if (require.main === module) {
  runHealthCheck().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
