import Bottleneck from 'bottleneck';
import type { RateLimitConfig } from '../config/types';

export function createRateLimiter(config: RateLimitConfig): Bottleneck {
  return new Bottleneck({
    maxConcurrent: config.MAX_CONCURRENT_REQUESTS,
    minTime: config.MIN_TIME_MS,
  });
}
