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
