// Every "Teléfono N" custom entity field on the Customer record (confirmed live via NetSuite's
// own metadata-catalog schema - labels are literally "Teléfono 1".."Teléfono 10", no telefono5,
// and telefono1/2 both carry a doubled "custentitycustentity_" prefix baked into their internal
// id from how they were originally created - not a typo, confirmed against NetSuite's schema).
// Unlike netsuite_partidas/netsuite_services, the customer sync's SuiteQL query explicitly names
// its columns rather than SELECT * (see customerSyncService.ts), so these were never captured in
// raw_data either - existing rows need a real NetSuite re-fetch to backfill, not a JSON_VALUE
// extraction (see scratch backfill script run after this migration).
exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_customers', (table) => {
    table.string('custentitycustentity_cryo_telefono1').nullable();
    table.string('custentitycustentity_cryo_telefono2').nullable();
    table.string('custentity_cryo_telefono3').nullable();
    table.string('custentity_cryo_telefono4').nullable();
    table.string('custentity_cryo_telefono6').nullable();
    table.string('custentity_cryo_telefono7').nullable();
    table.string('custentity_cryo_telefono8').nullable();
    table.string('custentity_cryo_telefono9').nullable();
    table.string('custentity_cryo_telefono10').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_customers', (table) => {
    table.dropColumn('custentitycustentity_cryo_telefono1');
    table.dropColumn('custentitycustentity_cryo_telefono2');
    table.dropColumn('custentity_cryo_telefono3');
    table.dropColumn('custentity_cryo_telefono4');
    table.dropColumn('custentity_cryo_telefono6');
    table.dropColumn('custentity_cryo_telefono7');
    table.dropColumn('custentity_cryo_telefono8');
    table.dropColumn('custentity_cryo_telefono9');
    table.dropColumn('custentity_cryo_telefono10');
  });
};
