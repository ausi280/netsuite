// NetSuite's own native payment-to-invoice application relationship (nexttransactionlink,
// linktype='Payment') - confirmed live this is MORE reliable than
// netsuite_payments.custbody_cryo_associated_invoices_item, a bespoke custom field this org stamps
// on some payments but not all (6,125 of 10,646 payment-application links since 2026-09-01, ~58%,
// had no value in that custom field despite being genuinely, fully applied in NetSuite's own
// linking table) - see paymentInvoiceLinkSyncService.ts. One row per (payment, invoice) application
// - almost always one invoice per payment, but a payment applying to more than one invoice does
// happen (confirmed live: 11 of 10,646 since 2026-09-01, always exactly 2), hence a proper
// one-to-many table rather than a single column on netsuite_payments.
exports.up = function (knex) {
  return knex.schema.createTable('netsuite_payment_invoice_links', function (table) {
    table.increments('id').primary();
    table.string('payment_id').notNullable().index();
    table.string('invoice_id').notNullable().index();
    table.unique(['payment_id', 'invoice_id']);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('netsuite_payment_invoice_links');
};
