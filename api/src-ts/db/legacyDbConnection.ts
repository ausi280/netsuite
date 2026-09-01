import knexLib from 'knex';
import type { Knex } from 'knex';
import { getLegacyDbConfig } from '../config';

// Separate pool from the main app's knex (api/src-ts/db/connection.ts) - this points at the old
// pre-NetSuite CryoCell SQL Server database, a different server/database than the main app's.
// Built lazily (not at module load) so importing this file doesn't throw before LEGACY_DB is
// configured; only the first real query pays that cost.
let instance: Knex | null = null;

export function getLegacyDb(): Knex {
  if (!instance) {
    const config = getLegacyDbConfig();
    instance = knexLib({
      client: 'mssql',
      connection: {
        server: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        options: {
          trustServerCertificate: true,
          encrypt: false,
        },
      },
      pool: { min: 0, max: 5 },
    });
  }
  return instance;
}
