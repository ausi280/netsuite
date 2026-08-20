// Serial numbers (NetSuite's "Inventory Number" record) for item 2394
// ("KIT DE RECOLECCION - SCU Y TCU"), requested by the team for daily
// extraction. Scoped to this one item — see serialNumberSyncService.ts.
exports.up = function(knex) {
  return knex.schema.createTable('netsuite_serial_numbers', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('item_netsuite_id').nullable().index();
    table.string('inventory_number').nullable();
    table.string('lastmodified').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_serial_numbers');
};
