import { runHealthCheck } from './health-check';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function postToDiscord(content: string): Promise<void> {
  if (!WEBHOOK_URL) {
    console.log('DISCORD_WEBHOOK_URL not set; skipping webhook alert.');
    console.log('Would have posted:', content);
    return;
  }

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }

  console.log('Discord alert sent.');
}

async function main() {
  try {
    await runHealthCheck();
    console.log('All solvers healthy. No alert needed.');
  } catch (error: any) {
    const message = `:warning: Solver health check failed: ${error.message}`;
    console.error(message);
    await postToDiscord(message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Alert check failed:', error.message);
  process.exit(1);
});
