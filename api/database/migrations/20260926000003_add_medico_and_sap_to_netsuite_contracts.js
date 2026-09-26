// custrecord_cryo_ginecoloco ("Médico" - values are employee internal ids, e.g. gynecologist
// names via netsuite_employees, confirmed live) and custrecord_cryo_mx_referencia_sap
// ("Referencia SAP") for the new Reporte Contratos - both already synced into raw_data since the
// contract sync uses SELECT * (see contractSyncService.ts), just never had their own columns.
// Batched by id range - same reasoning as the 20260921000002 Clasificadores migration on this
// same ~220k-row table (a single UPDATE blows past the client's request timeout).
const BACKFILL_BATCH_SIZE = 5000;

exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_contracts', (table) => {
    table.string('custrecord_cryo_ginecoloco').nullable();
    table.string('custrecord_cryo_mx_referencia_sap').nullable();
  });

  const bounds = await knex('netsuite_contracts').min('id as min').max('id as max').first();
  if (bounds && bounds.min !== null && bounds.max !== null) {
    for (let start = bounds.min; start <= bounds.max; start += BACKFILL_BATCH_SIZE) {
      const end = start + BACKFILL_BATCH_SIZE - 1;
      await knex.raw(
        `
        UPDATE netsuite_contracts SET
          custrecord_cryo_ginecoloco = JSON_VALUE(raw_data, '$.custrecord_cryo_ginecoloco'),
          custrecord_cryo_mx_referencia_sap = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_referencia_sap')
        WHERE id BETWEEN ? AND ? AND raw_data IS NOT NULL
      `,
        [start, end],
      );
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_contracts', (table) => {
    table.dropColumn('custrecord_cryo_ginecoloco');
    table.dropColumn('custrecord_cryo_mx_referencia_sap');
  });
};
