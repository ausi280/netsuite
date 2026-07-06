exports.up = function(knex) {
  return knex.schema.createTable('netsuite_customers', function(table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('entityid').nullable();
    table.string('companyname').nullable();
    table.string('email').nullable();
    table.string('phone').nullable();
    table.boolean('isinactive').nullable();
    table.datetime('datecreated').nullable();
    table.datetime('lastmodifieddate').nullable().index();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('netsuite_customers');
};
