exports.up = async function (knex) {

  const dialect = knex.client.config.client;
  let columnNames = [];
  let indexNames = [];

  if (dialect === 'mssql') {
    // Get existing columns and indexes for SQL Server
    const columns = await knex.raw("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('app_payments')");
    columnNames = columns.map(c => c.name);
    const indexes = await knex.raw("SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID('app_payments')");
    indexNames = indexes.map(i => i.name);
  } else {
    // Fallback for other dialects
    if (await knex.schema.hasColumn('app_payments', 'external_reference')) columnNames.push('external_reference');
    if (await knex.schema.hasColumn('app_payments', 'reference')) columnNames.push('reference');
  }

  const hasOld = columnNames.includes('external_reference');
  const hasNew = columnNames.includes('reference');

  // Only attempt rename if old column exists and new one does not
  if (hasOld && !hasNew) {
    await knex.schema.alterTable('app_payments', (table) => {
      // Drop old index if it exists
      if (dialect !== 'mssql' || indexNames.includes('app_payments_external_reference_index')) {
        table.dropIndex('external_reference', 'app_payments_external_reference_index');
      }
      table.renameColumn('external_reference', 'reference');
    });

    // Create new index in a separate step
    await knex.schema.alterTable('app_payments', (table) => {
      table.index('reference', 'app_payments_reference_index');
    });
  }
};

exports.down = async function(knex) {
  const dialect = knex.client.config.client;
  const hasOld = await knex.schema.hasColumn('app_payments', 'external_reference');
  const hasNew = await knex.schema.hasColumn('app_payments', 'reference');

  if (hasNew && !hasOld) {
    await knex.schema.alterTable('app_payments', (table) => {
      let indexExists = true;
      if (dialect === 'mssql') {
        // We don't have indexNames here, but dropIndex handles it poorly if column is about to change
        // table.dropIndex handles the SQL generation
      }
      
      try {
        table.dropIndex('reference', 'app_payments_reference_index');
      } catch (e) { /* ignore */ }
      
      table.renameColumn('reference', 'external_reference');
    });

    await knex.schema.alterTable('app_payments', (table) => {
      table.index('external_reference', 'app_payments_external_reference_index');
    });
  }
};

exports.down = async function(knex) {
    
  await knex.schema.alterTable('app_payments', (table) => {
    table.renameColumn('reference', 'external_reference');
    table.dropIndex('reference', 'app_payments_reference_index');
    table.index('external_reference', 'app_payments_external_reference_index');
  });

};
