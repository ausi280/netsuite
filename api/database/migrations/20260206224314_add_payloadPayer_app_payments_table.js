exports.up = async function (knex) {

  const dialect = knex.client.config.client;

  let columnExists = false;
  if (dialect === 'mssql') {
    // Robust check for SQL Server to see if the column already exists
    const check = await knex.raw("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('app_payments') AND name = 'payloadPayer'");
    columnExists = check && check.length > 0;
  } else {
    columnExists = await knex.schema.hasColumn('app_payments', 'payloadPayer');
  }

  if (!columnExists) {
    await knex.schema.alterTable('app_payments', (table) => {
      if (dialect === 'mssql') {
        table.json('payloadPayer').nullable();
      } else {
        table.json('payloadPayer').after('status_detail');
      }
    });
  }

};

exports.down = async function(knex) {
    
  const dialect = knex.client.config.client;
  let columnExists = false;
  if (dialect === 'mssql') {
    const check = await knex.raw("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('app_payments') AND name = 'payloadPayer'");
    columnExists = check && check.length > 0;
  } else {
    columnExists = await knex.schema.hasColumn('app_payments', 'payloadPayer');
  }

  if (columnExists) {
    await knex.schema.alterTable('app_payments', (table) => {
      table.dropColumn('payloadPayer');
    });
  }

};
