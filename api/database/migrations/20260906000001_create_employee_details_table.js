// General-purpose "additional info about an employee" table, keyed by their NetSuite id -
// deliberately NOT a column on netsuite_employees (that table is fully overwritten by the
// employee sync's upsert, so anything stored there would be indistinguishable from synced
// NetSuite data and could be silently clobbered by a future sync/schema change) and deliberately
// NOT named after commissions specifically, since more app-owned employee fields will land here
// over time. `nivel` (commission level A/B/C/...) is only the first one.
exports.up = function(knex) {
  return knex.schema.createTable('employee_details', function(table) {
    table.increments('id').primary();
    table.string('employee_netsuite_id').notNullable().unique();
    table.string('nivel').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('employee_details');
};
