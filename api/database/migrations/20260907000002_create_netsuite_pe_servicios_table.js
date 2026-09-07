// Mirrors `customrecord_cryo_pe_servicios` - a small (~36 row) Peru service-package price catalog.
// custrecord_cryo_otroscontratos.custrecord_cryo_servicio_otroscontratos references this table
// (confirmed via the REST record API's expanded link, e.g. id 2 -> "ADN+ SANGRE"); its
// custrecord_cryo_precioservicio is the "Servicio : Precio sin Impuesto" amount for that contract.
exports.up = function (knex) {
  return knex.schema.createTable('netsuite_pe_servicios', function (table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord_cryo_idinternoarticulo').nullable();
    table.string('custrecord_cryo_monedaprecio').nullable();
    table.string('custrecord_cryo_pe_articulo').nullable();
    table.string('custrecord_cryo_pe_subsidiaria').nullable();
    table.decimal('custrecord_cryo_precioservicio', 18, 8).nullable();
    table.string('isinactive').nullable();
    table.string('lastmodifiedby').nullable();
    table.string('owner').nullable();
    table.string('scriptid').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('netsuite_pe_servicios');
};
