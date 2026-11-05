import type { AsignacionTipo, CobranzaCommissionContractGroup } from '../api/types';

// Mexico's IVA rate - the invoice's own `total` (importe_pagado) includes tax, per explicit
// instruction to accumulate the net-of-tax figure instead. Confirmed live only for Mexico-
// subsidiary records; NOT verified for other subsidiaries/currencies, which may use a different
// VAT rate (e.g. Argentina's IVA is 21%, not 16%) - applied uniformly here regardless, since no
// confirmed per-subsidiary rate exists yet.
const IVA_RATE = 0.16;
// The invoice total's own currency never matches the partida's catalog `moneda` (confirmed live: a
// partida priced at 65 USD showed an invoice total of 75.4 - exactly ×1.16, meaning that case truly
// was USD too, but other invoices show their total at a wildly different scale than their partida's
// nominal USD price, consistent with pesos) - bucketed under this fixed MXN id instead of `moneda`,
// per the user's explicit framing of this figure as "pesos". Not verified for non-Mexico
// subsidiaries, which may actually be ARS/COP/etc. instead.
export const IMPORTE_PAGADO_CURRENCY = '1';

/** The invoice's own total, net of IVA_RATE - null when the raw value is missing/unparseable. */
export function importePagadoNeto(importePagado: string | number | null): number | null {
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
  /** For the two shared pools (Bolsa, Bolsa Domiciliado), which subsidiaria's pool this is - each
   * subsidiaria has its own. Null for everything else. */
  subsidiaria: string | null;
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
      subsidiaria: string | null;
      contractsCount: number;
      partidasCount: number;
      totals: Map<string, number>;
      seenInvoices: Set<string>;
    }
  >();

  for (const group of groups) {
    const isPool = group.asignado_tipo === 'bolsa' || group.asignado_tipo === 'bolsa_domiciliado';
    const subsidiaria = isPool ? group.subsidiaria_id : null;
    const key = `${group.asignado_tipo}:${group.asignado_a}:${subsidiaria ?? ''}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        name: group.asignado_a,
        tipo: group.asignado_tipo,
        subsidiaria,
        contractsCount: 0,
        partidasCount: 0,
        totals: new Map(),
        seenInvoices: new Set(),
      };
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
    subsidiaria: entry.subsidiaria,
    contractsCount: entry.contractsCount,
    partidasCount: entry.partidasCount,
    totals: Array.from(entry.totals.entries()).map(([currency, total]) => ({ currency: currency || null, total })),
  }));
}

/** Net-of-IVA collected (MXN) per resolved Dueño/Cobrador employee id - the progress figure their
 * monthly goal is measured against. Per person, not per (person, role): a goal belongs to the
 * person, so what they collected as Dueño and as Cobrador both count toward it. Same rules as
 * summarizeByAssignee - es_paquete_inicial partidas skipped, deduped by invoice - but only the
 * IMPORTE_PAGADO_CURRENCY figure counts; a partida with no invoice total (the nominal-`importe`
 * fallback there, in arbitrary currencies) can't be summed into an MXN goal. */
export function collectedByEmployee(groups: CobranzaCommissionContractGroup[]): Map<string, number> {
  const totals = new Map<string, number>();
  const seenInvoices = new Map<string, Set<string>>();

  for (const group of groups) {
    if (!group.asignado_id) continue;
    let seen = seenInvoices.get(group.asignado_id);
    if (!seen) {
      seen = new Set();
      seenInvoices.set(group.asignado_id, seen);
    }

    for (const yearGroup of group.years) {
      for (const partida of yearGroup.partidas) {
        if (partida.es_paquete_inicial) continue;
        const net = importePagadoNeto(partida.importe_pagado);
        if (net === null) continue;
        const invoiceKey = partida.invoice_tranid ?? partida.netsuite_id;
        if (seen.has(invoiceKey)) continue;
        seen.add(invoiceKey);
        totals.set(group.asignado_id, (totals.get(group.asignado_id) ?? 0) + net);
      }
    }
  }

  return totals;
}

/** Net-of-IVA collected (MXN) by one of the shared pools, same rules as collectedByEmployee -
 * optionally only one subsidiaria's contracts. Pools are split per subsidiaria, between that
 * subsidiaria's people (see homeSubsidiaryByEmployee): the "Bolsa Domiciliado" equally between
 * everyone with a monthly goal, on top of what each collected themselves (see
 * CobranzaGoalsSection); the "Bolsa" only between those who reached 70% of it, by recovered
 * accounts (see BolsaSection). */
export function bolsaCollected(groups: CobranzaCommissionContractGroup[], tipo: 'bolsa' | 'bolsa_domiciliado', subsidiaria?: string): number {
  let total = 0;
  const seen = new Set<string>();
  for (const group of groups) {
    if (group.asignado_tipo !== tipo) continue;
    if (subsidiaria !== undefined && group.subsidiaria_id !== subsidiaria) continue;
    for (const yearGroup of group.years) {
      for (const partida of yearGroup.partidas) {
        if (partida.es_paquete_inicial) continue;
        const net = importePagadoNeto(partida.importe_pagado);
        if (net === null) continue;
        const invoiceKey = partida.invoice_tranid ?? partida.netsuite_id;
        if (seen.has(invoiceKey)) continue;
        seen.add(invoiceKey);
        total += net;
      }
    }
  }
  return total;
}

/** Subsidiarias that have money in either shared pool this month. */
export function bolsaSubsidiarias(groups: CobranzaCommissionContractGroup[]): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    if ((group.asignado_tipo === 'bolsa' || group.asignado_tipo === 'bolsa_domiciliado') && group.subsidiaria_id) ids.add(group.subsidiaria_id);
  }
  return Array.from(ids).sort();
}

/** The subsidiaria each Dueño/Cobrador employee works in - where most of what they collected this
 * month (net MXN, same rules as collectedByEmployee) comes from. It decides whose pools they share
 * in. Someone who collected nothing this month has no entry. */
export function homeSubsidiaryByEmployee(groups: CobranzaCommissionContractGroup[]): Map<string, string> {
  const bySub = new Map<string, Map<string, number>>();
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group.asignado_id || !group.subsidiaria_id) continue;
    for (const yearGroup of group.years) {
      for (const partida of yearGroup.partidas) {
        if (partida.es_paquete_inicial) continue;
        const net = importePagadoNeto(partida.importe_pagado);
        if (net === null) continue;
        const key = `${group.asignado_id}|${partida.invoice_tranid ?? partida.netsuite_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const totals = bySub.get(group.asignado_id) ?? new Map<string, number>();
        totals.set(group.subsidiaria_id, (totals.get(group.subsidiaria_id) ?? 0) + net);
        bySub.set(group.asignado_id, totals);
      }
    }
  }
  const home = new Map<string, string>();
  for (const [employeeId, totals] of bySub) {
    const [top] = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    if (top) home.set(employeeId, top[0]);
  }
  return home;
}

