import type { AppConfig, EntitySyncConfig, ErpSyncConfig, SyncEntityName } from './types';

// The legacy JS app loads secrets from api/config/env.json (gitignored),
// merged/exposed as { env, tenants } by api/config/index.js. We reuse that
// same source instead of introducing a parallel dotenv-based config system.
const legacyConfig = require('../../config') as { env: Record<string, any> };

// 6 staggered batches a day (every 4h: 00/04/08/12/16/20, 01/05/09/13/17/21, 02/06/10/14/18/22,
// 03/07/11/15/19/23 UTC per group below) - same 10-minutes-apart-within-a-batch stagger the
// original once-nightly schedule used, just repeated every 4 hours instead of once. First
// expanded from nightly to every 6h on 2026-09-30, then to every 4h on 2026-10-01, both per
// explicit instruction. Keep this in sync with config.json's SERVICES.ERP.SYNC.<ENTITY>.CRON,
// which is what actually governs the deployed schedule - this map is only the fallback for an
// entity config.json doesn't list.
const DEFAULT_CRON: Record<SyncEntityName, string> = {
  customer: '0 0,4,8,12,16,20 * * *',
  contract: '10 0,4,8,12,16,20 * * *',
  familyMember: '20 0,4,8,12,16,20 * * *',
  invoice: '30 0,4,8,12,16,20 * * *',
  payment: '40 0,4,8,12,16,20 * * *',
  employee: '50 0,4,8,12,16,20 * * *',
  receivable: '0 1,5,9,13,17,21 * * *',
  hospital: '10 1,5,9,13,17,21 * * *',
  partida: '20 1,5,9,13,17,21 * * *',
  service: '30 1,5,9,13,17,21 * * *',
  serviceType: '40 1,5,9,13,17,21 * * *',
  servicePackage: '50 1,5,9,13,17,21 * * *',
  serialNumber: '0 2,6,10,14,18,22 * * *',
  medico: '10 2,6,10,14,18,22 * * *',
  medicoColombia: '20 2,6,10,14,18,22 * * *',
  vendor: '30 2,6,10,14,18,22 * * *',
  vendorTransaction: '40 2,6,10,14,18,22 * * *',
  vendorBillPayment: '50 2,6,10,14,18,22 * * *',
  peServicio: '55 2,6,10,14,18,22 * * *',
  otrosContrato: '0 3,7,11,15,19,23 * * *',
  fcellsContrato: '5 3,7,11,15,19,23 * * *',
  customerAddress: '10 3,7,11,15,19,23 * * *',
  // Zammad tickets aren't a NetSuite entity and don't share this batch's 4-hour cadence - a
  // helpdesk ticket's state is live, support-facing data, so it syncs every 15 minutes per
  // explicit instruction, independent of the ERP batches above.
  zammadTicket: '*/15 * * * *',
  // NetSuite's native payment-to-invoice application links (nexttransactionlink) - a cheap,
  // low-churn relationship once a payment settles, so it doesn't need this batch's cadence either;
  // every 30 minutes keeps cobranzaCommissionsRepository.ts's "was this invoice paid" check
  // reasonably fresh without adding real NetSuite API load.
  paymentInvoiceLink: '*/30 * * * *',
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
    OTROS_CONTRATO: mergeEntityConfig('otrosContrato', raw?.OTROS_CONTRATO),
    PE_SERVICIO: mergeEntityConfig('peServicio', raw?.PE_SERVICIO),
    FCELLS_CONTRATO: mergeEntityConfig('fcellsContrato', raw?.FCELLS_CONTRATO),
    CUSTOMER_ADDRESS: mergeEntityConfig('customerAddress', raw?.CUSTOMER_ADDRESS),
    ZAMMAD_TICKET: mergeEntityConfig('zammadTicket', raw?.ZAMMAD_TICKET),
    PAYMENT_INVOICE_LINK: mergeEntityConfig('paymentInvoiceLink', raw?.PAYMENT_INVOICE_LINK),
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

export interface HrDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Reads HR_DB from config/env.json (host/port/database are non-secret defaults from
 * config.json; user/password are the gitignored secret overlay) - the Peopleforce/Sesame HR
 * data warehouse (DwhCryoholdcoLatam_Prod), queried read-only for the HR Report page. Confirmed
 * on the same SQL Server instance as LEGACY_DB, using the same login (which already has SELECT
 * on this database) - kept as its own config block anyway, matching the one-block-per-database
 * convention, so a future least-privilege login swap only touches config/env.json.
 * Lazily read (not part of loadConfig/getConfig) since only the reporting API's HR routes need it.
 */
export function getHrDbConfig(): HrDbConfig {
  const raw = legacyConfig.env && legacyConfig.env.HR_DB;
  if (!raw || !raw.HOST || !raw.DATABASE || !raw.USER || !raw.PASSWORD) {
    throw new Error('Missing HR_DB configuration (HOST/DATABASE/USER/PASSWORD) in config/env.json.');
  }

  return {
    host: raw.HOST,
    port: raw.PORT || 1433,
    database: raw.DATABASE,
    user: raw.USER,
    password: raw.PASSWORD,
  };
}

export interface ZammadConfig {
  relayUrl: string;
  relaySecret: string;
  group: string;
}

/**
 * Reads ZAMMAD from config/env.json (GROUP is a non-secret default from config.json; RELAY_URL/
 * RELAY_SECRET are the gitignored secret overlay). This API does NOT call Zammad directly - the
 * shared GoDaddy cPanel host in front of tickets.cryoholdco.com (Imunify360/CSF) rejects requests
 * from this app's Azure App Service outbound IP, confirmed live (identical request succeeds from
 * a different network, fails from the deployed app). Instead this POSTs the built ticket JSON to
 * a small PHP relay (logistica-tickets-relay/zammad-relay.php) deployed on the SAME server the
 * original submit.ticket.php already ran on - that server's IP has always been trusted - which
 * holds the actual Zammad token and forwards the request. RELAY_SECRET authenticates this app to
 * that relay; it is NOT the Zammad token itself, so a leak here can't be replayed anywhere except
 * through that one relay. GROUP is "Operaciones::Logística", confirmed against the live
 * instance's /api/v1/groups list. Lazily read (not part of loadConfig/getConfig) since only the
 * Logística ticket route needs it.
 */
export function getZammadConfig(): ZammadConfig {
  const raw = legacyConfig.env && legacyConfig.env.ZAMMAD;
  if (!raw || !raw.RELAY_URL || !raw.RELAY_SECRET || !raw.GROUP) {
    throw new Error('Missing ZAMMAD configuration (RELAY_URL/RELAY_SECRET/GROUP) in config/env.json.');
  }

  return { relayUrl: raw.RELAY_URL, relaySecret: raw.RELAY_SECRET, group: raw.GROUP };
}

export * from './types';
