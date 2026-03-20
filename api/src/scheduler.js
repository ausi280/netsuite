const cron = require('node-cron');
const netsuiteService = require('./services/netsuiteService');

const scheduleNetsuiteSync = () => {
  // Schedule to run every night at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('Running nightly NetSuite data sync...');
    try {
      const count = await netsuiteService.syncAndSaveData();
      console.log(`Nightly NetSuite data sync completed successfully. Synced ${count} records.`);
    } catch (error) {
      console.error('Error during nightly NetSuite data sync:', error);
    }
  }, {
    scheduled: true,
    timezone: "America/Mexico_City" // Example timezone, you might want to configure this
  });
};

module.exports = { scheduleNetsuiteSync };
