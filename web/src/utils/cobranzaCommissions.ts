import type { AsignacionTipo, CobranzaCommissionContractGroup } from '../api/types';

// Mexico's IVA rate - custrecord_cryo_importepagado includes tax, per explicit instruction to
// accumulate the net-of-tax figure instead. Confirmed live only for Mexico-subsidiary records;
// NOT verified for other subsidiaries/currencies, which may use a different VAT rate (e.g.
// Argentina's IVA is 21%, not 16%) - applied uniformly here regardless, since no confirmed
// per-subsidiary rate exists yet.
const IVA_RATE = 0.16;
// custrecord_cryo_importepagado's own currency never matches the partida's catalog `moneda`
// (confirmed live: a partida priced at 65 USD showed importe_pagado 75.4 - exactly ×1.16, meaning
// that case truly was USD too, but other invoices show importe_pagado at a wildly different scale
// than their partida's nominal USD price, consistent with pesos) - bucketed under this fixed MXN
// id instead of `moneda`, per the user's explicit framing of this figure as "pesos". Not verified
// for non-Mexico subsidiaries, which may actually be ARS/COP/etc. instead.
export const IMPORTE_PAGADO_CURRENCY = '1';

/** custrecord_cryo_importepagado, net of IVA_RATE - null when the raw value is missing/unparseable. */
export function importePagadoNeto(importePagado: string | null): number | null {
  if (importePagado === null || importePagado === '') return null;
  const raw = Number(importePagado);
  return Number.isFinite(raw) ? raw / (1 + IVA_RATE) : null;
}

export interface AssigneeCurrencyTotal {
  /** NetSuite currency internal id, or null if the partida has none set. */
  currency: string | null;
  total: number;
}

export interface AssigneeSummary {
  /** The Dueño's/Cobrador's name, or the literal "Bolsa" / "Paquete inicial de anualidades" label. */
  name: string;
  tipo: AsignacionTipo;
  contractsCount: number;
  partidasCount: number;
  totals: AssigneeCurrencyTotal[];
}

/** One summary per (name, tipo) pair - grouped by BOTH, not just name, since the same person can be
 * credited as Dueño on one contract and as Cobrador on another, and those are different "roles"'
 * totals even when the name is identical (confirmed live: a contract's own Dueño and Cobrador are
 * sometimes the same employee). Kept split by moneda too, same convention as the vendedor
 * commissions page (utils/commissions.ts): a blended sum across different currencies would be
 * meaningless.
 *
 * The accumulated total is custrecord_cryo_importepagado (the invoice's own paid total, tax
 * included), net of IVA_RATE, per explicit instruction - NOT the partida's own nominal `importe`
 * catalog price. Since every partida on the same invoice repeats that invoice's same paid total,
 * it's deduped by `invoice_tranid` first (counted once per distinct invoice, not once per
 * partida) - confirmed necessary live: a multi-line invoice's partidas all carry that invoice's
 * one shared figure. Falls back to the partida's own `importe` (undeduped) when
 * `importe_pagado` is null, for partidas synced before that field was captured.
 *
 * Partidas flagged `es_paquete_inicial` (part of a contract's initial billing package, paid
 * alongside its procesamiento/enrollment fee) are skipped entirely here, per explicit instruction
 * - they're shown in the report for visibility, but don't count toward anyone's accumulated total. */
export function summarizeByAssignee(groups: CobranzaCommissionContractGroup[]): AssigneeSummary[] {
  const byKey = new Map<
    string,
    {
      name: string;
      tipo: AsignacionTipo;
      contractsCount: number;
      partidasCount: number;
      totals: Map<string, number>;
      seenInvoices: Set<string>;
    }
  >();

  for (const group of groups) {
    const key = `${group.asignado_tipo}:${group.asignado_a}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { name: group.asignado_a, tipo: group.asignado_tipo, contractsCount: 0, partidasCount: 0, totals: new Map(), seenInvoices: new Set() };
      byKey.set(key, entry);
    }
    entry.contractsCount += 1;

    for (const yearGroup of group.years) {
      for (const partida of yearGroup.partidas) {
        if (partida.es_paquete_inicial) continue;
        entry.partidasCount += 1;

        const net = importePagadoNeto(partida.importe_pagado);
        if (net !== null) {
          const invoiceKey = partida.invoice_tranid ?? partida.netsuite_id;
          if (entry.seenInvoices.has(invoiceKey)) continue;
          entry.seenInvoices.add(invoiceKey);
          entry.totals.set(IMPORTE_PAGADO_CURRENCY, (entry.totals.get(IMPORTE_PAGADO_CURRENCY) ?? 0) + net);
        } else {
          const currencyKey = partida.moneda ?? '';
          const amount = Number(partida.importe ?? 0);
          entry.totals.set(currencyKey, (entry.totals.get(currencyKey) ?? 0) + (Number.isFinite(amount) ? amount : 0));
        }
      }
    }
  }

  return Array.from(byKey.values()).map((entry) => ({
    name: entry.name,
    tipo: entry.tipo,
    contractsCount: entry.contractsCount,
    partidasCount: entry.partidasCount,
    totals: Array.from(entry.totals.entries()).map(([currency, total]) => ({ currency: currency || null, total })),
  }));
}
