// Contratos and Otros Contratos sales no longer share one tier - each needs its own nivel per
// employee (they don't sum together for tier-resolution purposes, see commissionsRepository.ts).
// Renaming the original single `nivel` column to `nivel_contratos` keeps its existing assignments
// as the "Contratos" nivel, and a new `nivel_otros_contratos` column starts unassigned (nullable).
exports.up = function (knex) {
  return knex.schema.alterTable('employee_details', function (table) {
    table.renameColumn('nivel', 'nivel_contratos');
    table.string('nivel_otros_contratos').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('employee_details', function (table) {
    table.dropColumn('nivel_otros_contratos');
    table.renameColumn('nivel_contratos', 'nivel');
  });
};
