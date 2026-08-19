// customrecord_cryo_hospitales doesn't exist in NetSuite (confirmed via
// customrecordtype metadata query) — the real record is
// customrecord_cryo_arg_hospitales, whose actual field names differ from
// what this table originally guessed. Safe to rename/add here since no
// hospital sync has ever succeeded (every prior run 400'd before writing
// any rows).
exports.up = async function(knex) {
  await knex.schema.alterTable('netsuite_hospitals', function(table) {
    table.renameColumn('custrecord1399', 'custrecord_hospitales_subsidiria');
    table.renameColumn('custrecordcryo_provincias', 'custrecord_cryo_provinciaarg');
  });
  await knex.schema.alterTable('netsuite_hospitals', function(table) {
    table.string('custrecord_cryo_direccionhospital').nullable();
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('netsuite_hospitals', function(table) {
    table.dropColumn('custrecord_cryo_direccionhospital');
  });
  await knex.schema.alterTable('netsuite_hospitals', function(table) {
    table.renameColumn('custrecord_hospitales_subsidiria', 'custrecord1399');
    table.renameColumn('custrecord_cryo_provinciaarg', 'custrecordcryo_provincias');
  });
};
