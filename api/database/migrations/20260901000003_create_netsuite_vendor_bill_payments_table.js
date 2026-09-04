// Mirrors NetSuite's NextTransactionLink table (linktype='Payment'), scoped to links where the
// previous doc is a VendBill - the system-level "which payment paid this bill" relationship,
// distinct from the vendor bill/payment tranid naming conventions (which aren't reliable).
// Not append-only: refreshed in full each sync run (no natural lastmodifieddate on the source),
// so rows are pruned if a run's pass doesn't touch them (mirrors netsuite_receivables).
exports.up = function(knex) {
  return knex.schema.createTable('netsuite_vendor_bill_payments', function(table) {
    table.increments('id').primary();
    table.string('previousdoc').notNullable().index(); // VendBill netsuite_id
    table.string('nextdoc').notNullable().index(); // VendPymt netsuite_id
    table.string('linktype').nullable();
    table.datetime('computed_at').notNullable();
    table.unique(['previousdoc', 'nextdoc']);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_vendor_bill_payments');
};
