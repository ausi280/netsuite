exports.up = async function (knex) {

  const dialect = knex.client.config.client;

  if (dialect === 'mssql') {
    // Check existing columns to ensure migration is idempotent for SQL Server
    const columns = await knex.raw("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('app_payments')");
    const columnNames = columns.map(c => c.name);

    await knex.schema.alterTable('app_payments', (table) => {
      if (!columnNames.includes('authorization_code')) {
        table.integer('authorization_code').nullable();
      }
      if (!columnNames.includes('payloadSummary')) {
        table.json('payloadSummary').nullable();
      }
      if (!columnNames.includes('payloadResponse')) {
        table.json('payloadResponse').nullable();
      }
    });
    
    // Only rename if 'payload' exists and hasn't been renamed to 'payloadRequest' yet
    if (columnNames.includes('payload') && !columnNames.includes('payloadRequest')) {
      await knex.raw(`
        EXEC sp_rename 'app_payments.payload', 'payloadRequest', 'COLUMN';
      `);
    }
  } else {
    // MySQL and PostgreSQL
    const hasAuth = await knex.schema.hasColumn('app_payments', 'authorization_code');
    const hasSummary = await knex.schema.hasColumn('app_payments', 'payloadSummary');
    const hasRequest = await knex.schema.hasColumn('app_payments', 'payloadRequest');
    const hasResponse = await knex.schema.hasColumn('app_payments', 'payloadResponse');

    await knex.schema.alterTable('app_payments', (table) => {
      // Fix: Maintain payment_id as string to prevent overflow with Mercado Pago IDs
      table.string('payment_id', 255).alter();

      if (!hasAuth) {
        table.integer('authorization_code').after('external_reference');
      }
      if (!hasSummary) {
        table.json('payloadSummary').after('status_detail');
      }
      if (!hasRequest) {
        table.renameColumn('payload', 'payloadRequest');
      }
      if (!hasResponse) {
        // The previous column was renamed to payloadRequest
        table.json('payloadResponse').after('payloadRequest');
      }
    });
  }
};

exports.down = async function(knex) {

  const hasAuth = await knex.schema.hasColumn('app_payments', 'authorization_code');
  const hasSummary = await knex.schema.hasColumn('app_payments', 'payloadSummary');
  const hasRequest = await knex.schema.hasColumn('app_payments', 'payloadRequest');
  const hasResponse = await knex.schema.hasColumn('app_payments', 'payloadResponse');

  await knex.schema.alterTable('app_payments', (table) => {
    table.string('payment_id').alter();
    if (hasAuth) table.dropColumn('authorization_code');
    if (hasSummary) table.dropColumn('payloadSummary');
    if (hasResponse) table.dropColumn('payloadResponse');
    if (hasRequest) table.renameColumn('payloadRequest', 'payload');
  });
};
