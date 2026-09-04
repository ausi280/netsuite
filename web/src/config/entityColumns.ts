import type { ReportEntityKey } from '../api/types';

export type ColumnFormat = 'currency' | 'date' | 'datetime' | 'boolean' | 'boolean-inverted' | 'subsidiary' | 'partida-status' | 'vendor-transaction-type';

export interface EntityColumn {
  /** Raw column key as returned by the API. */
  key: string;
  /** Human-readable header shown in the table. */
  header: string;
  /** Optional value formatting hint applied when rendering the cell. */
  format?: ColumnFormat;
  /** Whether clicking the header should request server-side sorting on this column. */
  sortable?: boolean;
  /** For format:'currency' only - the row's sibling column holding the NetSuite currency id (e.g. custrecord_cryo_moneda), so the amount renders with its real currency instead of a guess. */
  currencyColumn?: string;
}

export interface EntityColumnConfig {
  label: string;
  columns: EntityColumn[];
  defaultSort?: {
    sortBy: string;
    sortDir: 'asc' | 'desc';
  };
  /** The row's unique-id field, used to build its detail-page link. Defaults to 'netsuite_id' -
   * only non-NetSuite-sourced tables (e.g. app_fiscal_info_updates, a plain autoincrement `id`) need to set this. */
  idColumn?: string;
}

export function getIdColumnKey(entityKey: ReportEntityKey): string {
  return entityColumns[entityKey].idColumn ?? 'netsuite_id';
}

