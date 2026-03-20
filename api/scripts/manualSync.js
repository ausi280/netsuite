// This is a temporary script to manually trigger the NetSuite data synchronization.
const netsuiteService = require('../src/services/netsuiteService');
const db = require('../database');

async function runSync() {
  console.log('Starting manual NetSuite data synchronization...');
  try {
    const count = await netsuiteService.syncAndSaveData();
    console.log(`Manual NetSuite data sync completed successfully. Synced ${count} records.`);
  } catch (error) {
    console.error('Error during manual NetSuite data sync:', error);
  } finally {
    // Ensure the database connection is closed
    if (db && db.getKnex) {
      await db.getKnex().destroy();
    }
  }
}

runSync();
