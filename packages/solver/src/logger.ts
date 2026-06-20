import winston from 'winston';
import { SolverConfig } from './config';

export function createLogger(config: SolverConfig) {
  return winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { 
      service: 'xdc-solver',
      chainId: config.chainId 
    },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...metadata }) => {
            let msg = `${timestamp} [${level}]: ${message}`;
            if (Object.keys(metadata).length > 0) {
              msg += ` ${JSON.stringify(metadata)}`;
            }
            return msg;
          })
        )
      }),
      new winston.transports.File({ 
        filename: 'logs/solver-error.log', 
        level: 'error' 
      }),
      new winston.transports.File({ 
        filename: 'logs/solver-combined.log' 
      })
    ]
  });
}

export type Logger = winston.Logger;
