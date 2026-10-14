// Monthly collections goals (metas) for each Dueño/Cobrador - purely app-owned config, edited from
// the Cobranza Commissions report, not synced NetSuite data. Most people share the same goal in a
// given month, so it's stored as one month-wide default (cobranza_goal_defaults) plus per-employee
// overrides (cobranza_goals) - an employee's effective goal is their override, else the month's
// default. Keyed by employee netsuite_id, not name, since entityid can be renamed in NetSuite.
exports.up = async function (knex) {
  await knex.schema.createTable('cobranza_goal_defaults', function (table) {
    table.increments('id').primary();
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.decimal('amount', 18, 2).notNullable();
    table.unique(['year', 'month']);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('cobranza_goals', function (table) {
    table.increments('id').primary();
    table.string('employee_id').notNullable();
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.decimal('amount', 18, 2).notNullable();
    table.unique(['employee_id', 'year', 'month']);
    table.index(['year', 'month']);
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTable('cobranza_goals');
  await knex.schema.dropTable('cobranza_goal_defaults');
};
