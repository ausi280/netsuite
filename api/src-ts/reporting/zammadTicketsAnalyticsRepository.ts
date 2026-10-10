import type { Knex } from 'knex';

/**
 * Zammad Tickets "Ver gráficos" - across every group (not just Postventa, see
 * postventaRepository.ts for that bespoke, group-scoped report). Counts per (year, month) for each
 * of the three lifecycle dates - creación, primera atención, cierre - tracked independently: unlike
 * Postventa's estado buckets, these do NOT partition a single total (one ticket contributes to all
 * three counts, in whatever month each event happened), so they're rendered as grouped bars, never
 * stacked.
 */

export interface ZammadTicketsFilters {
  /** YYYY-MM-DD, inclusive - filters on the ticket's own created_at_zammad, same convention as
   * postventaRepository.ts's PostventaFilters. */
  dateFrom?: string;
  dateTo?: string;
}

export interface ZammadTicketsMonthRow {
  anio: number;
  mes: number;
  creados: number;
  primeraAtencion: number;
  cerrados: number;
}

function exclusiveUpperBound(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function baseQuery(db: Knex, filters: ZammadTicketsFilters): Knex.QueryBuilder {
  const qb = db('zammad_tickets');
  if (filters.dateFrom) qb.andWhere('created_at_zammad', '>=', filters.dateFrom);
  if (filters.dateTo) qb.andWhere('created_at_zammad', '<', exclusiveUpperBound(filters.dateTo));
  return qb;
}

function bucketKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
}

/** Fetches the filtered set's three date columns and buckets them in JS - same rationale as
 * getPostventaByMonth: a few hundred to low thousands of rows, no need for a SQL GROUP BY, and it
 * guarantees this chart can never disagree with the grid about which month a ticket's dates fall
 * into. */
export async function getZammadTicketsByMonth(db: Knex, filters: ZammadTicketsFilters): Promise<ZammadTicketsMonthRow[]> {
  const rows = (await baseQuery(db, filters).select('created_at_zammad', 'first_response_at_zammad', 'close_at_zammad')) as Array<{
    created_at_zammad: Date | string | null;
    first_response_at_zammad: Date | string | null;
    close_at_zammad: Date | string | null;
  }>;

  const byMonth = new Map<string, ZammadTicketsMonthRow>();
  function bump(raw: Date | string | null, field: 'creados' | 'primeraAtencion' | 'cerrados') {
    if (!raw) return;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return;
    const key = bucketKey(date);
    const bucket = byMonth.get(key) ?? { anio: date.getUTCFullYear(), mes: date.getUTCMonth() + 1, creados: 0, primeraAtencion: 0, cerrados: 0 };
    bucket[field] += 1;
    byMonth.set(key, bucket);
  }

  for (const row of rows) {
    bump(row.created_at_zammad, 'creados');
    bump(row.first_response_at_zammad, 'primeraAtencion');
    bump(row.close_at_zammad, 'cerrados');
  }

  return Array.from(byMonth.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}
