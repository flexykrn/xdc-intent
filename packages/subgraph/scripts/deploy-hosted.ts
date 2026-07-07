import { spawn } from 'child_process';
import path from 'path';

const TARGET = (process.env.DEPLOY_TARGET as 'studio' | 'goldsky') || 'studio';
const SUBGRAPH_NAME = process.env.SUBGRAPH_NAME || 'xdc-intent';
const GOLDSKY_VERSION = process.env.GOLDSKY_VERSION || 'v0.0.1';
const ROOT = path.resolve(__dirname, '..');

function run(command: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`> ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function deploy() {
  await run('graph', ['codegen']);
  await run('graph', ['build']);

  if (TARGET === 'studio') {
    await run('graph', ['deploy', '--studio', SUBGRAPH_NAME]);
  } else if (TARGET === 'goldsky') {
    await run('goldsky', ['subgraph', 'deploy', `${SUBGRAPH_NAME}/${GOLDSKY_VERSION}`, '--path', '.']);
  } else {
    throw new Error(`Unknown DEPLOY_TARGET: ${TARGET}. Use 'studio' or 'goldsky'.`);
  }

  console.log(`\nSubgraph deployed to ${TARGET}: ${SUBGRAPH_NAME}`);
}

deploy().catch((error) => {
  console.error('Deployment failed:', error.message);
  process.exit(1);
});
