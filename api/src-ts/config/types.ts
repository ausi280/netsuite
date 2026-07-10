export interface EntitySyncConfig {
  ENABLED: boolean;
  CRON: string;
}

export type SyncEntityName =
  | 'customer'
  | 'contract'
  | 'familyMember'
  | 'service'
  | 'invoice'
  | 'payment'
  | 'employee'
  | 'receivable';

export interface RetryConfig {
  MAX_ATTEMPTS: number;
  MIN_TIMEOUT_MS: number;
  MAX_TIMEOUT_MS: number;
}

export interface RateLimitConfig {
  MAX_CONCURRENT_REQUESTS: number;
  MIN_TIME_MS: number;
}

export interface ErpSyncConfig {
  OVERLAP_BUFFER_MINUTES: number;
  MAX_CONCURRENT_ENTITIES: number;
  PAGE_SIZE: number;
  HTTP_TIMEOUT_MS: number;
  RETRY: RetryConfig;
  RATE_LIMIT: RateLimitConfig;
  LOG_LEVEL: string;
  CUSTOMER: EntitySyncConfig;
  CONTRACT: EntitySyncConfig;
  FAMILY_MEMBER: EntitySyncConfig;
  SERVICE: EntitySyncConfig;
  INVOICE: EntitySyncConfig;
  PAYMENT: EntitySyncConfig;
  EMPLOYEE: EntitySyncConfig;
  RECEIVABLE: EntitySyncConfig;
}

export interface ErpConfig {
  URL: string;
  CONSUMER_KEY: string;
  CONSUMER_SECRET: string;
  ACCESS_TOKEN: string;
  TOKEN_SECRET: string;
  REALM: string;
  SYNC: ErpSyncConfig;
}

export interface AppConfig {
  nodeEnv: string;
  erp: ErpConfig;
}
