exports.up = async function (knex) {

  const dialect = knex.client.config.client;

  if (dialect === 'mssql') {
    // Robust existence check for SQL Server to prevent "object already exists" errors
    const check = await knex.raw("SELECT OBJECT_ID('app_payments') AS id");
    if (check && check[0] && check[0].id) return;
  } else {
    if (await knex.schema.hasTable('app_payments')) return;
  }

  await knex.schema.createTable('app_payments', table => {
    
        table.increments('id').primary();
        table.string('payment_id').unique().index();
        table.string('external_reference').index();
        table.string('issuer_id').nullable();
        table.string('payment_method_id').index();
        table.decimal('transaction_amount', 15, 2);
        table.string('payer_email').index();
        table.integer('installments').defaultTo(1);
        table.string('description');
        table.string('status');
        table.string('status_detail');
        table.json('payload');
        table.timestamps(true, true);
      });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('app_payments');
};
