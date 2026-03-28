exports.up = function(knex) {
  return knex.schema.createTable('netsuite_query_results', function(table) {
    table.increments('id').primary();
    table.string('query_key').notNullable().index();
    table.string('suite_id').nullable().index();
    table.json('raw_data').notNullable();
    table.timestamps(true, true);
    table.unique(['query_key', 'suite_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_query_results');
};
