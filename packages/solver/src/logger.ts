export function createLogger(config: { logLevel: string }) {
  return {
    info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ''),
    warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ''),
    error: (msg: string, err?: any) => console.error(`[ERROR] ${msg}`, err ? (err instanceof Error ? err.message : JSON.stringify(err)) : ''),
    debug: (msg: string, meta?: any) => console.debug(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : ''),
  };
}

export type Logger = ReturnType<typeof createLogger>;
