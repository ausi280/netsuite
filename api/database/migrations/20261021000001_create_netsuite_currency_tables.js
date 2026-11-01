exports.up = async function(knex) {
  // Current rate per currency (NetSuite `currency` table), overwritten every sync run.
  await knex.schema.createTable('netsuite_currencies', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('symbol').nullable().index();
    table.boolean('isbasecurrency').nullable();
    table.boolean('isinactive').nullable();
    table.decimal('exchangerate', 30, 15).nullable(); // units of the base currency (MXN) per 1 unit of this currency
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });

  // One snapshot per currency per day (America/Mexico_City). SuiteQL only exposes the current
  // rate, so this is how rate history accumulates - same-day runs just overwrite that day's row.
  await knex.schema.createTable('netsuite_currency_rates', function(table) {
    table.increments('id').primary();
    table.string('currency_netsuite_id').notNullable();
    table.string('symbol').nullable();
    table.date('rate_date').notNullable().index();
    table.decimal('exchangerate', 30, 15).nullable();
    table.timestamps(true, true);
    table.unique(['currency_netsuite_id', 'rate_date']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('netsuite_currency_rates');
  await knex.schema.dropTableIfExists('netsuite_currencies');
};
