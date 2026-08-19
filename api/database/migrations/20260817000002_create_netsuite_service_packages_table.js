exports.up = function(knex) {
  return knex.schema.createTable('netsuite_service_packages', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord1').nullable();
    table.string('custrecord_cryo_articulodescuento').nullable();
    table.string('custrecord_cryo_articulopaquete').nullable();
    table.string('custrecord_cryo_artanualidad').nullable();
    table.string('custrecord_cryo_costoinscripcion').nullable();
    table.string('custrecord_cryo_costoprocesamiento').nullable();
    table.string('custrecord_cryo_descuentoimportepaquete').nullable();
    table.string('custrecord_cryo_descuentopaquete').nullable();
    table.string('custrecord_cryo_fecha_precios').nullable();
    table.string('custrecord_cryo_kit').nullable();
    table.string('custrecord_cryo_kitpaquete').nullable();
    table.string('custrecord_cryo_marcaservicio').nullable();
    table.string('custrecord_cryo_monedaservicio').nullable();
    table.string('custrecord_cryo_pe_monedaanualidad').nullable();
    table.string('custrecord_cryo_pe_seguridadtotal').nullable();
    table.string('custrecord_cryo_preciototalpaquete').nullable();
    table.string('custrecord_cryo_subsidiariapaquete').nullable();
    table.string('custrecord_cryo_tipocambio').nullable();
    table.string('custrecord_cryo_tipodeservicio').nullable();
    table.string('externalid').nullable();
    table.string('isinactive').nullable();
    table.string('lastmodifiedby').nullable();
    table.string('owner').nullable();
    table.string('recordid').nullable();
    table.string('scriptid').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_service_packages');
};
