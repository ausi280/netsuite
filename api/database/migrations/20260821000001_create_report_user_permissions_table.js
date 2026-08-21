exports.up = function (knex) {
  return knex.schema.createTable('report_user_permissions', function (table) {
    table.increments('id').primary();
    // Entra ID's immutable user object id (the `oid` claim on the validated access token) -
    // stable across email/UPN changes, unlike using email as the lookup key.
    table.string('oid').notNullable().unique();
    // Not used for auth matching, purely so this table is readable/manageable by hand.
    table.string('email').nullable();
    table.string('display_name').nullable();
    // Bypasses allowed_entities/allowed_subsidiaries entirely - sees everything.
    table.boolean('is_admin').notNullable().defaultTo(false);
    // JSON arrays of ReportEntityKey / subsidiary id strings. A user with no row in this
    // table at all (not just empty arrays) is denied by default - see permissionsMiddleware.
    table.text('allowed_entities').notNullable().defaultTo('[]');
    table.text('allowed_subsidiaries').notNullable().defaultTo('[]');
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('report_user_permissions');
};
