exports.up = function(knex) {
  return knex.schema.createTable('netsuite_receivables', function(table) {
    table.increments('id').primary();
    table.string('invoice_netsuite_id').notNullable().unique();
    table.string('customer_netsuite_id').nullable().index();
    table.decimal('amountremaining', 18, 2).nullable();
    table.string('currency').nullable();
    table.datetime('trandate').nullable();
    table.datetime('duedate').nullable();
    table.datetime('computed_at').notNullable().index();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_receivables');
};
