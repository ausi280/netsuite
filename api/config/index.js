const fs = require('fs');
const path = require('path');

const config = {};
const dir = __dirname;

fs.readdirSync(dir).forEach(file => {
  if (path.extname(file) === '.json') {
    const key = path.basename(file, '.json');
    const filePath = path.join(dir, file);

    config[key] = require(filePath);
  }
});

module.exports = { 
  env: require('./env.json'), 
  tenants: require('./tenants.json')
};
