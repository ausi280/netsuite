exports.up = function(knex) {
  return knex.schema.createTable('netsuite_partidas', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord1401').nullable();
    table.string('custrecord_cryo_aniopartida').nullable();
    table.string('custrecord_cryo_articulopartida').nullable();
    table.string('custrecord_cryo_concepto').nullable();
    table.string('custrecord_cryo_estatuspartida').nullable();
    table.string('custrecord_cryo_fechalimitepago').nullable();
    table.string('custrecord_cryo_fechapartida').nullable();
    table.string('custrecord_cryo_finvigencia').nullable();
    table.string('custrecord_cryo_importepartida').nullable();
    table.string('custrecord_cryo_iniciovigencia').nullable();
    table.string('custrecord_cryo_interes').nullable();
    table.string('custrecord_cryo_linea_anticipo').nullable();
    table.string('custrecord_cryo_linea_anticipo_ini').nullable();
    table.string('custrecord_cryo_linea_procesamiento').nullable();
    table.string('custrecord_cryo_linea_saldo_inicial_mr').nullable();
    table.string('custrecord_cryo_monedapartida').nullable();
    table.string('custrecord_cryo_numcontrato').nullable();
    table.string('custrecord_cryo_servtipo').nullable();
    table.string('custrecord_cryo_statusservicio').nullable();
    table.string('custrecord_cryo_subsidiaria_partida').nullable();
    table.string('custrecord_cryo_titular_partida').nullable();
    table.string('externalid').nullable();
    table.string('isinactive').nullable();
    table.string('lastmodifiedby').nullable();
    table.string('owner').nullable();
    table.string('scriptid').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_partidas');
};
