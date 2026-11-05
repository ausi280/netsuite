// "Viales" (custrecord_cryo_viales, free text) lives on Servicios (customrecord_cryo_servicios), not
// on partidas. As of 2026-11-03 SuiteQL rejects it for our integration role ("Unknown identifier"),
// so the sync's SELECT * never returns it - the field needs View access for that role in NetSuite.
// This gives it a column ahead of time; the backfill from raw_data below is a no-op until it starts
// arriving. Rows synced before access was granted are filled by dist-ts/cli/backfillServiceViales.js,
// since the incremental sync won't revisit records that haven't changed.
exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_services', (table) => {
    table.string('custrecord_cryo_viales', 500).nullable();
  });

  await knex.raw(`
    UPDATE netsuite_services
    SET custrecord_cryo_viales = JSON_VALUE(raw_data, '$.custrecord_cryo_viales')
    WHERE raw_data IS NOT NULL AND JSON_VALUE(raw_data, '$.custrecord_cryo_viales') IS NOT NULL
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_services', (table) => {
    table.dropColumn('custrecord_cryo_viales');
  });
};
