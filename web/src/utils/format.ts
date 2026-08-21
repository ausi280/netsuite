import type { ColumnFormat } from '../config/entityColumns';
import { subsidiaryLabel } from '../config/subsidiaries';

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 't' || normalized === '1' || normalized === 'yes';
  }
  return Boolean(value);
}

export function formatCurrency(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return currencyFormatter.format(numeric);
}

export function formatDate(value: unknown): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : '—';
}

export function formatDateTime(value: unknown): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function formatBoolean(value: unknown, inverted = false): string {
  const truthy = isTruthy(value);
  const displayValue = inverted ? !truthy : truthy;
  return displayValue ? 'Sí' : 'No';
}

export function formatCellValue(value: unknown, format?: ColumnFormat): string {
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'date':
      return formatDate(value);
    case 'datetime':
      return formatDateTime(value);
    case 'boolean':
      return formatBoolean(value, false);
    case 'boolean-inverted':
      return formatBoolean(value, true);
    case 'subsidiary':
      return value === null || value === undefined || value === '' ? '—' : subsidiaryLabel(String(value));
    default:
      if (value === null || value === undefined || value === '') return '—';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}

/** Relative "hace X" label for the dashboard tiles' "last synced" line. */
export function formatRelativeTime(value: string | null): string {
  const date = toDate(value);
  if (!date) return 'Sin sincronizar aún';

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.round(diffMs / 1000);

  if (diffSeconds < 0) return 'hace un momento';
  if (diffSeconds < 60) return 'hace unos segundos';

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays} d`;

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `hace ${diffMonths} mes${diffMonths === 1 ? '' : 'es'}`;

  const diffYears = Math.round(diffMonths / 12);
  return `hace ${diffYears} año${diffYears === 1 ? '' : 's'}`;
}

/** Best-effort humanization of raw column keys (snake_case, custrecord_ prefixes) for the detail page. */
export function humanizeKey(key: string): string {
  let label = key;
  if (label.startsWith('custrecord_')) label = label.slice('custrecord_'.length);
  if (label.startsWith('cryo_')) label = label.slice('cryo_'.length);
  label = label.replace(/_dt$/, '');
  label = label.replace(/[_-]+/g, ' ').trim();
  if (!label) return key;
  return label
    .split(' ')
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}
