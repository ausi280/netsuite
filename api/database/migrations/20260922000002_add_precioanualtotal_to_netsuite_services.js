// custrecord_cryo_precioanualtotal ("Costo Anualidad C/Imp" in the NetSuite UI) is the field
// cuentasRepository.ts's "Costo de anualidad" should actually sum - confirmed by the user against
// a real contract where custrecord_cryo_costoanualidad ("Costo Anualidad INICIAL" - a one-time
// first-year price) and custrecord_cryo_costo_anual_auto ("Costo Anualidad" - a different,
// smaller auto-calculated figure) were both populated but neither matched the expected total.
// The sync already pulls this field via SELECT * (see SuiteQlQueryBuilder's default columns) -
// it's just never had a dedicated column, so it's been sitting in raw_data all along. This adds
// the column AND backfills every already-synced row from that raw_data JSON, so existing rows
// don't have to wait for their next incremental sync to pick it up.
exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_services', (table) => {
    table.string('custrecord_cryo_precioanualtotal').nullable();
  });

  await knex.raw(`
    UPDATE netsuite_services
    SET custrecord_cryo_precioanualtotal = JSON_VALUE(raw_data, '$.custrecord_cryo_precioanualtotal')
    WHERE raw_data IS NOT NULL
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_services', (table) => {
    table.dropColumn('custrecord_cryo_precioanualtotal');
  });
};
