// The Contract record's "Clasificadores" UI section (Zona Cobranza, Estatus Cobranza, Metal,
// Estatus Cliente, Zona Franquicia/Asociado, No Molestar, Pago Automático, Referencia CIE) lives
// on the SAME customrecord1184 record the rest of netsuite_contracts already syncs - not a
// different custom type - it was just never picked out into its own columns before. NetSuite's
// REST API already returns these fields on every fetch (confirmed: they're present in every
// existing row's raw_data JSON blob), so this backfills every existing row from that already-
// synced JSON instead of waiting for a resync.
const BACKFILL_BATCH_SIZE = 5000;

exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_contracts', (table) => {
    table.string('custrecord_cryo_mx_zonacobranza').nullable();
    table.string('custrecord_cryo_mx_estatus_cobranza').nullable();
    table.string('custrecord_cryo_mx_clasificadormetal').nullable();
    table.string('custrecord_cryo_mx_estatus_cliente').nullable();
    table.string('custrecord_cryo_mx_franquiciaasociado').nullable();
    table.string('custrecord_cryo_mx_nomolestar').nullable();
    table.string('custrecord_cryo_mx_pagoautomatico').nullable();
    table.string('custrecord_cryo_mx_cie').nullable();
  });

  // Batched by id range (not by "column IS NULL", which would loop forever on rows whose real
  // JSON value is genuinely null) - a single UPDATE across all ~220k production rows blew past
  // the client's request timeout, so this backfills a bounded slice per round-trip instead.
  const bounds = await knex('netsuite_contracts').min('id as min').max('id as max').first();
  if (bounds && bounds.min !== null && bounds.max !== null) {
    for (let start = bounds.min; start <= bounds.max; start += BACKFILL_BATCH_SIZE) {
      const end = start + BACKFILL_BATCH_SIZE - 1;
      await knex.raw(
        `
        UPDATE netsuite_contracts SET
          custrecord_cryo_mx_zonacobranza = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_zonacobranza'),
          custrecord_cryo_mx_estatus_cobranza = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_estatus_cobranza'),
          custrecord_cryo_mx_clasificadormetal = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_clasificadormetal'),
          custrecord_cryo_mx_estatus_cliente = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_estatus_cliente'),
          custrecord_cryo_mx_franquiciaasociado = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_franquiciaasociado'),
          custrecord_cryo_mx_nomolestar = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_nomolestar'),
          custrecord_cryo_mx_pagoautomatico = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_pagoautomatico'),
          custrecord_cryo_mx_cie = JSON_VALUE(raw_data, '$.custrecord_cryo_mx_cie')
        WHERE id BETWEEN ? AND ? AND raw_data IS NOT NULL
      `,
        [start, end],
      );
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_contracts', (table) => {
    table.dropColumn('custrecord_cryo_mx_zonacobranza');
    table.dropColumn('custrecord_cryo_mx_estatus_cobranza');
    table.dropColumn('custrecord_cryo_mx_clasificadormetal');
    table.dropColumn('custrecord_cryo_mx_estatus_cliente');
    table.dropColumn('custrecord_cryo_mx_franquiciaasociado');
    table.dropColumn('custrecord_cryo_mx_nomolestar');
    table.dropColumn('custrecord_cryo_mx_pagoautomatico');
    table.dropColumn('custrecord_cryo_mx_cie');
  });
};
