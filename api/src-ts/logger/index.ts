import pino, { Logger } from 'pino';
import { getConfig } from '../config';

let root: Logger | null = null;

function getRoot(): Logger {
  if (!root) {
    root = pino({ level: getConfig().erp.SYNC.LOG_LEVEL, name: 'netsuite-sync' });
  }
  return root;
}

export function createLogger(module: string, runId?: string): Logger {
  return getRoot().child({ module, ...(runId ? { runId } : {}) });
}

export type { Logger };
