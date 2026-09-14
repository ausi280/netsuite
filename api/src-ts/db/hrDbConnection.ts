import knexLib from 'knex';
import type { Knex } from 'knex';
import { getHrDbConfig } from '../config';

// Separate pool from the main app's knex (api/src-ts/db/connection.ts) - this points at the
// Peopleforce/Sesame HR data warehouse (DwhCryoholdcoLatam_Prod), a different database than the
// main app's (confirmed on the same SQL Server instance as LEGACY_DB, reusing that same login).
// Built lazily (not at module load) so importing this file doesn't throw before HR_DB is
// configured; only the first real query pays that cost.
let instance: Knex | null = null;

export function getHrDb(): Knex {
  if (!instance) {
    const config = getHrDbConfig();
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
