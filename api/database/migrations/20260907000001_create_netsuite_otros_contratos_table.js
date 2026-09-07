// Mirrors `customrecord_cryo_otroscontratos` ("Otros Contratos", record type id 3937). Field set
// matches the raw sample exactly rather than being pruned down, since this is a new/unfamiliar
// custom record - it tracks a distinct kind of contract (specimen/hospital/ginecólogo/fecha
// probable fields suggest a prenatal collection record) separate from netsuite_contracts.
exports.up = function (knex) {
  return knex.schema.createTable('netsuite_otros_contratos', function (table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord_cryo_contrato_otroscontratos').nullable().index();
    table.string('custrecord_cryo_dnititular2_otroscontrat').nullable();
    table.string('custrecord_cryo_especimen_otroscontratos').nullable();
    table.string('custrecord_cryo_estado_otroscontratos').nullable();
    table.string('custrecord_cryo_fecha_otroscontratos').nullable();
    table.string('custrecord_cryo_fechaprobable_otroscontr').nullable();
    table.string('custrecord_cryo_ginecologo_otroscontrato').nullable();
    table.string('custrecord_cryo_hospital_otroscontratos').nullable();
    table.string('custrecord_cryo_muestra1_otroscontratos').nullable();
    table.string('custrecord_cryo_muestra2_otroscontratos').nullable();
    table.string('custrecord_cryo_otroscontratosmarca').nullable();
    table.string('custrecord_cryo_servicio_otroscontratos').nullable();
    table.string('custrecord_cryo_subsidiaria_otroscontrat').nullable().index();
    table.string('custrecord_cryo_titular2_otroscontratos').nullable();
    table.string('custrecord_cryo_titular_otroscontrato').nullable();
    table.string('custrecord_cryo_vendedor_otroscontratos').nullable();
    table.string('externalid').nullable();
    table.string('isinactive').nullable();
    table.string('lastmodifiedby').nullable();
    table.string('owner').nullable();
    table.string('recordid').nullable();
    table.string('scriptid').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('netsuite_otros_contratos');
};
