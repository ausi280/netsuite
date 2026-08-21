exports.up = function (knex) {
  return knex.schema.createTable('netsuite_medicos', function (table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord_cryo_ciudadmedico').nullable();
    table.string('custrecord_cryo_correomedico').nullable();
    table.string('custrecord_cryo_cuit').nullable();
    table.string('custrecord_cryo_generomedico').nullable();
    table.string('custrecord_cryo_marca_medicos').nullable();
    table.string('custrecord_cryo_subsidiariamedico').nullable();
    table.string('custrecord_cryo_telefonomedico').nullable();
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

exports.down = function (knex) {
  return knex.schema.dropTable('netsuite_medicos');
};
