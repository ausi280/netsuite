exports.up = function(knex) {
  return knex.schema.createTable('netsuite_vendor_transactions', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('tranid').nullable();
    table.string('entity_id').nullable().index();
    table.string('type').nullable();
    table.string('status').nullable();
    table.date('trandate').nullable();
    table.date('duedate').nullable();
    table.string('currency').nullable();
    table.decimal('total', 18, 2).nullable();
    table.decimal('foreigntotal', 18, 2).nullable();
    table.datetime('lastmodifieddate').nullable().index();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_vendor_transactions');
};
