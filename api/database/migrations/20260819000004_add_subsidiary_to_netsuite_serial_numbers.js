exports.up = function(knex) {
  return knex.schema.alterTable('netsuite_serial_numbers', function(table) {
    table.string('item_subsidiary_id').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('netsuite_serial_numbers', function(table) {
    table.dropColumn('item_subsidiary_id');
  });
};
