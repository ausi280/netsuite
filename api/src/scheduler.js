const cron = require('node-cron');
const netsuiteService = require('./services/netsuiteService');
const { syncGoogleLeads, syncRenewLeads, syncFcellsLeads } = require('./controllers/googleSheetsController');

const scheduleNetsuiteSync = () => {
  console.log('Scheduler initialized: Google Sheets sync active every 5 minutes.');

  // New TypeScript NetSuite sync module (api/src-ts), compiled to dist-ts.
  // Additive and non-fatal: if it hasn't been built yet, or fails to load,
  // the rest of the app (including this scheduler) keeps working.
  try {
    const { registerNetsuiteTsJobs } = require('../dist-ts/scheduler/registerJobs');
    registerNetsuiteTsJobs(cron);
    console.log('NetSuite TS sync jobs registered.');
  } catch (error) {
    console.error('[TS sync] failed to load, skipping:', error.message);
  }

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

  //Schedule Google Sheets Lead Sync every 20 minutes
  cron.schedule('*/20 * * * *', async () => {
    console.log(`[${new Date().toISOString()}] Starting scheduled Google Sheets sync...`);
    try {
      const report = await syncGoogleLeads();
      console.log(`[${new Date().toISOString()}] Scheduled sync finished. Total leads: ${report.totalProcessedCount}`);
    } catch (error) {
      console.error('[SCHEDULER ERROR] Google Sheets sync failed:', error.message);
    }
  });

  // Meta lead sheets (Renew, Fcells prospectos) -> NetSuite, every 20 minutes (offset 10 min from
  // the CryoCell sheet sync above so they don't hit the Sheets API at the same time). Run one after
  // the other so a failure in one sheet never blocks the other.
  const metaLeadSyncs = [
    ['RENEW', syncRenewLeads],
    ['FCELLS', syncFcellsLeads],
  ];
  let metaLeadSyncRunning = false;
  cron.schedule('10,30,50 * * * *', async () => {
    if (metaLeadSyncRunning) {
      console.warn('[META LEAD SYNC] previous run still in progress, skipping');
      return;
    }
    metaLeadSyncRunning = true;
    try {
      for (const [label, sync] of metaLeadSyncs) {
        try {
          const report = await sync();
          console.log(`[${new Date().toISOString()}] ${label} sheet sync finished. Total leads: ${report.totalProcessedCount}`);
        } catch (error) {
          console.error(`[SCHEDULER ERROR] ${label} sheet sync failed:`, error.message);
        }
      }
    } finally {
      metaLeadSyncRunning = false;
    }
  });
};

module.exports = { scheduleNetsuiteSync };
