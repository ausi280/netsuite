/**
 * NetSuite currency internal ids -> ISO 4217 codes, confirmed against the account's real
 * currency list (Setup > Accounting > Currencies). Contracts/partidas/services each carry their
 * own currency id (custrecord_cryo_moneda / _monedapartida / _monedaserv) - amounts must never be
 * assumed to be a single currency, since this account mixes MXN/USD/EUR/COP/ARS/PEN/BRL.
 */
const CURRENCY_ISO_CODES: Record<string, string> = {
  '1': 'MXN',
  '2': 'USD',
  '4': 'EUR',
  '6': 'COP',
  '8': 'ARS',
  '9': 'PEN',
  '10': 'BRL',
};

const CURRENCY_NAMES: Record<string, string> = {
  '1': 'Peso Mexicano',
  '2': 'US Dollar',
  '4': 'Euro',
  '6': 'Peso Colombiano',
  '8': 'Peso Argentino',
  '9': 'Sol Peruano',
  '10': 'Real Brasileño',
};

/** Every currency id we have a real ISO code for - used to build filter dropdowns without a distinct-values query. */
export const KNOWN_CURRENCY_IDS: string[] = Object.keys(CURRENCY_ISO_CODES);

export function currencyIsoCode(id: string | null | undefined): string | null {
  if (!id) return null;
  return CURRENCY_ISO_CODES[id] ?? null;
}

export function currencyLabel(id: string | null | undefined): string {
  if (!id) return '—';
  const name = CURRENCY_NAMES[id];
  const iso = CURRENCY_ISO_CODES[id];
  if (name && iso) return `${iso} - ${name}`;
  return `Moneda ${id}`;
}
