exports.up = function(knex) {
  return knex.schema.alterTable('netsuite_records', function(table) {
    table.datetime('lastmodifieddate_dt').nullable().index();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('netsuite_records', function(table) {
    table.dropColumn('lastmodifieddate_dt');
  });
};
