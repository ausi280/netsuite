import type { ContractCommission } from '../api/types';

export interface CommissionCurrencyTotal {
  /** NetSuite currency internal id, or null if the contract has none set. */
  currency: string | null;
  total: number;
}

/** Commission amounts are computed in each contract's own currency (services' precio_procesamiento,
 * the flat $100 anualidad bonus) - a single blended sum across contracts in different currencies
 * would be meaningless, so totals are always kept split by currency id, same convention as the
 * partidas/commissions pages already use elsewhere. */
export function sumCommissionByCurrency(contracts: ContractCommission[]): CommissionCurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const contract of contracts) {
    const key = contract.moneda ?? '';
    totals.set(key, (totals.get(key) ?? 0) + contract.total_commission);
  }
  return Array.from(totals.entries()).map(([currency, total]) => ({ currency: currency || null, total }));
}
