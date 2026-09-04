import type { EntityConfig, ReportEntityKey } from './types';

/**
 * Hand-curated per-entity read configuration. Columns are drawn from the
 * corresponding *Row interfaces in api/src-ts/repositories/*.ts — kept
 * intentionally narrower than the full row shape for list views; the detail
 * endpoint (getRowById) still returns every column plus parsed raw_data.
 *
 * This registry (specifically getEntityConfig) is the single SQL-injection
 * choke point for the reporting API: unknown keys 404 before ever reaching a
 * query, and sortBy/search only ever resolve against the allow-lists below —
 * never against raw request input.
 */
export const ENTITY_REGISTRY: Record<ReportEntityKey, EntityConfig> = {
  contracts: {
    key: 'contracts',
    table: 'netsuite_contracts',
    idColumn: 'netsuite_id',
    syncEntityName: 'contract',
    label: 'Contracts',
    listColumns: [
      'netsuite_id',
      'name',
      'custrecord_cryo_numerocontrato',
      'custrecord_cryo_titularcontrato',
      'custrecord_cryo_estatus',
      'custrecord_cryo_saldo_inicial',
      'custrecord_cryo_moneda',
      'custrecord_cryo_finicio',
      'custrecord_cryo_servicio',
      'custrecord_cryo_subsidiariacontrato',
      'isinactive',
      'lastmodifieddate_dt',
    ],
    sortableColumns: ['name', 'custrecord_cryo_finicio', 'custrecord_cryo_saldo_inicial', 'lastmodifieddate_dt'],
    // custrecord_cryo_contratosistemaanterior is the legacy CryoCell system's folio (e.g.
    // "BCN011679-2") - staff still look contracts up by it, since that's what the old system
    // and its NotasCobranza notes use.
    searchableColumns: ['name', 'custrecord_cryo_numerocontrato', 'custrecord_cryo_titularcontrato', 'custrecord_cryo_contratosistemaanterior'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
    subsidiaryColumn: 'custrecord_cryo_subsidiariacontrato',
  },
  customers: {
    key: 'customers',
    table: 'netsuite_customers',
    idColumn: 'netsuite_id',
    syncEntityName: 'customer',
    label: 'Customers',
    listColumns: ['netsuite_id', 'entityid', 'companyname', 'email', 'phone', 'isinactive', 'lastmodifieddate'],
    sortableColumns: ['companyname', 'email', 'lastmodifieddate'],
    searchableColumns: ['entityid', 'companyname', 'email'],
    defaultSort: { column: 'lastmodifieddate', dir: 'desc' },
  },
  'family-members': {
    key: 'family-members',
    table: 'netsuite_family_members',
    idColumn: 'netsuite_id',
    syncEntityName: 'familyMember',
    label: 'Family Members',
    listColumns: [
      'netsuite_id',
      'name',
      'custrecord_cryo_nombremiembro',
      'custrecord_cryo_parentesco',
      'custrecord_cryo_titular',
      'custrecord_cryo_fnacimiento',
      'isinactive',
      'lastmodifieddate_dt',
    ],
    sortableColumns: ['name', 'lastmodifieddate_dt'],
    searchableColumns: ['name', 'custrecord_cryo_nombremiembro', 'custrecord_cryo_titular'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
  },
  employees: {
    key: 'employees',
    table: 'netsuite_employees',
    idColumn: 'netsuite_id',
    syncEntityName: 'employee',
    label: 'Employees',
    listColumns: ['netsuite_id', 'entityid', 'email', 'isinactive', 'lastmodifieddate'],
    sortableColumns: ['entityid', 'lastmodifieddate'],
    searchableColumns: ['entityid', 'email'],
    defaultSort: { column: 'lastmodifieddate', dir: 'desc' },
  },
  hospitals: {
    key: 'hospitals',
    table: 'netsuite_hospitals',
    idColumn: 'netsuite_id',
    syncEntityName: 'hospital',
    label: 'Hospitals',
    listColumns: [
      'netsuite_id',
      'name',
      'custrecord_hospitales_subsidiria',
      'custrecord_cryo_provinciaarg',
      'custrecord_cryo_direccionhospital',
      'isinactive',
      'lastmodifieddate_dt',
    ],
    sortableColumns: ['name', 'lastmodifieddate_dt'],
    searchableColumns: ['name', 'custrecord_cryo_direccionhospital'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
    subsidiaryColumn: 'custrecord_hospitales_subsidiria',
  },
  partidas: {
    key: 'partidas',
    table: 'netsuite_partidas',
    idColumn: 'netsuite_id',
    syncEntityName: 'partida',
    label: 'Partidas',
    listColumns: [
      'netsuite_id',
      'name',
      'custrecord_cryo_concepto',
      'custrecord_cryo_estatuspartida',
      'custrecord_cryo_importepartida',
      'custrecord_cryo_monedapartida',
      'custrecord_cryo_fechapartida',
      'custrecord_cryo_numcontrato',
      'custrecord_cryo_subsidiaria_partida',
      'isinactive',
      'lastmodifieddate_dt',
    ],
    sortableColumns: ['name', 'custrecord_cryo_fechapartida', 'custrecord_cryo_importepartida', 'lastmodifieddate_dt'],
    searchableColumns: ['name', 'custrecord_cryo_concepto', 'custrecord_cryo_numcontrato'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
    subsidiaryColumn: 'custrecord_cryo_subsidiaria_partida',
  },
  services: {
    key: 'services',
    table: 'netsuite_services',
    idColumn: 'netsuite_id',
    syncEntityName: 'service',
    label: 'Services',
    listColumns: [
      'netsuite_id',
      'name',
      'custrecord_cryo_serviciocontratado',
      'custrecord_cryo_estatusservicio',
      'custrecord_cryo_costoanualidad',
      'custrecord_cryo_monedaserv',
      'custrecord_cryo_idcontrato',
      'isinactive',
      'lastmodifieddate_dt',
    ],
    sortableColumns: ['name', 'custrecord_cryo_estatusservicio', 'lastmodifieddate_dt'],
    searchableColumns: ['name', 'custrecord_cryo_serviciocontratado', 'custrecord_cryo_idcontrato'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
  },
  'serial-numbers': {
    key: 'serial-numbers',
    table: 'netsuite_serial_numbers',
    idColumn: 'netsuite_id',
    syncEntityName: 'serialNumber',
    label: 'Serial Numbers',
    listColumns: ['netsuite_id', 'inventory_number', 'item_netsuite_id', 'item_subsidiary_id', 'lastmodifieddate_dt'],
    sortableColumns: ['inventory_number', 'lastmodifieddate_dt'],
    searchableColumns: ['inventory_number'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
    subsidiaryColumn: 'item_subsidiary_id',
  },
  medicos: {
    key: 'medicos',
    table: 'netsuite_medicos',
    idColumn: 'netsuite_id',
    syncEntityName: 'medico',
    label: 'Médicos',
    listColumns: [
      'netsuite_id',
      'name',
      'custrecord_cryo_telefonomedico',
      'custrecord_cryo_correomedico',
      'custrecord_cryo_ciudadmedico',
      'custrecord_cryo_subsidiariamedico',
      'isinactive',
      'lastmodifieddate_dt',
    ],
    sortableColumns: ['name', 'lastmodifieddate_dt'],
    searchableColumns: ['name', 'custrecord_cryo_telefonomedico', 'custrecord_cryo_correomedico', 'custrecord_cryo_cuit'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
    subsidiaryColumn: 'custrecord_cryo_subsidiariamedico',
  },
  'medicos-colombia': {
    key: 'medicos-colombia',
    table: 'netsuite_medicos_colombia',
    idColumn: 'netsuite_id',
    syncEntityName: 'medicoColombia',
    label: 'Médicos (Colombia)',
    listColumns: [
      'netsuite_id',
      'name',
      'custrecord_cryo_ciudadmedicos',
      'custrecord_cryo_tipodocumento',
      'custrecord_cryo_numdocumento',
      'isinactive',
      'lastmodifieddate_dt',
    ],
    sortableColumns: ['name', 'lastmodifieddate_dt'],
    searchableColumns: ['name', 'custrecord_cryo_numdocumento'],
    defaultSort: { column: 'lastmodifieddate_dt', dir: 'desc' },
    // No subsidiary field on this record - it's already scoped to Colombia specifically.
  },
  'fiscal-updates': {
    key: 'fiscal-updates',
    table: 'app_fiscal_info_updates',
    idColumn: 'id',
    // Not NetSuite-sourced - written directly by the payment app's fiscal-info-update flow, so
    // there's no sync watermark row for it.
    syncEntityName: null,
    label: 'Actualizaciones Fiscales',
    listColumns: ['id', 'internal_id', 'entity_id', 'status', 'error_message', 'created_at', 'updated_at'],
    sortableColumns: ['created_at', 'updated_at'],
    searchableColumns: ['internal_id', 'entity_id', 'status'],
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  payments: {
    key: 'payments',
    table: 'app_payments',
    idColumn: 'id',
    // Not NetSuite-sourced - a MercadoPago payment-gateway log written by the separate `payment`
    // project (same shared DB), so there's no sync watermark row for it. The list view uses a
    // dedicated repository (paymentsListRepository.ts) for the resolved contract name and
    // JSON_VALUE-based contract search; this plain config still backs the detail/summary paths.
    syncEntityName: null,
    label: 'Pagos',
    listColumns: [
      'id',
      'payment_id',
      'transaction_amount',
      'payer_email',
      'payment_method_id',
      'installments',
      'description',
      'status',
      'status_detail',
      'created_at',
    ],
    sortableColumns: ['created_at'],
    searchableColumns: ['payer_email', 'payment_id', 'description'],
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  vendors: {
    key: 'vendors',
    table: 'netsuite_vendors',
    idColumn: 'netsuite_id',
    syncEntityName: 'vendor',
    label: 'Proveedores',
    listColumns: ['netsuite_id', 'entityid', 'companyname', 'email', 'phone', 'subsidiary', 'isinactive', 'lastmodifieddate'],
    sortableColumns: ['companyname', 'entityid', 'lastmodifieddate'],
    searchableColumns: ['entityid', 'companyname', 'email'],
    defaultSort: { column: 'lastmodifieddate', dir: 'desc' },
    subsidiaryColumn: 'subsidiary',
  },
  'vendor-transactions': {
    key: 'vendor-transactions',
    table: 'netsuite_vendor_transactions',
    idColumn: 'netsuite_id',
    syncEntityName: 'vendorTransaction',
    // The list view uses a dedicated repository (vendorTransactionsListRepository.ts) for the
    // resolved vendor name, the "Orden de Pago" link, and the computed "Días Pendientes" - this
    // plain config still backs the detail/summary paths, same pattern as partidas/payments.
    label: 'Transacciones de Proveedores',
    listColumns: ['netsuite_id', 'tranid', 'entity_id', 'type', 'status', 'trandate', 'duedate', 'currency', 'total', 'foreigntotal', 'lastmodifieddate'],
    sortableColumns: ['trandate', 'duedate', 'total', 'lastmodifieddate'],
    searchableColumns: ['tranid'],
    defaultSort: { column: 'trandate', dir: 'desc' },
  },
};

const ENTITY_ORDER: ReportEntityKey[] = [
  'contracts',
  'customers',
  'family-members',
  'employees',
  'hospitals',
  'partidas',
  'services',
  'serial-numbers',
  'medicos',
  'medicos-colombia',
  'fiscal-updates',
  'payments',
  'vendors',
  'vendor-transactions',
];

export function getEntityConfig(key: string): EntityConfig | undefined {
  return Object.prototype.hasOwnProperty.call(ENTITY_REGISTRY, key)
    ? ENTITY_REGISTRY[key as ReportEntityKey]
    : undefined;
}

export function listEntityConfigs(): EntityConfig[] {
  return ENTITY_ORDER.map((key) => ENTITY_REGISTRY[key]);
}
