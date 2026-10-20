// Monthly cobranza incentive configuration - purely app-owned config, captured every month from
// the Cobranza Commissions "Incentivos" page, not synced NetSuite data. See
// cobranzaIncentivesRepository.ts.
//
// cobranza_incentive_tiers - regular agentes de cobranza: one row per "% recuperado" tier (the tier
// applies from min_pct up to the next tier's min_pct), with the "% de incentivo" label and the
// commission rate paid per subsidiaria / role column (CCELL, BCU, BSCU, FCELLS, GTE CCELL, SUP. BCU,
// SUP. FCELLS). Rates are stored as the percentage itself (1.22 = 1.22%).
//
// cobranza_proyecto_incentive_tiers - agentes de proyecto: collected-amount thresholds, each
// paying rate_pct from min_amount up (e.g. 0 -> 8.5%, 160,000 -> 9%).
//
// cobranza_agent_incentive_schemes - which of those an agent is paid by ('ccell', 'bcu', 'bscu',
// 'fcells', 'gte_ccell', 'sup_bcu', 'sup_fcells' = that rate column of the tier table, or
// 'proyecto'), stored per month: each configured month holds its own complete snapshot, and a
// month not configured yet shows the latest earlier month's snapshot until it's first edited (then
// it's copied in) - see cobranzaIncentivesRepository.ts. scheme null = no esquema that month.
exports.up = async function (knex) {
  await knex.schema.createTable('cobranza_agent_incentive_schemes', function (table) {
    table.increments('id').primary();
    table.string('employee_id').notNullable();
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.string('scheme', 20).nullable();
    table.unique(['employee_id', 'year', 'month']);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('cobranza_incentive_tiers', function (table) {
    table.increments('id').primary();
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.decimal('min_pct', 7, 2).notNullable();
    table.string('incentive_label', 50).nullable();
    table.decimal('rate_ccell', 7, 3).nullable();
    table.decimal('rate_bcu', 7, 3).nullable();
    table.decimal('rate_bscu', 7, 3).nullable();
    table.decimal('rate_fcells', 7, 3).nullable();
    table.decimal('rate_gte_ccell', 7, 3).nullable();
    table.decimal('rate_sup_bcu', 7, 3).nullable();
    table.decimal('rate_sup_fcells', 7, 3).nullable();
    table.unique(['year', 'month', 'min_pct']);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('cobranza_proyecto_incentive_tiers', function (table) {
    table.increments('id').primary();
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.decimal('min_amount', 18, 2).notNullable();
    table.decimal('rate_pct', 7, 3).notNullable();
    table.unique(['year', 'month', 'min_amount']);
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTable('cobranza_proyecto_incentive_tiers');
  await knex.schema.dropTable('cobranza_incentive_tiers');
  await knex.schema.dropTable('cobranza_agent_incentive_schemes');
};
