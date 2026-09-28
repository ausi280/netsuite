// Needed to feed contratosReportRepository.ts's "ColFac" (Colonia Facturación) column - deliberately
// left out of the original column set as "generic address-validation noise" before that concrete
// need existed.
exports.up = function (knex) {
  return knex.schema.alterTable('netsuite_customer_addresses', function (table) {
    table.string('custrecord_colonia').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('netsuite_customer_addresses', function (table) {
    table.dropColumn('custrecord_colonia');
  });
};
