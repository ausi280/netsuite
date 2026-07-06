import type { Knex } from 'knex';

// Reuses the existing singleton Knex pool created by api/database (see
// api/database/drivers/sqlserver.js) — requiring it here shares Node's
// require cache with the legacy JS code, so no second connection pool
// is ever created.
const knex: Knex = require('../../database');

export default knex;
export type { Knex };
