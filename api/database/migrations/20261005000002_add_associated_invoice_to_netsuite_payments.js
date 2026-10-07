// Needed for the cobranza commissions report - confirmed live against production NetSuite:
// custbody_cryo_associated_invoices_item is a plain scalar field (not a true multi-select sublist
// in SuiteQL) directly naming the invoice this payment is applied to - the same relationship
// NetSuite's own native "apply" sublist carries, but reachable here via one SuiteQL column instead
// of a per-record REST call per payment.
exports.up = function (knex) {
  return knex.schema.alterTable('netsuite_payments', function (table) {
    table.string('custbody_cryo_associated_invoices_item').nullable().index(); // NetSuite Invoice internal id
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('netsuite_payments', function (table) {
    table.dropColumn('custbody_cryo_associated_invoices_item');
  });
};