const DDMMYYYY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Month index (year × 12 + month - 1) of a NetSuite "DD/MM/YYYY" date, or null. */
function monthIndexOf(value: string | null): number | null {
  const match = value ? DDMMYYYY.exec(value.trim()) : null;
  return match ? Number(match[3]) * 12 + Number(match[2]) - 1 : null;
}

export interface YearMonth {
  month: number;
  year: number;
}

/** "Recovered accounts" per Dueño/Cobrador employee id: contracts credited to them in this month's
 * report that were already overdue - at least one of their paid partidas was due in one of
 * `dueMonths`. Returned as a count per entry of `dueMonths`; a contract counts once, in the
 * earliest of those months it owed (so the per-month counts add up to its total). Paquete inicial
 * partidas are skipped, same as collectedByEmployee. */
export function recoveredAccountsByEmployee(groups: CobranzaCommissionContractGroup[], dueMonths: YearMonth[]): Map<string, number[]> {
  const targets = dueMonths.map((m) => m.year * 12 + m.month - 1);
  const counts = new Map<string, number[]>();
  for (const group of groups) {
    if (!group.asignado_id) continue;
    let earliest = -1;
    for (const yearGroup of group.years) {
      for (const partida of yearGroup.partidas) {
        if (partida.es_paquete_inicial) continue;
        const position = targets.indexOf(monthIndexOf(partida.fecha_limite_pago) ?? -1);
        if (position !== -1 && (earliest === -1 || position < earliest)) earliest = position;
      }
    }
    if (earliest === -1) continue;
    const perMonth = counts.get(group.asignado_id) ?? targets.map(() => 0);
    perMonth[earliest] += 1;
    counts.set(group.asignado_id, perMonth);
  }
  return counts;
}

