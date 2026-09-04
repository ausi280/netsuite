import type { AppConfig, EntitySyncConfig, ErpSyncConfig, SyncEntityName } from './types';

// The legacy JS app loads secrets from api/config/env.json (gitignored),
// merged/exposed as { env, tenants } by api/config/index.js. We reuse that
// same source instead of introducing a parallel dotenv-based config system.
const legacyConfig = require('../../config') as { env: Record<string, any> };

// One staggered nightly batch, 10 minutes apart, starting 06:00 UTC.
const DEFAULT_CRON: Record<SyncEntityName, string> = {
  customer: '0 6 * * *',
  contract: '10 6 * * *',
  familyMember: '20 6 * * *',
  invoice: '30 6 * * *',
  payment: '40 6 * * *',
  employee: '50 6 * * *',
  receivable: '0 7 * * *',
  hospital: '10 7 * * *',
  partida: '20 7 * * *',
  service: '30 7 * * *',
  serviceType: '40 7 * * *',
  servicePackage: '50 7 * * *',
  serialNumber: '0 8 * * *',
  medico: '10 8 * * *',
  medicoColombia: '20 8 * * *',
  vendor: '30 8 * * *',
  vendorTransaction: '40 8 * * *',
  vendorBillPayment: '50 8 * * *',
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
    FAMILY_MEMBER: mergeEntityConfig('familyMember', raw?.FAMILY_MEMBER),
    SERVICE: mergeEntityConfig('service', raw?.SERVICE),
    INVOICE: mergeEntityConfig('invoice', raw?.INVOICE),
    PAYMENT: mergeEntityConfig('payment', raw?.PAYMENT),
    EMPLOYEE: mergeEntityConfig('employee', raw?.EMPLOYEE),
    RECEIVABLE: mergeEntityConfig('receivable', raw?.RECEIVABLE),
    HOSPITAL: mergeEntityConfig('hospital', raw?.HOSPITAL),
    PARTIDA: mergeEntityConfig('partida', raw?.PARTIDA),
    SERVICE_TYPE: mergeEntityConfig('serviceType', raw?.SERVICE_TYPE),
    SERVICE_PACKAGE: mergeEntityConfig('servicePackage', raw?.SERVICE_PACKAGE),
    SERIAL_NUMBER: mergeEntityConfig('serialNumber', raw?.SERIAL_NUMBER),
    MEDICO: mergeEntityConfig('medico', raw?.MEDICO),
    MEDICO_COLOMBIA: mergeEntityConfig('medicoColombia', raw?.MEDICO_COLOMBIA),
    VENDOR: mergeEntityConfig('vendor', raw?.VENDOR),
    VENDOR_TRANSACTION: mergeEntityConfig('vendorTransaction', raw?.VENDOR_TRANSACTION),
    VENDOR_BILL_PAYMENT: mergeEntityConfig('vendorBillPayment', raw?.VENDOR_BILL_PAYMENT),
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

export interface AzureAdConfig {
  tenantId: string;
  clientId: string;
}

/**
 * Reads AZURE_AD.TENANT_ID/CLIENT_ID from config/env.json. Deliberately not
 * called from loadConfig()/getConfig() — the reporting API is the only
 * consumer, and it's expected to be blank until the Entra ID app
 * registration is completed, so this only throws when a caller actually
 * needs it (buildEntraAuthMiddleware, at reporting-router build time), not
 * at general app startup.
 */
export function getAzureAdConfig(): AzureAdConfig {
  const raw = legacyConfig.env && legacyConfig.env.AZURE_AD;
  const tenantId = raw && raw.TENANT_ID;
  const clientId = raw && raw.CLIENT_ID;

  if (!tenantId || !clientId) {
    throw new Error(
      'Missing AZURE_AD.TENANT_ID/CLIENT_ID configuration in config/env.json. ' +
        'Complete the Entra ID app registration and populate these values before the reporting API can validate requests.',
    );
  }

  return { tenantId, clientId };
}

export interface LegacyDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Reads LEGACY_DB from config/env.json (host/port/database are non-secret defaults from
 * config.json; user/password are the gitignored secret overlay) - the old CryoCell SQL Server
 * database (pre-NetSuite), queried read-only for records not yet migrated (e.g. NotasCobranza).
 * Lazily read (not part of loadConfig/getConfig) since only the reporting API's legacy-notes
 * route needs it.
 */
export function getLegacyDbConfig(): LegacyDbConfig {
  const raw = legacyConfig.env && legacyConfig.env.LEGACY_DB;
  if (!raw || !raw.HOST || !raw.DATABASE || !raw.USER || !raw.PASSWORD) {
    throw new Error('Missing LEGACY_DB configuration (HOST/DATABASE/USER/PASSWORD) in config/env.json.');
  }

  return {
    host: raw.HOST,
    port: raw.PORT || 1433,
    database: raw.DATABASE,
    user: raw.USER,
    password: raw.PASSWORD,
  };
}

export * from './types';
