import type * as NodeCron from 'node-cron';
import { bootstrap } from '../bootstrap';
import { createLogger } from '../logger';
import type { SyncEntityName, ErpSyncConfig, EntitySyncConfig } from '../config/types';

const ENTITY_CONFIG_KEY: Record<SyncEntityName, keyof ErpSyncConfig> = {
  customer: 'CUSTOMER',
  contract: 'CONTRACT',
  invoice: 'INVOICE',
  payment: 'PAYMENT',
  employee: 'EMPLOYEE',
  receivable: 'RECEIVABLE',
};

/**
 * Registers one cron job per enabled entity, guarded by an in-process
 * overlap lock (belt-and-suspenders with the DB-level lock in
 * SyncStateRepository.tryStartRun). Called additively from the existing
 * api/src/scheduler.js — never replaces it.
 */
export function registerNetsuiteTsJobs(cronLib: typeof NodeCron): void {
  const { orchestrator, config } = bootstrap();
  const logger = createLogger('scheduler');
  const inFlight = new Set<SyncEntityName>();

  for (const entity of orchestrator.entities()) {
    const entityConfig = config.erp.SYNC[ENTITY_CONFIG_KEY[entity]] as EntitySyncConfig;

    if (!entityConfig.ENABLED) {
      logger.info(`Entity '${entity}' sync disabled, skipping cron registration`);
      continue;
    }

    cronLib.schedule(
      entityConfig.CRON,
      async () => {
        if (inFlight.has(entity)) {
          logger.warn(`[${entity}] previous run still in progress, skipping`);
          return;
        }
        inFlight.add(entity);
        try {
          await orchestrator.runEntity(entity);
        } catch (error: any) {
          logger.error({ error: error?.message ?? String(error) }, `[${entity}] sync failed`);
        } finally {
          inFlight.delete(entity);
        }
      },
      { timezone: 'America/Mexico_City' },
    );

    logger.info(`Registered cron for '${entity}': ${entityConfig.CRON}`);
  }
}
