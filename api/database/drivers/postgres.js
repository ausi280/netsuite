const env = require('../../config').env;
const knexLib = require('knex');

const nodeEnv = process.env.NODE_ENV || 'development';

let instance = null;
const getKnex = () => {
  if (!instance)
    instance = knexLib({
      client: env.DB[nodeEnv].CLIENT,
      connection: {
        host: env.DB[nodeEnv].HOST,
        port: env.DB[nodeEnv].PORT || 5432,
        user: env.DB[nodeEnv].USER,
        password: env.DB[nodeEnv].PASSWORD,
        database: env.DB[nodeEnv].DATABASE
      },
      pool: { min: 0, max: 10 }
    });

  return instance;
};

const query = getKnex();

const all = async (table, filters = {}) => {
  const db = getKnex();
  return await db(table).where(filters).select('*');
};

const one = async (table, filters = {}) => {
  const db = getKnex();
  const row = await db(table).where(filters).first();
  return row || null;
};

const insert = async (table, data) => {
  const db = getKnex();
  const res = await db(table).insert(data).returning('*');
  return typeof res[0] === 'object' ? res[0] : { id: res[0], ...data };
};

const update = async (table, filters, data) => {
  const db = getKnex();
  const affectedRows = await db(table).where(filters).update(data);
  return { affectedRows };
};

const remove = async (table, filters) => {
  const db = getKnex();
  const affectedRows = await db(table).where(filters).delete();
  return { affectedRows };
};

const raw = async (sql, params = []) => {
  const db = getKnex();
  const res = await db.raw(sql, params);
  return res.rows;
};

module.exports = {
  query,
  all,
  one,
  insert,
  update,
  remove,
  raw,
  getKnex
};