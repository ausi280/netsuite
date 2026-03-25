const env = require('../config').env;
const fs = require('fs');
const path = require('path');

const nodeEnv = process.env.NODE_ENV || 'development';
console.log(`[Database] Initializing for environment: ${nodeEnv}`);

const drivers = {};
const driversPath = path.join(__dirname, 'drivers');

fs.readdirSync(driversPath).forEach(file => {
    if (file.endsWith('.js')) {
        
        const name = file.replace('.js', '');
        drivers[name] = path.join(driversPath, file);

    }
});

const config = env.DB[nodeEnv];
console.log(`[Database] Config for ${nodeEnv}:`, JSON.stringify(config, (k, v) => k === 'PASSWORD' ? '***' : v, 2));

if (!config) {
    throw new Error(`Database configuration for environment '${nodeEnv}' is missing. Please check your config/env.json.`);
}

let driverKey = config && config.DRIVER;

if (!driverKey && config && config.CLIENT) {
    if (config.CLIENT === 'mssql') driverKey = 'sqlserver';
    else if (config.CLIENT === 'pg') driverKey = 'postgres';
    else if (config.CLIENT === 'mysql' || config.CLIENT === 'mysql2') driverKey = 'mysql';
    else driverKey = config.CLIENT;
}

console.log(`[Database] Resolved driver key: '${driverKey}'`);
const driver = drivers[driverKey];

if (!driver) throw new Error(`Database driver not found. Key: ${driverKey}, Env: ${nodeEnv}, Available: ${Object.keys(drivers).join(', ')}`);

const driverModule = require(driver);
const db = driverModule.getKnex();

module.exports = db;
