import type { Knex } from 'knex';

/**
 * Shared upsert branch used by every repository: mssql (via knex) doesn't
 * support `.onConflict().merge()`, so it falls back to a manual
 * select-then-insert/update loop inside the caller's transaction, exactly
 * matching the pattern already used by the legacy JS sync code
 * (netsuiteService.js:134-148, 232-242). Other dialects use native upsert.
 */
export async function upsertRows<T extends Record<string, any>>(
  db: Knex,
  trx: Knex.Transaction,
  table: string,
  rows: T[],
  conflictKeys: string | string[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const keys = Array.isArray(conflictKeys) ? conflictKeys : [conflictKeys];
  const dialect = db.client.config.client;

  if (dialect === 'mssql') {
    for (const row of rows) {
      const match: Record<string, any> = {};
      for (const key of keys) match[key] = row[key];

      const existing = await trx(table).where(match).first();
      if (existing) {
        await trx(table).where(match).update(row);
      } else {
        await trx(table).insert(row);
      }
    }
  } else {
    await trx(table).insert(rows).onConflict(keys).merge();
  }

  return rows.length;
}
