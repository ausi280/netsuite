// Small, server-side duplicates of the label maps already used to render these same columns in
// the web app (web/src/config/{subsidiaries,currencies,labels}.ts) - kept minimal and duplicated
// rather than shared, since api/ and web/ are separate packages with no shared-code path today.
// Only the columns actually exported need a label; anything else is passed through as-is.

const SUBSIDIARY_LABELS: Record<string, string> = {
  '20': 'Biocordcell Argentina',
  '7': 'Células de Cordón Umbilical',
  '5': 'Cryo-Cell de México',
  '8': 'Operadora BSCU',
  '24': 'Instituto de Criopreservación y Terapia Celular',
  '25': 'Lazo de Vida',
};

const CURRENCY_LABELS: Record<string, string> = {
  '1': 'MXN',
  '2': 'USD',
  '4': 'EUR',
  '6': 'COP',
  '8': 'ARS',
  '9': 'PEN',
  '10': 'BRL',
};

const PARTIDA_STATUS_LABELS: Record<string, string> = {
  '1': 'Pagado',
  '2': 'Parcialmente pagado',
  '3': 'Pendiente',
  '4': 'Vencido',
};

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  '1': 'Activo',
  '7': 'Cancelado',
  '8': 'Suspendido',
  '11': 'Disposición',
  '13': 'Retirado del Tanque',
};

/** Column name -> label map, for every synced column that holds a NetSuite list/lookup id across all exportable entities. */
const LOOKUP_COLUMNS: Record<string, Record<string, string>> = {
  custrecord_cryo_subsidiariacontrato: SUBSIDIARY_LABELS,
  custrecord_cryo_subsidiaria_partida: SUBSIDIARY_LABELS,
  custrecord_hospitales_subsidiria: SUBSIDIARY_LABELS,
  item_subsidiary_id: SUBSIDIARY_LABELS,
  custrecord_cryo_subsidiariamedico: SUBSIDIARY_LABELS,
  custrecord_cryo_moneda: CURRENCY_LABELS,
  custrecord_cryo_monedapartida: CURRENCY_LABELS,
  custrecord_cryo_monedaserv: CURRENCY_LABELS,
  custrecord_cryo_estatuspartida: PARTIDA_STATUS_LABELS,
  custrecord_cryo_estatus: CONTRACT_STATUS_LABELS,
};

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === 't' || normalized === '1';
}

/** Same formatting the web table applies to these columns, reimplemented here since the export runs entirely server-side. */
export function formatExportValue(column: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (column === 'isinactive') {
    return isTruthyFlag(value) ? 'Inactivo' : 'Activo';
  }

  const lookup = LOOKUP_COLUMNS[column];
  if (lookup) {
    const label = lookup[String(value)];
    if (label) return label;
  }

  // lastmodifieddate(_dt) columns come back from the mssql driver as real Date objects (unlike
  // the raw NetSuite text date columns, which are already plain "DD/MM/YYYY" strings) - must be
  // checked before the generic object branch, or JSON.stringify would quote-wrap the ISO string.
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Columns that don't follow the custrecord_/cryo_ naming convention (joined-in columns added for
 * a specific entity's export, e.g. partidas' enriched contract/dueño columns) get an explicit
 * header instead of being run through the generic humanizer. */
const HEADER_OVERRIDES: Record<string, string> = {
  contract_name: 'Contrato',
  dueno_nombre: 'Dueño',
};

/** Strips the custrecord_/cryo_ prefixes and title-cases, matching the web app's humanizeKey(). */
export function humanizeColumnName(column: string): string {
  if (HEADER_OVERRIDES[column]) return HEADER_OVERRIDES[column];

  let label = column;
  if (label.startsWith('custrecord_')) label = label.slice('custrecord_'.length);
  if (label.startsWith('cryo_')) label = label.slice('cryo_'.length);
  label = label.replace(/_dt$/, '');
  label = label.replace(/[_-]+/g, ' ').trim();
  if (!label) return column;
  return label
    .split(' ')
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** RFC 4180 field escaping: quote whenever the value contains a comma, quote, or newline, doubling any embedded quotes. */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function csvRow(values: string[]): string {
  return values.map(csvEscape).join(',') + '\r\n';
}
