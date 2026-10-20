// Needed for the cobranza commissions report's "Bolsa Domiciliado" rule: custbody_cryo_formapago
// (list 3300) is the payment's forma de pago - confirmed live on production NetSuite that it's set
// on the PAYMENT (1,219 CustPymt with 110/111 "Tarjeta domiciliada [AMEX]" since 2026-01-01), not
// on the invoice (only 1). See cobranzaCommissionsRepository.ts.
//
// Also clears the payment sync watermark so the next run does a full pass and backfills this new
// column on every existing payment - an incremental run would only fill it on payments modified
// from now on.
exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_payments', function (table) {
    table.string('custbody_cryo_formapago').nullable().index(); // NetSuite "Forma pago" list id
  });
  await knex('netsuite_sync_state').where({ entity: 'payment' }).update({ last_watermark: null });
};

exports.down = function (knex) {
  return knex.schema.alterTable('netsuite_payments', function (table) {
    table.dropColumn('custbody_cryo_formapago');
  });
};
