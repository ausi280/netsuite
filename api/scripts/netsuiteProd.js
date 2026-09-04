/**
 * Loads config/env.production.json (gitignored, not the sandbox config/env.json) into the
 * NETSUITE_* env var overrides api/config/index.js already reads, then returns the same
 * netsuiteService singleton pointed at NetSuite production instead of sandbox.
 *
 * For one-off investigative SuiteQL/RESTlet calls against real production data only - never
 * required by the app's normal runtime, which has its own separate env.json on the actual
 * deployed Azure server for real production syncing.
 *
 * Usage: node -e "require('./scripts/netsuiteProd').runSuiteQL('...').then(r => console.log(r))"
 */
const fs = require('fs');
const path = require('path');

const prodConfigPath = path.join(__dirname, '..', 'config', 'env.production.json');
if (!fs.existsSync(prodConfigPath)) {
  throw new Error(
    `Missing ${prodConfigPath} - this file is gitignored and holds production NetSuite credentials; ask the user for them if it's not present locally.`,
  );
}

const prodConfig = JSON.parse(fs.readFileSync(prodConfigPath, 'utf8'));
const erp = prodConfig.SERVICES && prodConfig.SERVICES.ERP;
if (!erp) {
  throw new Error(`${prodConfigPath} is missing a SERVICES.ERP block.`);
}

process.env.NETSUITE_URL = erp.URL;
process.env.NETSUITE_CONSUMER_KEY = erp.CONSUMER_KEY;
process.env.NETSUITE_CONSUMER_SECRET = erp.CONSUMER_SECRET;
process.env.NETSUITE_ACCESS_TOKEN = erp.ACCESS_TOKEN;
process.env.NETSUITE_TOKEN_SECRET = erp.TOKEN_SECRET;
process.env.NETSUITE_REALM = erp.REALM;

// api/config/index.js (required transitively by netsuiteService) applies these env vars as
// overrides on top of config.json/env.json at its own module-load time, so they must be set
// before netsuiteService is first required anywhere in the process.
module.exports = require('../src/services/netsuiteService');
