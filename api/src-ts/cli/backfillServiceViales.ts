import { bootstrap } from '../bootstrap';
import { createLogger } from '../logger';
import db from '../db/connection';

const CHUNK = 500;

/**
 * `node dist-ts/cli/backfillServiceViales.js [--dry-run]`
 * One-off fill of netsuite_services.custrecord_cryo_viales for services synced before our
 * integration role could read the field - the incremental service sync only revisits records whose
 * `lastmodified` moves, so those rows would otherwise stay null. Pulls only services that have a
 * value, keyset-paged by id (NetSuite's offset paging stops at 100k rows).
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const logger = createLogger('cli');
  const { http } = bootstrap();

  const query = (afterId: number) =>
    `SELECT id, custrecord_cryo_viales FROM customrecord_cryo_servicios WHERE custrecord_cryo_viales IS NOT NULL AND id > ${afterId} ORDER BY id ASC`;

  let fetched = 0;
  await http.executeSuiteQL<{ id: string; custrecord_cryo_viales: string | null }>(query(0), {
    continueBeyondOffsetCap: ({ lastPage }) => (lastPage.length ? query(Number(lastPage[lastPage.length - 1].id)) : null),
    pageCallback: async (page) => {
      fetched += page.length;
      if (dryRun) return;
      for (let i = 0; i < page.length; i += CHUNK) {
        const chunk = page.slice(i, i + CHUNK);
        const values = chunk.map(() => '(?, ?)').join(', ');
        const bindings = chunk.flatMap((r) => [String(r.id), r.custrecord_cryo_viales]);
        await db.raw(
          `UPDATE S SET S.custrecord_cryo_viales = V.viales
           FROM netsuite_services S JOIN (VALUES ${values}) AS V(netsuite_id, viales) ON V.netsuite_id = S.netsuite_id`,
          bindings,
        );
      }
      logger.info({ fetched }, 'viales backfill progress');
    },
  });

  const [{ filled }] = await db('netsuite_services').whereNotNull('custrecord_cryo_viales').count('* as filled');
  logger.info({ fetched, filledInDb: Number(filled), dryRun }, 'viales backfill finished');
}

main()
  .catch((error) => {
    console.error('viales backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
