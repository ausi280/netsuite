// New external source: Zammad helpdesk tickets (https://tickets.cryoholdco.com), pulled via the
// GET passthrough added to logistica-tickets-relay/zammad-relay.php - this app can't reach Zammad
// directly (see getZammadConfig()'s doc comment in api/src-ts/config/index.ts). With `expand=true`
// on the search request, Zammad returns every reference field already resolved to a readable
// string alongside its id (group/group_id, state/state_id, priority/priority_id, owner/owner_id,
// customer_id + customer as an email) - confirmed live. asunto/foliocontrato/telefono/empresa are
// this org's own custom ticket fields (same ones built by logisticaTicketController.ts /
// zammad-relay.php's Postventa form). raw_data always has the full original payload regardless.
exports.up = function (knex) {
  return knex.schema.createTable('zammad_tickets', function (table) {
    table.increments('id').primary();
    table.string('zammad_id').notNullable().unique();
    table.string('number').nullable().index();
    table.string('title').nullable();
    table.string('type').nullable();
    table.string('group_id').nullable();
    table.string('group_name').nullable();
    table.string('state_id').nullable();
    table.string('state_name').nullable();
    table.string('priority_id').nullable();
    table.string('priority_name').nullable();
    table.string('organization_id').nullable();
    table.string('organization_name').nullable();
    table.string('owner_id').nullable();
    table.string('owner_name').nullable();
    table.string('customer_id').nullable().index();
    table.string('customer_email').nullable();
    table.string('created_by').nullable();
    table.string('updated_by').nullable();
    table.string('asunto').nullable();
    table.string('foliocontrato').nullable().index();
    table.string('telefono').nullable();
    table.string('empresa').nullable();
    table.datetime('created_at_zammad').nullable();
    table.datetime('updated_at_zammad').nullable().index();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('zammad_tickets');
};
