import { randomUUID } from 'crypto';
import type Bottleneck from 'bottleneck';
import { createLogger } from '../logger';
import type { EntitySyncService, SyncResult } from '../services/types';
import type { SyncEntityName } from '../config/types';

/**
 * Registers all entity sync services and runs them, capping cross-entity
 * concurrency via a shared limiter so at most N entities hit NetSuite at
 * once (on top of the per-request rate limiting inside NetSuiteHttpClient).
 */
export class SyncOrchestrator {
  private readonly services = new Map<SyncEntityName, EntitySyncService>();

  constructor(services: EntitySyncService[], private readonly entityConcurrencyLimiter: Bottleneck) {
    for (const service of services) {
      this.services.set(service.entityName, service);
    }
  }

  entities(): SyncEntityName[] {
    return Array.from(this.services.keys());
  }

  async runEntity(entity: SyncEntityName, options: { dryRun?: boolean } = {}): Promise<SyncResult> {
    const service = this.services.get(entity);
    if (!service) {
      throw new Error(`No sync service registered for entity '${entity}'`);
    }

    return this.entityConcurrencyLimiter.schedule(async () => {
      const runId = randomUUID();
      const logger = createLogger(`sync:${entity}`, runId);
      const ctx = { runId, entity, startedAt: new Date(), logger, dryRun: options.dryRun };

      logger.info('Sync run starting');
      const result = await service.run(ctx);
      logger.info({ result }, 'Sync run finished');
      return result;
    });
  }

  async runAll(): Promise<SyncResult[]> {
    return Promise.all(this.entities().map((entity) => this.runEntity(entity)));
  }
}
