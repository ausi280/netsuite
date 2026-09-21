// The Cuentas report (api/src-ts/reporting/cuentasRepository.ts) runs several correlated
// subqueries per row against netsuite_partidas/netsuite_family_members, and joins/filters
// netsuite_contracts on columns that have never had an index - on a production-sized table
// (partidas especially, one row per billing line item) each of those was a full table scan
// repeated once per page row, which is what made the report slow to load. These are purely
// additive (no column/data changes) and safe to roll back independently.
exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_partidas', (table) => {
    // Serves getCuentasPaged's adeudo_total subquery (numcontrato + estatuspartida) and its
    // pagado_hasta_scu/tcu/adn subqueries (numcontrato + estatuspartida + servtipo), plus
    // commissionsRepository.ts's anualidad-partidas lookup (numcontrato alone, as this
    // composite index's leading column).
    table.index(['custrecord_cryo_numcontrato', 'custrecord_cryo_estatuspartida', 'custrecord_cryo_servtipo'], 'idx_partidas_numcontrato_estatus_servtipo');
  });

  await knex.schema.alterTable('netsuite_family_members', (table) => {
    // Serves getCuentasPaged's nombre_hijo subquery (idfamilia + parentesco = '1').
    table.index(['custrecord_cryo_idfamilia', 'custrecord_cryo_parentesco'], 'idx_family_members_idfamilia_parentesco');
  });

  await knex.schema.alterTable('netsuite_contracts', (table) => {
    // Every one of these is joined or filtered on by Cuentas (titular/titular2/dueño lookups,
    // the hijo subquery's numerofamilia match, the subsidiary restriction every report applies)
    // and by other reports (subsidiariacontrato, contratosistemaanterior) - netsuite_contracts
    // had no index at all on any custom field before this.
    table.index('custrecord_cryo_titularcontrato', 'idx_contracts_titularcontrato');
    table.index('custrecord_cryo_padres', 'idx_contracts_padres');
    table.index('custrecord_cryo_duenio', 'idx_contracts_duenio');
    table.index('custrecord_cryo_numerofamilia', 'idx_contracts_numerofamilia');
    table.index('custrecord_cryo_subsidiariacontrato', 'idx_contracts_subsidiariacontrato');
    table.index('custrecord_cryo_contratosistemaanterior', 'idx_contracts_contratosistemaanterior');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_contracts', (table) => {
    table.dropIndex('custrecord_cryo_titularcontrato', 'idx_contracts_titularcontrato');
    table.dropIndex('custrecord_cryo_padres', 'idx_contracts_padres');
    table.dropIndex('custrecord_cryo_duenio', 'idx_contracts_duenio');
    table.dropIndex('custrecord_cryo_numerofamilia', 'idx_contracts_numerofamilia');
    table.dropIndex('custrecord_cryo_subsidiariacontrato', 'idx_contracts_subsidiariacontrato');
    table.dropIndex('custrecord_cryo_contratosistemaanterior', 'idx_contracts_contratosistemaanterior');
  });

  await knex.schema.alterTable('netsuite_family_members', (table) => {
    table.dropIndex(['custrecord_cryo_idfamilia', 'custrecord_cryo_parentesco'], 'idx_family_members_idfamilia_parentesco');
  });

  await knex.schema.alterTable('netsuite_partidas', (table) => {
    table.dropIndex(['custrecord_cryo_numcontrato', 'custrecord_cryo_estatuspartida', 'custrecord_cryo_servtipo'], 'idx_partidas_numcontrato_estatus_servtipo');
  });
};
