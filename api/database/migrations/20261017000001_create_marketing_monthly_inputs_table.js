// Monthly figures for the Reporte de Marketing's México funnel that don't exist in any synced
// source - captured every month from the "Capturar inversión y metas" page. The real lead/prospecto/
// sale counts come from the legacy CRM (see marketingRepository.ts); this table only holds the
// money spent and the goals they're compared against. One row per (year, month); every column is
// nullable so a month can be captured partially. Money is MXN.
exports.up = function (knex) {
  return knex.schema.createTable('marketing_monthly_inputs', function (table) {
    table.increments('id').primary();
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.decimal('inversion_digital', 18, 2).nullable(); // real digital spend
    table.decimal('meta_inversion_digital', 18, 2).nullable(); // budget
    table.integer('meta_leads_digital').nullable();
    table.integer('meta_leads_offline').nullable();
    table.integer('meta_prospectos').nullable();
    table.integer('meta_ventas_digital').nullable();
    table.integer('meta_ventas_total').nullable();
    table.unique(['year', 'month']);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('marketing_monthly_inputs');
};
