import type { ContractCommission, OtrosContratoCommission, VendedorCommissionGroup } from '../api/types';

export interface CommissionCurrencyTotal {
  /** NetSuite currency internal id, or null if the sale has none set. */
  currency: string | null;
  total: number;
}

function sumByCurrency<T>(items: T[], getCurrency: (item: T) => string | null, getAmount: (item: T) => number): CommissionCurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = getCurrency(item) ?? '';
    totals.set(key, (totals.get(key) ?? 0) + getAmount(item));
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
