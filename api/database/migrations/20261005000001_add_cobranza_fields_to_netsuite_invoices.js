// Needed for the cobranza commissions report - confirmed live against production NetSuite
// (account 9358923, not sandbox): custbody_cryo_numcontrato links an invoice back to its Contract
// (customrecord1184), custbody_cryo_cobrador is the collector employee assigned directly on the
// invoice, and custbody_cryo_fecha_emision is its issuance date - all plain scalar custom body
// fields on the Invoice transaction, directly selectable via SuiteQL.
exports.up = function (knex) {
  return knex.schema.alterTable('netsuite_invoices', function (table) {
    table.string('custbody_cryo_numcontrato').nullable().index(); // NetSuite Contract internal id
    table.string('custbody_cryo_cobrador').nullable().index(); // NetSuite employee internal id
    table.datetime('custbody_cryo_fecha_emision').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('netsuite_invoices', function (table) {
    table.dropColumn('custbody_cryo_numcontrato');
    table.dropColumn('custbody_cryo_cobrador');
    table.dropColumn('custbody_cryo_fecha_emision');
  });
};
