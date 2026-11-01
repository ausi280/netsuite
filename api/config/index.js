function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }
  if (base && override && typeof base === 'object' && typeof override === 'object') {
    const merged = { ...base };
    for (const key of Object.keys(override)) {
      merged[key] = deepMerge(base[key], override[key]);
    }
    return merged;
  }
  return override !== undefined ? override : base;
}

// config.json holds non-secret defaults (tracked in git); env.json holds
// secrets (gitignored) and is merged on top of it, per leaf.
const fs = require('fs');
const path = require('path');

// env.production.json (gitignored) holds the PRODUCTION NetSuite credentials and is always layered
// on top when present, regardless of NODE_ENV - NetSuite must always be prod; env.json's ERP block
// points at the sandbox (9358923_SB1). Optional so servers that configure NetSuite purely through
// the NETSUITE_* env vars below keep working without the file.
const PROD_OVERLAY_PATH = path.join(__dirname, 'env.production.json');
const prodOverlay = fs.existsSync(PROD_OVERLAY_PATH) ? require(PROD_OVERLAY_PATH) : {};

const env = deepMerge(deepMerge(require('./config.json'), require('./env.json')), prodOverlay);

const ERP_ENV_OVERRIDES = {
  URL: process.env.NETSUITE_URL,
  CONSUMER_KEY: process.env.NETSUITE_CONSUMER_KEY,
  CONSUMER_SECRET: process.env.NETSUITE_CONSUMER_SECRET,
  ACCESS_TOKEN: process.env.NETSUITE_ACCESS_TOKEN,
  TOKEN_SECRET: process.env.NETSUITE_TOKEN_SECRET,
  REALM: process.env.NETSUITE_REALM,
};

for (const [key, value] of Object.entries(ERP_ENV_OVERRIDES)) {
  if (value) {
    env.SERVICES.ERP[key] = value;
  }
}

// Same idea for Zammad direct mode (see getZammadDirectConfig) - lets the API token live in the
// App Service settings instead of the server's env.json.
const ZAMMAD_ENV_OVERRIDES = {
  MODE: process.env.ZAMMAD_MODE,
  URL: process.env.ZAMMAD_URL,
  TOKEN: process.env.ZAMMAD_TOKEN,
};

for (const [key, value] of Object.entries(ZAMMAD_ENV_OVERRIDES)) {
  if (value) {
    env.ZAMMAD = env.ZAMMAD || {};
    env.ZAMMAD[key] = value;
  }
}

module.exports = {
  env,
  tenants: require('./tenants.json')
};
