exports.up = function(knex) {
  return knex.schema.renameTable('netsuite_records', 'netsuite_contracts');
};

exports.down = function(knex) {
  return knex.schema.renameTable('netsuite_contracts', 'netsuite_records');
};
