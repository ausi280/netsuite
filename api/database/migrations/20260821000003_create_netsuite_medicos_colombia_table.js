exports.up = function (knex) {
  return knex.schema.createTable('netsuite_medicos_colombia', function (table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord_cryo_ciudadmedicos').nullable();
    table.string('custrecord_cryo_tipodocumento').nullable();
    table.string('custrecord_cryo_numdocumento').nullable();
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
  return knex.schema.dropTable('netsuite_medicos_colombia');
};
