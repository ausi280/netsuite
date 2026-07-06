import type { AppConfig, EntitySyncConfig, ErpSyncConfig, SyncEntityName } from './types';

// The legacy JS app loads secrets from api/config/env.json (gitignored),
// merged/exposed as { env, tenants } by api/config/index.js. We reuse that
// same source instead of introducing a parallel dotenv-based config system.
const legacyConfig = require('../../config') as { env: Record<string, any> };

const DEFAULT_CRON: Record<SyncEntityName, string> = {
  customer: '10 1 * * *',
  contract: '20 1 * * *',
  invoice: '30 1 * * *',
  payment: '40 1 * * *',
  employee: '50 1 * * *',
  receivable: '0 2 * * *',
};

function defaultEntityConfig(entity: SyncEntityName): EntitySyncConfig {
  return { ENABLED: false, CRON: DEFAULT_CRON[entity] };
}

function mergeEntityConfig(entity: SyncEntityName, raw: Partial<EntitySyncConfig> | undefined): EntitySyncConfig {
  const fallback = defaultEntityConfig(entity);
  return {
    ENABLED: raw?.ENABLED ?? fallback.ENABLED,
    CRON: raw?.CRON ?? fallback.CRON,
  };
}

function buildSyncConfig(raw: Partial<ErpSyncConfig> | undefined): ErpSyncConfig {
  return {
    OVERLAP_BUFFER_MINUTES: raw?.OVERLAP_BUFFER_MINUTES ?? 15,
    MAX_CONCURRENT_ENTITIES: raw?.MAX_CONCURRENT_ENTITIES ?? 2,
    PAGE_SIZE: raw?.PAGE_SIZE ?? 100,
    HTTP_TIMEOUT_MS: raw?.HTTP_TIMEOUT_MS ?? 30000,
    RETRY: {
      MAX_ATTEMPTS: raw?.RETRY?.MAX_ATTEMPTS ?? 5,
      MIN_TIMEOUT_MS: raw?.RETRY?.MIN_TIMEOUT_MS ?? 500,
      MAX_TIMEOUT_MS: raw?.RETRY?.MAX_TIMEOUT_MS ?? 30000,
    },
    RATE_LIMIT: {
      MAX_CONCURRENT_REQUESTS: raw?.RATE_LIMIT?.MAX_CONCURRENT_REQUESTS ?? 3,
      MIN_TIME_MS: raw?.RATE_LIMIT?.MIN_TIME_MS ?? 250,
    },
    LOG_LEVEL: raw?.LOG_LEVEL ?? 'info',
    CUSTOMER: mergeEntityConfig('customer', raw?.CUSTOMER),
    CONTRACT: mergeEntityConfig('contract', raw?.CONTRACT),
    INVOICE: mergeEntityConfig('invoice', raw?.INVOICE),
    PAYMENT: mergeEntityConfig('payment', raw?.PAYMENT),
    EMPLOYEE: mergeEntityConfig('employee', raw?.EMPLOYEE),
    RECEIVABLE: mergeEntityConfig('receivable', raw?.RECEIVABLE),
  };
}

function loadConfig(): AppConfig {
  const env = legacyConfig.env || {};
  const erpRaw = env.SERVICES && env.SERVICES.ERP;

  if (!erpRaw) {
    throw new Error('Missing SERVICES.ERP configuration in config/env.json');
  }

  for (const key of ['URL', 'CONSUMER_KEY', 'CONSUMER_SECRET', 'ACCESS_TOKEN', 'TOKEN_SECRET', 'REALM']) {
    if (!erpRaw[key]) {
      throw new Error(`Missing required SERVICES.ERP.${key} configuration in config/env.json`);
    }
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    erp: {
      URL: erpRaw.URL,
      CONSUMER_KEY: erpRaw.CONSUMER_KEY,
      CONSUMER_SECRET: erpRaw.CONSUMER_SECRET,
      ACCESS_TOKEN: erpRaw.ACCESS_TOKEN,
      TOKEN_SECRET: erpRaw.TOKEN_SECRET,
      REALM: erpRaw.REALM,
      SYNC: buildSyncConfig(erpRaw.SYNC),
    },
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

export * from './types';
