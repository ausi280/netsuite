exports.up = function(knex) {
  return knex.schema.createTable('netsuite_payments', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('tranid').nullable();
    table.string('customer_id').nullable().index(); // NetSuite customer internal id
    table.datetime('trandate').nullable();
    table.decimal('amount', 18, 2).nullable();
    table.string('status').nullable();
    table.string('currency').nullable();
    table.datetime('lastmodifieddate').nullable().index();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_payments');
};
