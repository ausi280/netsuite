import { bootstrap } from '../bootstrap';
import { createLogger } from '../logger';
import db from '../db/connection';
import type { SyncEntityName } from '../config/types';

const VALID_ENTITIES: SyncEntityName[] = ['customer', 'contract', 'familyMember', 'service', 'invoice', 'payment', 'employee', 'receivable'];

/**
 * `node dist-ts/cli/runSync.js <entity|all> [--dry-run]`
 * Separate from the legacy `api/scripts/manualSync.js`, which keeps
 * triggering the old full-sync path unmodified.
 */
async function main(): Promise<void> {
  const [, , target, ...rest] = process.argv;
  const dryRun = rest.includes('--dry-run');
  const logger = createLogger('cli');

  if (!target) {
    logger.error(`Usage: node dist-ts/cli/runSync.js <${VALID_ENTITIES.join('|')}|all> [--dry-run]`);
    process.exitCode = 1;
    return;
  }

  const { orchestrator } = bootstrap();
  const targets: SyncEntityName[] = target === 'all' ? VALID_ENTITIES : [target as SyncEntityName];

  for (const entity of targets) {
    if (!VALID_ENTITIES.includes(entity)) {
      logger.error(`Unknown entity '${entity}'. Valid: ${VALID_ENTITIES.join(', ')}`);
      process.exitCode = 1;
      continue;
    }

    const result = await orchestrator.runEntity(entity, { dryRun });
    logger.info({ result }, `Finished '${entity}'`);
  }
}

main()
  .catch((error) => {
    console.error('CLI sync failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
