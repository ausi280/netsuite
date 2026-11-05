// Monthly "Plan de trabajo" for vendedores (visitas médicas, eventos, cursos...) - replaces the
// standalone plan.html page the gerencia used to hand out as a link. One plan per vendedor per
// month; its venta objetivos aren't stored here, they come from the vendedor's niveles (see
// salesWorkPlanRepository.ts). Médico/hospital keep both the NetSuite id (when picked from the
// catalog) and the name as typed, since a vendedor may visit someone not in NetSuite yet.
exports.up = async function (knex) {
  await knex.schema.createTable('sales_work_plans', function (table) {
    table.increments('id').primary();
    table.string('vendedor_id').notNullable(); // netsuite_employees.netsuite_id
    table.integer('year').notNullable();
    table.integer('month').notNullable();
    table.string('puesto').nullable();
    table.text('objetivos').nullable(); // JSON array of strings, set by the gerencia
    table.unique(['vendedor_id', 'year', 'month']);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('sales_work_plan_activities', function (table) {
    table.increments('id').primary();
    table.integer('plan_id').notNullable().references('id').inTable('sales_work_plans').onDelete('CASCADE').index();
    table.date('fecha').notNullable();
    table.string('hora', 5).nullable(); // HH:MM, 24h
    table.string('tipo').notNullable();
    table.string('medico_netsuite_id').nullable();
    table.string('medico_nombre').nullable();
    table.string('hospital_netsuite_id').nullable();
    table.string('hospital_nombre').nullable();
    table.string('especialidad').nullable();
    table.string('motivo').nullable();
    table.string('evento_nombre').nullable();
    table.string('sede').nullable();
    table.integer('asistentes').nullable();
    table.text('requerimientos').nullable(); // JSON array of strings
    table.text('notas').nullable();
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTable('sales_work_plan_activities');
  await knex.schema.dropTable('sales_work_plans');
};
