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
const env = deepMerge(require('./config.json'), require('./env.json'));

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

module.exports = {
  env,
  tenants: require('./tenants.json')
};
