// Adds the two other lifecycle timestamps Zammad tracks on every ticket (confirmed live in raw_data:
// first_response_at populated on 535/867 synced tickets, close_at on 752/867) - alongside the
// existing created_at_zammad/updated_at_zammad, for the Zammad Tickets grid/graphs.
exports.up = function (knex) {
  return knex.schema.alterTable('zammad_tickets', function (table) {
    table.datetime('first_response_at_zammad').nullable();
    table.datetime('close_at_zammad').nullable().index();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('zammad_tickets', function (table) {
    table.dropColumn('first_response_at_zammad');
    table.dropColumn('close_at_zammad');
  });
};
