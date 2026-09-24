// "Referencia CIE NUEVA" on the Cuentas report should read from
// custrecord_nso_nrp_num_ferencia_unico (confirmed by the user), not custrecord_cryo_mx_cie -
// same situation as the Clasificadores backfill (20260921000002): NetSuite already returns this
// field on every contract fetch (confirmed present in raw_data), it just never had its own
// column. Batched by id range for the same reason that migration was - a single UPDATE across
// all ~220k production rows blows past the client's request timeout.
const BACKFILL_BATCH_SIZE = 5000;

exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_contracts', (table) => {
    table.string('custrecord_nso_nrp_num_ferencia_unico').nullable();
  });

  const bounds = await knex('netsuite_contracts').min('id as min').max('id as max').first();
  if (bounds && bounds.min !== null && bounds.max !== null) {
    for (let start = bounds.min; start <= bounds.max; start += BACKFILL_BATCH_SIZE) {
      const end = start + BACKFILL_BATCH_SIZE - 1;
      await knex.raw(
        `
        UPDATE netsuite_contracts SET
          custrecord_nso_nrp_num_ferencia_unico = JSON_VALUE(raw_data, '$.custrecord_nso_nrp_num_ferencia_unico')
        WHERE id BETWEEN ? AND ? AND raw_data IS NOT NULL
      `,
        [start, end],
      );
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_contracts', (table) => {
    table.dropColumn('custrecord_nso_nrp_num_ferencia_unico');
  });
};
