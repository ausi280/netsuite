// The Reporte de Marketing now covers Argentina too (prospectos from NetSuite) - inversión digital
// and metas are captured per country, so the monthly inputs gain a `pais` key. Every existing row
// was captured for México (the only country the report had), hence the 'MX' default.
exports.up = async function (knex) {
  await knex.schema.alterTable('marketing_monthly_inputs', function (table) {
    table.string('pais', 2).notNullable().defaultTo('MX');
  });
  await knex.schema.alterTable('marketing_monthly_inputs', function (table) {
    table.dropUnique(['year', 'month']);
    table.unique(['pais', 'year', 'month']);
  });
};

exports.down = async function (knex) {
  await knex('marketing_monthly_inputs').whereNot('pais', 'MX').del();
  await knex.schema.alterTable('marketing_monthly_inputs', function (table) {
    table.dropUnique(['pais', 'year', 'month']);
    table.unique(['year', 'month']);
  });
  await knex.schema.alterTable('marketing_monthly_inputs', function (table) {
    table.dropColumn('pais');
  });
};
