import type { CurrencyRow } from '../repositories/currencyRepository';
import { toBool, toNumber, toStringOrNull } from './utils';

/** Today's date in Mexico City (YYYY-MM-DD) - NetSuite's daily rate update follows the MXN base. */
function mexicoCityDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(now);
}

export function mapCurrency(raw: Record<string, any>, now: Date = new Date()): CurrencyRow {
  return {
    netsuite_id: String(raw.id),
    name: toStringOrNull(raw.name),
    symbol: toStringOrNull(raw.symbol),
    isbasecurrency: toBool(raw.isbasecurrency),
    isinactive: toBool(raw.isinactive),
    exchangerate: toNumber(raw.exchangerate),
    raw_data: JSON.stringify(raw),
    rate_date: mexicoCityDate(now),
  };
}
