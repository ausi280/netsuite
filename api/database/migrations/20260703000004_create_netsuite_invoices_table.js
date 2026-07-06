exports.up = function(knex) {
  return knex.schema.createTable('netsuite_invoices', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('tranid').nullable();
    table.string('entity_id').nullable().index(); // NetSuite customer internal id
    table.datetime('trandate').nullable();
    table.datetime('duedate').nullable();
    table.string('status').nullable();
    table.string('currency').nullable();
    table.decimal('total', 18, 2).nullable();
    table.decimal('amountremaining', 18, 2).nullable();
    table.datetime('lastmodifieddate').nullable().index();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_invoices');
};
