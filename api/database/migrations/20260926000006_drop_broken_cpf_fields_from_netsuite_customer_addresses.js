// custrecord_cpf_rfc_direccion/custrecord_cpf_razon_social/custrecord_cpf_correo_portal_facturacion
// (a separate "cpf" bundle's fields, redundant with the custrecord_cryo_* fiscal fields already
// synced) each make NetSuite's SuiteQL engine 500 on this account's real production data when
// selected - confirmed live, not reproducible on sandbox. Dropped rather than worked around since
// the cryo_* fields already cover the same data - see customerAddressRepository.ts.
exports.up = function (knex) {
  return knex.schema.alterTable('netsuite_customer_addresses', function (table) {
    table.dropColumn('custrecord_cpf_rfc_direccion');
    table.dropColumn('custrecord_cpf_razon_social');
    table.dropColumn('custrecord_cpf_correo_portal_facturacion');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('netsuite_customer_addresses', function (table) {
    table.string('custrecord_cpf_rfc_direccion').nullable();
    table.string('custrecord_cpf_razon_social').nullable();
    table.string('custrecord_cpf_correo_portal_facturacion').nullable();
  });
};
