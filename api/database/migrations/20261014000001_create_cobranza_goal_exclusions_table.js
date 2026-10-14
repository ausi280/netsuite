// People permanently left out of the monthly cobranza goals (metas) - placeholder/shared NetSuite
// employees that show up as a Dueño/Cobrador on invoices but aren't a real person with a goal
// (e.g. "COBRADOR 1", "OFICINA"). Not per month: an excluded employee is dropped from the goals
// roster for every month, so "apply the general goal to everyone" never gives them one, and they
// never appear in the goal-progress charts. See cobranzaGoalsRepository.ts.
exports.up = function (knex) {
  return knex.schema.createTable('cobranza_goal_exclusions', function (table) {
    table.increments('id').primary();
    table.string('employee_id').notNullable().unique();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('cobranza_goal_exclusions');
};
