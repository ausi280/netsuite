// custrecord_cryo_telefonocelular (the family member's own cell phone - Titular 2's, in
// practice) was never picked out into its own column, though NetSuite's REST API already returns
// it on every fetch (present in every existing row's raw_data JSON). Backfills every existing row
// from that already-synced JSON instead of waiting for a resync - same convention as
// 20260921000002_add_mx_classifier_fields_to_netsuite_contracts.js.
const BACKFILL_BATCH_SIZE = 5000;

exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_family_members', (table) => {
    table.string('custrecord_cryo_telefonocelular').nullable();
  });

  // Batched by id range (not by "column IS NULL", which would loop forever on rows whose real
  // JSON value is genuinely null) - same reasoning as the contracts backfill migration.
  const bounds = await knex('netsuite_family_members').min('id as min').max('id as max').first();
  if (bounds && bounds.min !== null && bounds.max !== null) {
    for (let start = bounds.min; start <= bounds.max; start += BACKFILL_BATCH_SIZE) {
      const end = start + BACKFILL_BATCH_SIZE - 1;
      await knex.raw(
        `
        UPDATE netsuite_family_members SET
          custrecord_cryo_telefonocelular = JSON_VALUE(raw_data, '$.custrecord_cryo_telefonocelular')
        WHERE id BETWEEN ? AND ? AND raw_data IS NOT NULL
      `,
        [start, end],
      );
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_family_members', (table) => {
    table.dropColumn('custrecord_cryo_telefonocelular');
  });
};
