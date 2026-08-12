exports.up = async function(knex) {

  const dialect = knex.client.config.client;
  let existingColumns = [];

  if (dialect === 'mssql') {
    // Query SQL Server system catalogs to check which columns already exist
    const columns = await knex.raw("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('app_payments')");
    existingColumns = columns.map(c => c.name);
  } else {
    // Fallback for other dialects using Knex built-ins
    if (await knex.schema.hasColumn('app_payments', 'payloadErp')) existingColumns.push('payloadErp');
    if (await knex.schema.hasColumn('app_payments', 'erp_internal_id')) existingColumns.push('erp_internal_id');
  }

  await knex.schema.alterTable('app_payments', (table) => {
    if (!existingColumns.includes('payloadErp')) {
      if (dialect === 'mssql') {
        table.json('payloadErp').nullable();
      } else {
        table.json('payloadErp').nullable().after('payloadResponse');
      }
    }

    if (!existingColumns.includes('erp_internal_id')) {
      if (dialect === 'mssql') {
        table.integer('erp_internal_id').nullable();
      } else {
        table.integer('erp_internal_id').nullable().after('status_detail');
      }
    }
  });
};

exports.down = async function(knex) {

  const hasPayload = await knex.schema.hasColumn('app_payments', 'payloadErp');
  const hasErpId = await knex.schema.hasColumn('app_payments', 'erp_internal_id');

  await knex.schema.alterTable('app_payments', (table) => {
    if (hasErpId) table.dropColumn('erp_internal_id');
    if (hasPayload) table.dropColumn('payloadErp');
  });
};
