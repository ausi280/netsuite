// NetSuite leads - customer records that entered as a lead (dategrosslead set), with the marketing
// fields the Reporte de Marketing needs: entry channel (canal de ingreso), lead state, lost reason
// (motivo de pérdida), brand and status. Argentina (subsidiary 20) captures its prospectos here
// instead of the legacy Cryo.dbo CRM México uses - see leadSyncService.ts. Every subsidiary's leads
// are synced (not just Argentina's) so another country can be added later with only a filter.
//
// Each list field keeps both NetSuite's internal id and its display text (BUILTIN.DF) - the report
// classifies by id (stable), the text is for showing and verifying it. Separate from
// netsuite_customers on purpose: that sync selects an explicit column list and every lead field
// below would otherwise need a full customer re-fetch to backfill.
exports.up = function (knex) {
  return knex.schema.createTable('netsuite_leads', function (table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('entityid').nullable();
    table.string('subsidiary').nullable().index();
    table.string('stage').nullable();
    table.string('entitystatus').nullable();
    table.string('entitystatus_nombre').nullable();
    table.string('custentity_cryo_canalingreso').nullable();
    table.string('canalingreso_nombre').nullable();
    table.string('custentity_cryo_col_estadolead').nullable();
    table.string('estadolead_nombre').nullable();
    table.string('custentity_cryo_motivoperdida').nullable();
    table.string('motivoperdida_nombre').nullable();
    table.string('custentity_nso_lead_marca').nullable();
    table.string('marca_nombre').nullable();
    table.string('custentity_cryo_campana', 500).nullable();
    table.boolean('isinactive').nullable();
    table.date('dategrosslead').nullable().index();
    table.date('dateconversion').nullable();
    table.datetime('datecreated').nullable();
    table.datetime('lastmodifieddate').nullable();
    table.text('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('netsuite_leads');
};
