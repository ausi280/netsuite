import Bottleneck from 'bottleneck';
import { getConfig, AppConfig } from './config';
import { createLogger } from './logger';
import db from './db/connection';
import { NetSuiteHttpClient } from './http/netsuiteHttpClient';
import { createRateLimiter } from './http/rateLimiter';
import { SyncStateRepository } from './repositories/syncStateRepository';
import { RawStoreRepository } from './repositories/rawStoreRepository';
import { CustomerRepository } from './repositories/customerRepository';
import { ContractRepository } from './repositories/contractRepository';
import { InvoiceRepository } from './repositories/invoiceRepository';
import { PaymentRepository } from './repositories/paymentRepository';
import { EmployeeRepository } from './repositories/employeeRepository';
import { ReceivableRepository } from './repositories/receivableRepository';
import { CustomerSyncService } from './services/customerSyncService';
import { ContractSyncService } from './services/contractSyncService';
import { InvoiceSyncService } from './services/invoiceSyncService';
import { PaymentSyncService } from './services/paymentSyncService';
import { EmployeeSyncService } from './services/employeeSyncService';
import { ReceivableSyncService } from './services/receivableSyncService';
import { SyncOrchestrator } from './orchestrator/syncOrchestrator';
import type { EntitySyncService } from './services/types';

export interface Bootstrapped {
  orchestrator: SyncOrchestrator;
  config: AppConfig;
}

let cached: Bootstrapped | null = null;

/** Composition root: config -> logger -> http -> repositories -> services -> orchestrator. Memoized. */
export function bootstrap(): Bootstrapped {
  if (cached) return cached;

  const config = getConfig();
  const rateLimiter = createRateLimiter(config.erp.SYNC.RATE_LIMIT);
  const http = new NetSuiteHttpClient(config.erp, rateLimiter, createLogger('http'));

  const syncState = new SyncStateRepository(db);
  const rawStore = new RawStoreRepository(db);
  const overlapMinutes = config.erp.SYNC.OVERLAP_BUFFER_MINUTES;

  const services: EntitySyncService[] = [
    new CustomerSyncService(db, http, syncState, rawStore, new CustomerRepository(db), overlapMinutes),
    new ContractSyncService(db, http, syncState, rawStore, new ContractRepository(db), overlapMinutes),
    new InvoiceSyncService(db, http, syncState, rawStore, new InvoiceRepository(db), overlapMinutes),
    new PaymentSyncService(db, http, syncState, rawStore, new PaymentRepository(db), overlapMinutes),
    new EmployeeSyncService(db, http, syncState, rawStore, new EmployeeRepository(db), overlapMinutes),
    new ReceivableSyncService(db, http, syncState, rawStore, new ReceivableRepository(db)),
  ];

  const entityLimiter = new Bottleneck({ maxConcurrent: config.erp.SYNC.MAX_CONCURRENT_ENTITIES });
  const orchestrator = new SyncOrchestrator(services, entityLimiter);

  cached = { orchestrator, config };
  return cached;
}
