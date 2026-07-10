export function toBool(value: unknown): boolean | null {
  if (value === true || value === 'T' || value === 'true') return true;
  if (value === false || value === 'F' || value === 'false') return false;
  return null;
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function toStringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

const DATE_ONLY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DATE_TIME = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/;

/**
 * NetSuite custom-record date/text fields (e.g. customrecord1184.lastmodified,
 * customrecord_cryo_familia.lastmodified) are rendered as account-locale text
 * via SuiteQL, not ISO — this repo's account formats them day-first
 * (`20/08/2025` can only be DD/MM/YYYY, since 20 isn't a valid month).
 * `toDate()` silently fails on these; use this instead for any such field.
 */
export function parseNetSuiteDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();

  const withTime = DATE_TIME.exec(trimmed);
  if (withTime) {
    const [, day, month, year, hour, minute, second, ampm] = withTime;
    let hours = Number(hour);
    if (ampm) {
      const isPm = ampm.toLowerCase() === 'pm';
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
    }
    const date = new Date(Number(year), Number(month) - 1, Number(day), hours, Number(minute), second ? Number(second) : 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const [, day, month, year] = dateOnly;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}
