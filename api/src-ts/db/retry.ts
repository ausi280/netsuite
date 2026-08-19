import pRetry, { AbortError } from 'p-retry';
import type { Logger } from '../logger';

// "Can't rollback transaction. There is a request in progress" is a known
// tedious/mssql signature for a request timeout racing a transaction's own
// rollback — not necessarily a dropped connection. Retrying with a fresh
// transaction (the caller must re-run its whole operation, not resume mid-
// transaction) recovers from this and from genuine transient connection
// blips alike.
const RETRYABLE_PATTERNS = [
  "can't rollback transaction",
  'econnreset',
  'etimeout',
  'esocket',
  'enotfound',
  'connection lost',
  'connection is closed',
  'failed to connect',
];

function isRetryableDbError(error: any): boolean {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  const code = String(error?.code ?? '').toLowerCase();
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern) || code.includes(pattern));
}

export interface DbRetryConfig {
  MAX_ATTEMPTS: number;
  MIN_TIMEOUT_MS: number;
  MAX_TIMEOUT_MS: number;
}

/**
 * Wraps a DB operation (typically one page's upsert transaction) with retry
 * on known-transient failures. Each retry re-runs `task` from scratch —
 * it must open its own new transaction per attempt, not resume a dead one
 * — which is safe here since every write in this codebase is an idempotent
 * upsert keyed by netsuite_id.
 */
export async function withDbRetry<T>(task: () => Promise<T>, retryConfig: DbRetryConfig, logger: Logger): Promise<T> {
  return pRetry(
    async () => {
      try {
        return await task();
      } catch (error: any) {
        if (!isRetryableDbError(error)) {
          throw new AbortError(error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      }
    },
    {
      retries: retryConfig.MAX_ATTEMPTS,
      factor: 2,
      minTimeout: retryConfig.MIN_TIMEOUT_MS,
      maxTimeout: retryConfig.MAX_TIMEOUT_MS,
      randomize: true,
      onFailedAttempt: (err) => {
        logger.warn(
          { attempt: err.attemptNumber, retriesLeft: err.retriesLeft, message: err.message },
          'DB page-write attempt failed',
        );
      },
    },
  );
}
