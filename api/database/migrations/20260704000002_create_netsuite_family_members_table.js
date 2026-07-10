exports.up = function(knex) {
  return knex.schema.createTable('netsuite_family_members', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord_cryo_fnacimiento').nullable();
    table.string('custrecord_cryo_genero').nullable();
    table.string('custrecord_cryo_idfamilia').nullable();
    table.string('custrecord_cryo_main_email').nullable();
    table.string('custrecord_cryo_miembrotitular').nullable();
    table.string('custrecord_cryo_mismadireccion').nullable();
    table.string('custrecord_cryo_no_familia_colombia').nullable();
    table.string('custrecord_cryo_nombremiembro').nullable();
    table.string('custrecord_cryo_parentesco').nullable();
    table.string('custrecord_cryo_titular').nullable().index(); // netsuite_id of the related contract/titular
    table.string('isinactive').nullable();
    table.string('lastmodifiedby').nullable();
    table.string('owner').nullable();
    table.string('scriptid').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_family_members');
};
