exports.up = function(knex) {
  return knex.schema.createTable('netsuite_raw_records', function(table) {
    table.increments('id').primary();
    table.string('entity').notNullable().index();
    table.string('netsuite_id').notNullable();
    table.string('run_id').nullable();
    table.json('raw_data').notNullable();
    table.datetime('fetched_at').notNullable();
    table.timestamps(true, true);
    table.unique(['entity', 'netsuite_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_raw_records');
};
