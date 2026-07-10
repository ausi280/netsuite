exports.up = function(knex) {
  return knex.schema.createTable('netsuite_services', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord_cryo_costo_anual_auto').nullable();
    table.string('custrecord_cryo_costoanualidad').nullable();
    table.string('custrecord_cryo_estatusservicio').nullable();
    table.string('custrecord_cryo_estatusservicio_copia').nullable();
    table.string('custrecord_cryo_fecha_procesoserv').nullable();
    table.string('custrecord_cryo_idcontrato').nullable().index(); // netsuite_id of the related contract
    table.string('custrecord_cryo_monedaserv').nullable();
    table.string('custrecord_cryo_precioprocesamiento').nullable();
    table.string('custrecord_cryo_serviciocontratado').nullable();
    table.string('custrecord_cryo_statuspagoserv').nullable();
    table.string('custrecord_cryo_tipodeserv').nullable();
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
  return knex.schema.dropTable('netsuite_services');
};
