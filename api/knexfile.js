const env = require('./config').env;
const mode = process.env.NODE_ENV || 'development';

if (!env.DB[mode])
  throw new Error(`Modo de ambiente no válido: ${mode}`);

const config = {
  client: env.DB[mode].CLIENT,
  connection: {
    host: env.DB[mode].HOST,
    port: env.DB[mode].PORT,
    database: env.DB[mode].DATABASE,
    user: env.DB[mode].USER,
    password: env.DB[mode].PASSWORD
  },
  migrations: {
    directory: './database/migrations'
  },
  seeds: {
    directory: `./database/seeds/${mode}`
  }
};

module.exports = {
  ...config,
  [mode]: config,
  production: config,
  development: config
};
