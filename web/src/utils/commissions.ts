import type { ContractCommission, OtrosContratoCommission, VendedorCommissionGroup } from '../api/types';
import { formatCurrency } from './format';

/** Shown instead of a currency figure wherever a commission amount is null - always because the
 * caller has 'commissions' but not 'commissions_amounts' (see redactCommissionAmounts on the
 * backend), never because the amount is genuinely zero. Distinct from formatCurrency's generic
 * '—' (used for actually-missing data elsewhere) so a reviewer never mistakes "hidden" for "$0". */
export const HIDDEN_AMOUNT_LABEL = 'Oculto';

/** formatCurrency, except a null amount (redacted - see HIDDEN_AMOUNT_LABEL) renders as "Oculto"
 * instead of formatCurrency's own generic '—' (reserved for actually-missing data elsewhere). */
export function formatCommissionAmount(value: number | null, currencyId?: string | null): string {
  return value === null ? HIDDEN_AMOUNT_LABEL : formatCurrency(value, currencyId);
}

export interface CommissionCurrencyTotal {
  /** NetSuite currency internal id, or null if the sale has none set. */
  currency: string | null;
  /** Null when ANY item rolled into this currency bucket has a null amount (redacted) - never
   * silently summed as if it were 0, which would read as a real "pays nothing" total. */
  total: number | null;
}

function sumByCurrency<T>(items: T[], getCurrency: (item: T) => string | null, getAmount: (item: T) => number | null): CommissionCurrencyTotal[] {
  const totals = new Map<string, number | null>();
  for (const item of items) {
    const key = getCurrency(item) ?? '';
    const amount = getAmount(item);
    const existing = totals.get(key) ?? 0;
    totals.set(key, existing === null || amount === null ? null : existing + amount);
  }
  return Array.from(totals.entries()).map(([currency, total]) => ({ currency: currency || null, total }));
}

/** Commission amounts are computed in each sale's own currency (services' precio_procesamiento,
 * an otros-contrato's monto) - a single blended sum across sales in different currencies would be
 * meaningless, so totals are always kept split by currency id, same convention as the
 * partidas/commissions pages already use elsewhere. Contracts and otros-contratos are paid as two
 * separate transactions (per explicit instruction), so their sums are kept apart too - never
 * combined into one blended figure. */
export function sumContractsByCurrency(groups: Array<Pick<VendedorCommissionGroup, 'contracts'>>): CommissionCurrencyTotal[] {
  const allContracts = groups.flatMap((g) => g.contracts);
  return sumByCurrency<ContractCommission>(
    allContracts,
    (c) => c.moneda,
    (c) => c.total_commission,
  );
}

export function sumOtrosContratosByCurrency(groups: Array<Pick<VendedorCommissionGroup, 'otros_contratos'>>): CommissionCurrencyTotal[] {
  const allOtros = groups.flatMap((g) => g.otros_contratos);
  return sumByCurrency<OtrosContratoCommission>(
    allOtros,
    (o) => o.moneda,
    (o) => o.tier_commission,
  );
}
