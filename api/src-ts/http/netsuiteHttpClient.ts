import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type Bottleneck from 'bottleneck';
import { NetSuiteOAuthSigner } from './oauth';
import { withRetry } from './retry';
import type { Logger } from '../logger';
import type { ErpConfig } from '../config/types';

export interface SuiteQlLink {
  rel: string;
  href: string;
}

export interface SuiteQlResponse<T> {
  items?: T[];
  hasMore?: boolean;
  links?: SuiteQlLink[];
  totalResults?: number;
}

/** Verified empirically: NetSuite's SuiteQL REST endpoint rejects any
 * `offset` above 99000, and defaults to a 1000-row page size, so at most
 * 100,000 rows are ever reachable via offset pagination for a single query
 * regardless of how many rows actually match it. */
const NETSUITE_OFFSET_PAGINATION_CEILING = 100_000;

export interface ContinuationInfo<T> {
  lastPage: T[];
  fetchedSoFar: number;
  totalResults: number;
}

export interface ExecuteSuiteQlOptions<T> {
  /** When provided, each page is streamed here instead of being buffered into the return value. */
  pageCallback?: (page: T[]) => Promise<void>;
  /**
   * NetSuite's offset-based pagination silently caps out at 100,000 rows:
   * the last reachable page reports `hasMore: false` even when
   * `totalResults` says more remain, with no error at all. When that
   * happens and this is provided, it's called with the last page fetched
   * plus the running totals; return a new SuiteQL query to resume fetching
   * from a different anchor (offset resets to 0 for it), or
   * null/undefined to stop there.
   */
  continueBeyondOffsetCap?: (info: ContinuationInfo<T>) => string | null | undefined;
}

/**
 * Ports the SuiteQL executor + pagination loop from netsuiteService.js:52-105,
 * adding shared rate-limiting and retry/backoff around every request.
 */
export class NetSuiteHttpClient {
  private readonly http: AxiosInstance;
  private readonly signer: NetSuiteOAuthSigner;
  private readonly baseUrl: string;

  constructor(
    private readonly erpConfig: ErpConfig,
    private readonly limiter: Bottleneck,
    private readonly logger: Logger,
  ) {
    this.signer = new NetSuiteOAuthSigner({
      consumerKey: erpConfig.CONSUMER_KEY,
      consumerSecret: erpConfig.CONSUMER_SECRET,
      accessToken: erpConfig.ACCESS_TOKEN,
      tokenSecret: erpConfig.TOKEN_SECRET,
      realm: erpConfig.REALM,
    });
    this.baseUrl = `https://${this.signer.accountRealmHost}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
    this.http = axios.create({ timeout: erpConfig.SYNC.HTTP_TIMEOUT_MS });
  }

  async validateCredentials(): Promise<void> {
    try {
      await this.postSigned(this.baseUrl, { q: 'SELECT 1 FROM dual' });
    } catch (error: any) {
      if (error?.response?.data?.['o:errorCode'] === 'INVALID_LOGIN') {
        throw new Error('Invalid NetSuite credentials. Please check your configuration.');
      }
      throw error;
    }
  }

  async executeSuiteQL<T = any>(query: string, options: ExecuteSuiteQlOptions<T> = {}): Promise<T[]> {
    const buffered: T[] = [];
    let currentQuery: string | null = query;
    let totalFetchedAcrossRounds = 0;

    while (currentQuery) {
      const activeQuery = currentQuery;
      let url = this.baseUrl;
      let hasMore = true;
      let lastPage: T[] = [];
      // Scoped to this round only: each round's totalResults reflects that
      // round's own (re-anchored, filtered) query scope, not the original
      // unfiltered one, so it must be compared against this round's own
      // fetched count — not the cumulative total across all rounds.
      let roundFetched = 0;
      let totalResults = 0;

      while (hasMore) {
        const response: AxiosResponse<SuiteQlResponse<T>> = await this.limiter.schedule(() =>
          withRetry(() => this.postSigned(url, { q: activeQuery }), this.erpConfig.SYNC.RETRY, this.logger),
        );

        const items = response.data?.items ?? [];
        lastPage = items;
        roundFetched += items.length;
        totalFetchedAcrossRounds += items.length;
        totalResults = response.data?.totalResults ?? roundFetched;

        if (options.pageCallback) {
          await options.pageCallback(items);
        } else {
          buffered.push(...items);
        }

        hasMore = Boolean(response.data?.hasMore);
        if (hasMore) {
          const nextLink = (response.data?.links ?? []).find((link) => link.rel === 'next');
          if (nextLink) {
            url = nextLink.href;
          } else {
            hasMore = false;
          }
        }
      }

      // NetSuite's offset-based pagination has a hard, verified ceiling:
      // offset must be <= 99000 with the default 1000-row page size, so at
      // most 100,000 rows are reachable per query no matter how many truly
      // match — it reports `hasMore: false` there with no error at all.
      // Its `totalResults` figure is also NOT reliable ground truth for
      // large result sets in practice (observed: a round self-reporting a
      // totalResults well above what it, and its own follow-up rounds,
      // ultimately ever returned before independently converging) — so
      // totalResults is exposed to continueBeyondOffsetCap for logging only
      // and never used to decide whether to keep going. Only the verified
      // mechanical ceiling itself decides that.
      const hitOffsetCeiling = roundFetched >= NETSUITE_OFFSET_PAGINATION_CEILING;
      currentQuery =
        hitOffsetCeiling && options.continueBeyondOffsetCap
          ? options.continueBeyondOffsetCap({ lastPage, fetchedSoFar: totalFetchedAcrossRounds, totalResults }) ?? null
          : null;
    }

    return buffered;
  }

  private postSigned(url: string, body: unknown): Promise<AxiosResponse<any>> {
    const headers = this.signer.sign({ url, method: 'POST' });
    return this.http.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'transient',
        Accept: 'application/json',
        ...headers,
      },
    });
  }
}
