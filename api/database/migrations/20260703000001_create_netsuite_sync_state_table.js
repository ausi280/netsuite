exports.up = function(knex) {
  return knex.schema.createTable('netsuite_sync_state', function(table) {
    table.increments('id').primary();
    table.string('entity').notNullable().unique();
    table.datetime('last_watermark').nullable();
    table.string('last_run_id').nullable();
    table.string('last_run_status').nullable(); // running | success | partial | failed
    table.datetime('last_run_started_at').nullable();
    table.datetime('last_run_completed_at').nullable();
    table.text('last_run_error').nullable();
    table.integer('consecutive_failures').notNullable().defaultTo(0);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_sync_state');
};
