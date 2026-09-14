// Mirrors `customrecord_cryo_fcells` ("Contratos FCells", record type id 1418). Field set matches
// the raw sample (300 rows) plus the record type's own REST schema exactly rather than being
// pruned down, since this is a new/unfamiliar custom record.
//
// NOTE: this record has NO direct "amount" field of its own - the sale amount lives on the linked
// Sales Order (custrecord_cryo_sales_order_id, a `transaction` record) or on the linked product
// item (custrecord_cryo_productofcells). As of this sync, the integration role has NO SuiteQL
// visibility into Sales Order transactions at all (`SELECT COUNT(*) FROM transaction WHERE type =
// 'SalesOrd'` returns 0) - the same kind of role-permission gap hit earlier with vendor
// bills/payments. custrecord_cryo_sales_order_id itself IS synced below so a later join can be
// added the moment that permission is granted, without needing to backfill this table.
exports.up = function (knex) {
  return knex.schema.createTable('netsuite_fcells_contratos', function (table) {
    table.increments('id').primary();
    table.string('netsuite_id').notNullable().unique();
    table.string('name').nullable();
    table.string('created').nullable(); // raw NetSuite locale date text (DD/MM/YYYY), display only
    table.string('lastmodified').nullable(); // raw NetSuite locale date text, display only
    table.datetime('lastmodifieddate_dt').nullable().index(); // parsed, used for incremental-sync watermark
    table.json('links').nullable();
    table.string('custrecord1404').nullable();
    table.string('custrecord_cryo_courtesy_created').nullable();
    table.string('custrecord_cryo_courtesy_year').nullable();
    table.string('custrecord_cryo_cobradorfcells').nullable();
    table.string('custrecord_cryo_estatusfcells').nullable();
    table.string('custrecord_cryo_fcells_linea_negocio_mue').nullable();
    table.string('custrecord_cryo_fcells_mesenquimal').nullable();
    table.string('custrecord_cryo_fcells_pagadohasta').nullable();
    table.string('custrecord_cryo_fcells_ubicacion_muestra').nullable();
    table.string('custrecord_cryo_fcellscorreopaciente').nullable();
    table.string('custrecord_cryo_fecha_procesamiento').nullable();
    table.string('custrecord_cryo_fechaalta').nullable();
    table.string('custrecord_cryo_idexternocontrato').nullable();
    table.string('custrecord_cryo_medicotitular').nullable();
    table.string('custrecord_cryo_motivobaja').nullable();
    table.string('custrecord_cryo_muestrafcells').nullable();
    table.string('custrecord_cryo_owner_muestra').nullable();
    table.string('custrecord_cryo_pacientefcells').nullable();
    table.string('custrecord_cryo_productofcells').nullable();
    table.string('custrecord_cryo_sales_order_assigned').nullable();
    table.string('custrecord_cryo_sales_order_currency').nullable();
    table.string('custrecord_cryo_sales_order_id').nullable().index();
    table.string('custrecord_cryo_sales_order_subsidiary').nullable();
    table.string('custrecord_cryo_subsidiariafcells').nullable().index();
    table.string('custrecord_cryo_vendedorfcells').nullable().index();
    table.string('custrecord_cryo_year_charge_annuality').nullable();
    table.string('externalid').nullable();
    table.string('isinactive').nullable();
    table.string('lastmodifiedby').nullable();
    table.string('owner').nullable();
    table.string('scriptid').nullable();
    table.json('raw_data').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('netsuite_fcells_contratos');
};
