const LEVELS: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function createLogger(config: { logLevel: string }) {
  const threshold = LEVELS[config.logLevel] ?? 2;

  return {
    info: (msg: string, meta?: any) => {
      if (threshold >= 2) console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : '');
    },
    warn: (msg: string, meta?: any) => {
      if (threshold >= 1) console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : '');
    },
    error: (msg: string, err?: any) => {
      if (threshold >= 0) console.error(`[ERROR] ${msg}`, err ? (err instanceof Error ? err.message : JSON.stringify(err)) : '');
    },
    debug: (msg: string, meta?: any) => {
      if (threshold >= 3) console.debug(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : '');
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
