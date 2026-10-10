// Needed for the cobranza commissions report: dueño must be read from the INVOICE's own
// custbody_cryo_duenio (confirmed live on production NetSuite, account 9358923), not the parent
// Contract's custrecord_cryo_duenio - confirmed live that 1,688 of 15,286 invoices (~11%) have a
// dueño that diverges from their contract's CURRENT dueño (the contract's dueño was reassigned
// after the invoice was issued), which was silently misattributing those invoices' collections to
// the wrong (current, not historical) dueño.
exports.up = function (knex) {
  return knex.schema.alterTable('netsuite_invoices', function (table) {
    table.string('custbody_cryo_duenio').nullable().index();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('netsuite_invoices', function (table) {
    table.dropColumn('custbody_cryo_duenio');
  });
};