/** Minimum % of the monthly goal (own collections + Bolsa Domiciliado share) needed to take part in
 * a subsidiaria's Bolsa split. */
export const BOLSA_MIN_PCT = 70;
/** Which due months make a paid account "recovered", with the report month as month 1: months 4, 5
 * and 6 back - e.g. in October, debt that was due in May, June or July. */
const RECOVERY_MONTH_OFFSETS = [5, 4, 3] as const;

function shiftMonth(month: number, year: number, back: number): YearMonth {
  const index = year * 12 + (month - 1) - back;
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

/** The due months whose debt counts as "recovered" in the given report month. */
export function recoveryDueMonths(month: number, year: number): YearMonth[] {
  return RECOVERY_MONTH_OFFSETS.map((back) => shiftMonth(month, year, back));
}

export interface BolsaSplitPerson {
  employee_id: string;
  nombre: string;
  /** % of their goal reached, Bolsa Domiciliado share included - null when they have no goal. */
  pct: number | null;
}

export interface BolsaSplitRow extends BolsaSplitPerson {
  qualifies: boolean;
  /** Recovered accounts per entry of the due months. */
  perMonth: number[];
  accounts: number;
  share: number | null;
  amount: number | null;
}

export interface BolsaSplit {
  /** The subsidiaria's Bolsa (net of IVA, MXN). */
  bolsa: number;
  bolsaContracts: number;
  dueMonths: YearMonth[];
  rows: BolsaSplitRow[];
  totalAccounts: number;
  qualifiedCount: number;
}

/** One subsidiaria's "Bolsa" split: only its people who reached BOLSA_MIN_PCT of their goal take
 * part, divided in proportion to the overdue accounts each recovered THIS month in that subsidiaria
 * (see recoveredAccountsByEmployee / recoveryDueMonths). `people` should be everyone with a goal in
 * that subsidiaria - shares are computed over all of them. */
export function splitBolsa(
  groups: CobranzaCommissionContractGroup[],
  subsidiaria: string,
  people: BolsaSplitPerson[],
  month: number,
  year: number,
): BolsaSplit {
  const dueMonths = recoveryDueMonths(month, year);
  const subGroups = groups.filter((g) => g.subsidiaria_id === subsidiaria);
  const bolsa = bolsaCollected(subGroups, 'bolsa');
  const recovered = recoveredAccountsByEmployee(subGroups, dueMonths);
  const base = people.map((person) => {
    const perMonth = recovered.get(person.employee_id) ?? dueMonths.map(() => 0);
    return {
      ...person,
      qualifies: person.pct !== null && person.pct >= BOLSA_MIN_PCT,
      perMonth,
      accounts: perMonth.reduce((sum, n) => sum + n, 0),
    };
  });
  const totalAccounts = base.filter((r) => r.qualifies).reduce((sum, r) => sum + r.accounts, 0);
  const rows: BolsaSplitRow[] = base.map((r) => {
    const share = r.qualifies && totalAccounts > 0 ? r.accounts / totalAccounts : null;
    return { ...r, share, amount: share === null ? null : share * bolsa };
  });
  rows.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || (b.amount ?? 0) - (a.amount ?? 0) || (b.pct ?? -1) - (a.pct ?? -1));
  return {
    bolsa,
    bolsaContracts: subGroups.filter((g) => g.asignado_tipo === 'bolsa').length,
    dueMonths,
    rows,
    totalAccounts,
    qualifiedCount: base.filter((r) => r.qualifies).length,
  };
}