export const entityColumns: Record<ReportEntityKey, EntityColumnConfig> = {
  contracts: {
    label: 'Contratos',
    columns: [
      { key: 'name', header: 'Nombre' },
      { key: 'custrecord_cryo_numerocontrato', header: 'No. Contrato' },
      { key: 'custrecord_cryo_titularcontrato', header: 'Titular' },
      { key: 'custrecord_cryo_estatus', header: 'Estatus' },
      { key: 'custrecord_cryo_saldo_inicial', header: 'Saldo Inicial', format: 'currency', currencyColumn: 'custrecord_cryo_moneda' },
      { key: 'custrecord_cryo_finicio', header: 'Fecha Inicio', format: 'date' },
      { key: 'custrecord_cryo_subsidiariacontrato', header: 'Subsidiaria', format: 'subsidiary' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate_dt', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate_dt', sortDir: 'desc' },
  },
  customers: {
    label: 'Clientes',
    columns: [
      { key: 'entityid', header: 'ID' },
      { key: 'companyname', header: 'Nombre' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Teléfono' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate', sortDir: 'desc' },
  },
  'family-members': {
    label: 'Familiares',
    columns: [
      { key: 'name', header: 'Nombre' },
      { key: 'custrecord_cryo_nombremiembro', header: 'Nombre Miembro' },
      { key: 'custrecord_cryo_parentesco', header: 'Parentesco' },
      { key: 'custrecord_cryo_titular', header: 'Titular' },
      { key: 'custrecord_cryo_fnacimiento', header: 'Fecha Nacimiento', format: 'date' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate_dt', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate_dt', sortDir: 'desc' },
  },
  employees: {
    label: 'Empleados',
    columns: [
      { key: 'entityid', header: 'ID' },
      { key: 'email', header: 'Email' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate', sortDir: 'desc' },
  },
  hospitals: {
    label: 'Hospitales',
    columns: [
      { key: 'name', header: 'Nombre' },
      { key: 'custrecord_hospitales_subsidiria', header: 'Subsidiaria', format: 'subsidiary' },
      { key: 'custrecord_cryo_provinciaarg', header: 'Provincia' },
      { key: 'custrecord_cryo_direccionhospital', header: 'Dirección' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate_dt', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate_dt', sortDir: 'desc' },
  },
  partidas: {
    label: 'Partidas',
    columns: [
      { key: 'name', header: 'Nombre' },
      { key: 'custrecord_cryo_concepto', header: 'Concepto' },
      { key: 'custrecord_cryo_estatuspartida', header: 'Estatus', format: 'partida-status' },
      { key: 'custrecord_cryo_importepartida', header: 'Importe', format: 'currency', currencyColumn: 'custrecord_cryo_monedapartida' },
      { key: 'custrecord_cryo_fechapartida', header: 'Fecha', format: 'date' },
      { key: 'custrecord_cryo_numcontrato', header: 'No. Contrato' },
      { key: 'contract_name', header: 'Contrato' },
      { key: 'dueno_nombre', header: 'Dueño' },
      { key: 'custrecord_cryo_subsidiaria_partida', header: 'Subsidiaria', format: 'subsidiary' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate_dt', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate_dt', sortDir: 'desc' },
  },
  services: {
    label: 'Servicios',
    columns: [
      { key: 'name', header: 'Nombre' },
      { key: 'custrecord_cryo_serviciocontratado', header: 'Servicio Contratado' },
      { key: 'custrecord_cryo_estatusservicio', header: 'Estatus' },
      { key: 'custrecord_cryo_costoanualidad', header: 'Costo Anualidad', format: 'currency', currencyColumn: 'custrecord_cryo_monedaserv' },
      { key: 'custrecord_cryo_idcontrato', header: 'Contrato' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate_dt', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate_dt', sortDir: 'desc' },
  },
  'serial-numbers': {
    label: 'Números de Serie',
    columns: [
      { key: 'inventory_number', header: 'No. Serie' },
      { key: 'item_netsuite_id', header: 'Item' },
      { key: 'item_subsidiary_id', header: 'Subsidiaria', format: 'subsidiary' },
      { key: 'lastmodifieddate_dt', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate_dt', sortDir: 'desc' },
  },
  'fiscal-updates': {
    label: 'Actualizaciones Fiscales',
    idColumn: 'id',
    columns: [
      { key: 'internal_id', header: 'ID Interno' },
      { key: 'entity_id', header: 'Cliente' },
      { key: 'status', header: 'Estatus' },
      { key: 'error_message', header: 'Error' },
      { key: 'created_at', header: 'Creado', format: 'datetime', sortable: true },
      { key: 'updated_at', header: 'Actualizado', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'created_at', sortDir: 'desc' },
  },
  payments: {
    label: 'Pagos',
    idColumn: 'id',
    // The list itself renders via a dedicated PaymentsHistoryPage (search/pagination/status
    // badges/cobro domiciliado action) - these columns only back the generic detail-page fallback
    // when a row is clicked (raw payloadRequest/Response as JSON text, same as fiscal-updates).
    columns: [
      { key: 'payment_id', header: 'ID Pago' },
      { key: 'description', header: 'Descripción' },
      { key: 'transaction_amount', header: 'Monto', format: 'currency' },
      { key: 'payer_email', header: 'Email' },
      { key: 'payment_method_id', header: 'Método' },
      { key: 'status', header: 'Estatus' },
      { key: 'created_at', header: 'Fecha', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'created_at', sortDir: 'desc' },
  },
  vendors: {
    label: 'Proveedores',
    columns: [
      { key: 'entityid', header: 'ID' },
      { key: 'companyname', header: 'Nombre' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Teléfono' },
      { key: 'subsidiary', header: 'Subsidiaria', format: 'subsidiary' },
      { key: 'isinactive', header: 'Activo', format: 'boolean-inverted' },
      { key: 'lastmodifieddate', header: 'Última Modificación', format: 'datetime', sortable: true },
    ],
    defaultSort: { sortBy: 'lastmodifieddate', sortDir: 'desc' },
  },
  'vendor-transactions': {
    label: 'Transacciones de Proveedores',
    columns: [
      { key: 'vendor_name', header: 'Proveedor' },
      { key: 'tranid', header: 'Número de Documento' },
      { key: 'type', header: 'Tipo', format: 'vendor-transaction-type' },
      { key: 'trandate', header: 'Fecha', format: 'date', sortable: true },
      { key: 'duedate', header: 'Fecha Vencimiento', format: 'date', sortable: true },
      { key: 'total', header: 'Importe', format: 'currency', currencyColumn: 'currency', sortable: true },
      { key: 'status', header: 'Estado' },
      { key: 'orden_pago', header: 'Orden de Pago' },
      { key: 'dias_pendientes', header: 'Días Pendientes' },
    ],
    defaultSort: { sortBy: 'trandate', sortDir: 'desc' },
  },
};

/** The column key holding the subsidiary id for this entity, or null if it isn't filterable by subsidiary. */
export function getSubsidiaryColumnKey(entityKey: ReportEntityKey): string | null {
  const column = entityColumns[entityKey].columns.find((c) => c.format === 'subsidiary');
  return column?.key ?? null;
}

/** Order in which entity tiles are displayed on the dashboard - matches the backend contract. */
export const entityOrder: ReportEntityKey[] = [
  'contracts',
  'customers',
  'family-members',
  'employees',
  'hospitals',
  'partidas',
  'services',
  'serial-numbers',
  'fiscal-updates',
  'payments',
  'vendors',
  'vendor-transactions',
];
