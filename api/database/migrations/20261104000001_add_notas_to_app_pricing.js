// Free-text notes per app_pricing row, edited from the super-admin "Descuentos por años" screen.
exports.up = async function (knex) {
  await knex.schema.alterTable('app_pricing', (table) => {
    table.string('notas', 1000).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('app_pricing', (table) => {
    table.dropColumn('notas');
  });
};
