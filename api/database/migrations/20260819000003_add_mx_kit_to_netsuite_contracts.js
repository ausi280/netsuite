exports.up = function(knex) {
  return knex.schema.alterTable('netsuite_contracts', function(table) {
    table.string('custrecord_cryo_mx_kit').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('netsuite_contracts', function(table) {
    table.dropColumn('custrecord_cryo_mx_kit');
  });
};
