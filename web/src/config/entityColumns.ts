import type { ReportEntityKey } from '../api/types';

export type ColumnFormat = 'currency' | 'date' | 'datetime' | 'boolean' | 'boolean-inverted' | 'subsidiary';

export interface EntityColumn {
  /** Raw column key as returned by the API. */
  key: string;
  /** Human-readable header shown in the table. */
  header: string;
  /** Optional value formatting hint applied when rendering the cell. */
  format?: ColumnFormat;
  /** Whether clicking the header should request server-side sorting on this column. */
  sortable?: boolean;
}

export interface EntityColumnConfig {
  label: string;
  columns: EntityColumn[];
  defaultSort?: {
    sortBy: string;
    sortDir: 'asc' | 'desc';
  };
}

export const entityColumns: Record<ReportEntityKey, EntityColumnConfig> = {
  contracts: {
    label: 'Contratos',
    columns: [
      { key: 'name', header: 'Nombre' },
      { key: 'custrecord_cryo_numerocontrato', header: 'No. Contrato' },
      { key: 'custrecord_cryo_titularcontrato', header: 'Titular' },
      { key: 'custrecord_cryo_estatus', header: 'Estatus' },
      { key: 'custrecord_cryo_saldo_inicial', header: 'Saldo Inicial', format: 'currency' },
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
      { key: 'custrecord_cryo_estatuspartida', header: 'Estatus' },
      { key: 'custrecord_cryo_importepartida', header: 'Importe', format: 'currency' },
      { key: 'custrecord_cryo_fechapartida', header: 'Fecha', format: 'date' },
      { key: 'custrecord_cryo_numcontrato', header: 'No. Contrato' },
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
      { key: 'custrecord_cryo_costoanualidad', header: 'Costo Anualidad', format: 'currency' },
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
];
