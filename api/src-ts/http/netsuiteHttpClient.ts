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
}

export interface ExecuteSuiteQlOptions<T> {
  /** When provided, each page is streamed here instead of being buffered into the return value. */
  pageCallback?: (page: T[]) => Promise<void>;
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
    let url = this.baseUrl;
    let hasMore = true;
    const buffered: T[] = [];
    const body = { q: query };

    while (hasMore) {
      const response: AxiosResponse<SuiteQlResponse<T>> = await this.limiter.schedule(() =>
        withRetry(() => this.postSigned(url, body), this.erpConfig.SYNC.RETRY, this.logger),
      );

      const items = response.data?.items ?? [];
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
