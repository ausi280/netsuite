// Removing a person from the cobranza goals (metas) is now per month instead of permanent. Each
// month keeps its own complete snapshot (`excluded` false marks someone restored that month); a month
// nobody has edited yet shows the latest earlier month's snapshot - see cobranzaGoalsRepository.ts.
// Every existing exclusion was set up for October 2026 (the first month with goals), hence the
// defaults used to backfill them.
exports.up = async function (knex) {
  await knex.schema.alterTable('cobranza_goal_exclusions', function (table) {
    table.integer('year').notNullable().defaultTo(2026);
    table.integer('month').notNullable().defaultTo(10);
    table.boolean('excluded').notNullable().defaultTo(true);
  });
  await knex.schema.alterTable('cobranza_goal_exclusions', function (table) {
    table.dropUnique(['employee_id']);
    table.unique(['employee_id', 'year', 'month']);
  });
};

exports.down = async function (knex) {
  // Back to one permanent row per person: keep whoever is excluded in their latest snapshot month.
  const latest = await knex('cobranza_goal_exclusions').orderBy('year', 'desc').orderBy('month', 'desc').select('year', 'month').first();
  if (latest) {
    await knex('cobranza_goal_exclusions').whereNot((b) => b.where(latest).andWhere('excluded', true)).del();
  }
  await knex.schema.alterTable('cobranza_goal_exclusions', function (table) {
    table.dropUnique(['employee_id', 'year', 'month']);
    table.unique(['employee_id']);
  });
  await knex.schema.alterTable('cobranza_goal_exclusions', function (table) {
    table.dropColumn('excluded');
    table.dropColumn('month');
    table.dropColumn('year');
  });
};
