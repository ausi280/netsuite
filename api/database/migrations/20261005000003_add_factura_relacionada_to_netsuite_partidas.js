// Needed to answer "which invoice does this partida belong to" (the "Factura Relacionada"
// column in NetSuite's own native Partidas report/subtab) - confirmed live against production
// NetSuite via the record metadata catalog for customrecord_cryo_partidas, then verified end-to-
// end: contract MX-BC-2026-037111-2's partidas carry custrecord_cryo_facturarelacionada = 471787,
// which resolves to transaction.tranid = 'FV-BCU-3739', matching the user's screenshot exactly.
// custrecord_cryo_num_consecutivo and custrecord_cryo_importepagado were discovered in the same
// metadata catalog lookup and are added alongside since they come from the same unmapped-field gap
// (this sync service does SELECT * already, so no query change is needed to pull them).
exports.up = function (knex) {
  return knex.schema.alterTable('netsuite_partidas', function (table) {
    table.string('custrecord_cryo_facturarelacionada').nullable().index(); // NetSuite Invoice internal id
    table.string('custrecord_cryo_num_consecutivo').nullable();
    table.string('custrecord_cryo_importepagado').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('netsuite_partidas', function (table) {
    table.dropColumn('custrecord_cryo_facturarelacionada');
    table.dropColumn('custrecord_cryo_num_consecutivo');
    table.dropColumn('custrecord_cryo_importepagado');
  });
};
