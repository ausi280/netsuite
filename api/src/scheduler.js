const cron = require('node-cron');
const netsuiteService = require('./services/netsuiteService');
const { syncGoogleLeads } = require('./controllers/googleSheetsController');

const scheduleNetsuiteSync = () => {
  console.log('Scheduler initialized: Google Sheets sync active every 5 minutes.');

  // Schedule to run every night at 1:00 AM
  /*cron.schedule('0 1 * * *', async () => {
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
  });*/

  // Schedule Google Sheets Lead Sync every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log(`[${new Date().toISOString()}] Starting scheduled Google Sheets sync...`);
    try {
      const report = await syncGoogleLeads();
      console.log(`[${new Date().toISOString()}] Scheduled sync finished. Total leads: ${report.totalProcessedCount}`);
    } catch (error) {
      console.error('[SCHEDULER ERROR] Google Sheets sync failed:', error.message);
    }
  });
};

module.exports = { scheduleNetsuiteSync };
