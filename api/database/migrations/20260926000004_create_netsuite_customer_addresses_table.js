// Not a separate custom record - these are the native Customer "Address Book" sublist rows
// (Customer > Address tab), confirmed live via NetSuite's metadata-catalog schema for `customer`
// (`customer-addressBook-addressBookAddress`). `custrecord_cryo_facturacion` marks a row as a
// billing address; the other custrecord_* columns here carry the Mexican invoicing/fiscal data
// for it (Razón Social, RFC, Régimen Fiscal, Uso CFDI, Constancia de Situación Fiscal, Cliente
// Titular). The ~35 other custom fields on this subrecord (Loqate address-validation autocomplete,
// per-country geo fields) are generic account-wide address tooling unrelated to billing and are
// deliberately left out - see customerAddressRepository.ts.
exports.up = function (knex) {
  return knex.schema.createTable('netsuite_customer_addresses', function (table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique(); // the address subrecord's own internal id (addr.nkey)
    table.string('customer_id').nullable().index();
    table.string('label').nullable();
    table.string('defaultbilling').nullable();
    table.string('defaultshipping').nullable();
    table.string('isresidential').nullable();
    table.string('addr1').nullable();
    table.string('addr2').nullable();
    table.string('addr3').nullable();
    table.string('addressee').nullable();
    table.string('attention').nullable();
    table.string('addrphone').nullable();
    table.text('addrtext').nullable();
    table.string('city').nullable();
    table.string('state').nullable();
    table.string('zip').nullable();
    table.string('country').nullable();
    table.string('override').nullable();
    table.string('lastmodifieddate').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord_cryo_facturacion').nullable().index();
    table.string('custrecord_cryo_razonsocial').nullable();
    table.string('custrecord_cryo_rfc').nullable();
    table.string('custrecord_cpf_rfc_direccion').nullable();
    table.string('custrecord_cpf_razon_social').nullable();
    table.string('custrecord_cpf_correo_portal_facturacion').nullable();
    table.string('custrecord_cryo_constanciasitfiscal').nullable();
    table.string('custrecord_cryo_usocfdi').nullable();
    table.string('custrecord_cryo_regimenfiscal').nullable();
    table.string('custrecord_cryo_clientetitular').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('netsuite_customer_addresses');
};
