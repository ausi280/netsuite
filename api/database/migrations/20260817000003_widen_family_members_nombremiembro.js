exports.up = function(knex) {
  return knex.schema.alterTable('netsuite_family_members', function(table) {
    table.text('custrecord_cryo_nombremiembro').nullable().alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('netsuite_family_members', function(table) {
    table.string('custrecord_cryo_nombremiembro').nullable().alter();
  });
};
