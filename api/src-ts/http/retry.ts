import pRetry, { AbortError } from 'p-retry';
import type { Logger } from '../logger';
import type { RetryConfig } from '../config/types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: any): boolean {
  const status = error?.response?.status;
  const errorCode = error?.response?.data?.['o:errorCode'];

  if (status === 429 || errorCode === 'SSS_REQUEST_LIMIT_EXCEEDED') return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (!status && ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code)) return true;

  return false;
}

function retryAfterMs(error: any): number | null {
  const header = error?.response?.headers?.['retry-after'];
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function withJitter(ms: number): number {
  const delta = ms * 0.2;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

/**
 * Wraps a NetSuite HTTP call with exponential backoff + jitter. Transient
 * errors (429/SSS_REQUEST_LIMIT_EXCEEDED/5xx/timeouts) are retried, honoring
 * a Retry-After header when NetSuite sends one; anything else (bad creds,
 * malformed SuiteQL) aborts immediately instead of burning the retry budget.
 */
export async function withRetry<T>(task: () => Promise<T>, retryConfig: RetryConfig, logger: Logger): Promise<T> {
  return pRetry(
    async () => {
      try {
        return await task();
      } catch (error: any) {
        if (!isRetryable(error)) {
          throw new AbortError(error instanceof Error ? error : new Error(String(error)));
        }

        const explicitDelay = retryAfterMs(error);
        if (explicitDelay) {
          await sleep(withJitter(explicitDelay));
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
          'NetSuite request attempt failed',
        );
      },
    },
  );
}
