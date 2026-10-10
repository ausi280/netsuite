import type { Knex } from 'knex';

/**
 * Postventa status tiles - zammad_tickets rows in the "Postventa" group only (after-sales customer
 * requests: satisfacción, información de muestra, reembolsos - see
 * logistica-tickets-relay/zammad-relay.php's Postventa form), bucketed into exactly one of four
 * mutually-exclusive statuses, per explicit instruction:
 *
 * - Nuevo: no owner (owner_id = SIN_OWNER_ID, Zammad's sentinel "-" unassigned account) AND not
 *   already Cerrado/Resuelto - confirmed live that an unassigned ticket CAN already be closed (17
 *   of 22 unassigned Postventa tickets were Cerrado), which would otherwise double-count into both
 *   "Nuevo" and "Cerrado" - excluded here so the four buckets partition the filtered set cleanly.
 * - En Proceso: has a real owner AND not Cerrado/Resuelto.
 * - Cerrado / Resuelto: state_name = 'Cerrado' / 'Resuelto' respectively, regardless of owner.
 *
 * `estadoResumen` (below) is the single source of truth for this classification - the tile
 * summary, the by-month chart, and the detail table/export all call it, so there's no risk of the
 * three ever disagreeing about which bucket a given ticket falls into.
 *
 * Filterable by date range (the ticket's own created_at_zammad - when it was filed) and by one
 * owner (the real agent, never the SIN_OWNER_ID sentinel - see getPostventaOwnerOptions).
 */

const POSTVENTA_GROUP = 'Postventa';
// Zammad's own sentinel for "no owner assigned" - a real row in Zammad's User table (id 1, name
// "-"), not a null/empty value - confirmed live against production zammad_tickets.
const SIN_OWNER_ID = '1';

export type PostventaEstado = 'nuevo' | 'enProceso' | 'cerrado' | 'resuelto';

export function estadoResumen(ownerId: string | null, stateName: string | null): PostventaEstado {
  if (stateName === 'Cerrado') return 'cerrado';
  if (stateName === 'Resuelto') return 'resuelto';
  return !ownerId || ownerId === SIN_OWNER_ID ? 'nuevo' : 'enProceso';
}

export const ESTADO_RESUMEN_LABELS: Record<PostventaEstado, string> = {
  nuevo: 'Nuevo',
  enProceso: 'En Proceso',
  cerrado: 'Cerrado',
  resuelto: 'Resuelto',
};

export interface PostventaFilters {
  /** YYYY-MM-DD, inclusive - filters on the ticket's own created_at_zammad. */
  dateFrom?: string;
  /** YYYY-MM-DD, inclusive. */
  dateTo?: string;
  ownerId?: string;
}

export interface PostventaSummary {
  nuevos: number;
  enProceso: number;
  cerrados: number;
  resueltos: number;
}

export interface PostventaOwnerOption {
  owner_id: string;
  owner_name: string;
}

export interface PostventaMonthRow {
  anio: number;
  mes: number;
  nuevos: number;
  enProceso: number;
  cerrados: number;
  resueltos: number;
}

export interface PostventaTicketRow {
  id: number;
  number: string | null;
  title: string | null;
  asunto: string | null;
  state_name: string | null;
  priority_name: string | null;
  owner_name: string | null;
  customer_email: string | null;
  foliocontrato: string | null;
  telefono: string | null;
  empresa: string | null;
  created_at_zammad: Date | null;
  first_response_at_zammad: Date | null;
  close_at_zammad: Date | null;
  updated_at_zammad: Date | null;
  /** Derived via estadoResumen() above - not a real zammad_tickets column. */
  estado_resumen: PostventaEstado;
}

interface RawTicketRow {
  id: number;
  number: string | null;
  title: string | null;
  asunto: string | null;
  state_name: string | null;
  priority_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  customer_email: string | null;
  foliocontrato: string | null;
  telefono: string | null;
  empresa: string | null;
  created_at_zammad: Date | null;
  first_response_at_zammad: Date | null;
  close_at_zammad: Date | null;
  updated_at_zammad: Date | null;
}

function toTicketRow(raw: RawTicketRow): PostventaTicketRow {
  const { owner_id, ...rest } = raw;
  return { ...rest, estado_resumen: estadoResumen(owner_id, raw.state_name) };
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function clampPage(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function clampPageSize(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

/** Next-day exclusive upper bound - same convention as prospectosRepository.ts's
 * exclusiveUpperBound, needed since created_at_zammad is a real datetime column. */
function exclusiveUpperBound(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function baseQuery(db: Knex, filters: PostventaFilters): Knex.QueryBuilder {
  const qb = db('zammad_tickets').where('group_name', POSTVENTA_GROUP);
  if (filters.dateFrom) qb.andWhere('created_at_zammad', '>=', filters.dateFrom);
  if (filters.dateTo) qb.andWhere('created_at_zammad', '<', exclusiveUpperBound(filters.dateTo));
  if (filters.ownerId) qb.andWhere('owner_id', filters.ownerId);
  return qb;
}

async function countOf(qb: Knex.QueryBuilder): Promise<number> {
  const row = (await qb.count('* as n').first()) as { n: number | string } | undefined;
  return Number(row?.n ?? 0);
}

export async function getPostventaSummary(db: Knex, filters: PostventaFilters): Promise<PostventaSummary> {
  const [nuevos, enProceso, cerrados, resueltos] = await Promise.all([
    countOf(baseQuery(db, filters).where('owner_id', SIN_OWNER_ID).whereNotIn('state_name', ['Cerrado', 'Resuelto'])),
    countOf(baseQuery(db, filters).whereNot('owner_id', SIN_OWNER_ID).whereNotIn('state_name', ['Cerrado', 'Resuelto'])),
    countOf(baseQuery(db, filters).where('state_name', 'Cerrado')),
    countOf(baseQuery(db, filters).where('state_name', 'Resuelto')),
  ]);

  return { nuevos, enProceso, cerrados, resueltos };
}

/** Distinct real owners (excluding the SIN_OWNER_ID sentinel) who have ever owned a Postventa
 * ticket - for the owner filter dropdown. Unfiltered by date range deliberately, same as every
 * other dropdown-options query in this app - the dropdown's own option list shouldn't shrink/grow
 * as the caller changes the date filter they're about to apply. */
export async function getPostventaOwnerOptions(db: Knex): Promise<PostventaOwnerOption[]> {
  return db('zammad_tickets')
    .where('group_name', POSTVENTA_GROUP)
    .whereNot('owner_id', SIN_OWNER_ID)
    .whereNotNull('owner_id')
    .distinct('owner_id', 'owner_name')
    .orderBy('owner_name') as unknown as Promise<PostventaOwnerOption[]>;
}

/** Every matching ticket's (year, month of created_at_zammad) + owner_id + state_name, aggregated
 * into the four-bucket counts in JS via estadoResumen() - not a SQL GROUP BY, unlike
 * tareasVencidasRepository.ts's ~118k-row equivalent. Postventa's whole table is a few hundred rows
 * (175 at last count), so fetching the filtered set and bucketing here is simpler and guarantees
 * this chart can never disagree with getPostventaSummary/getPostventaPaged about which bucket a
 * ticket falls into. */
export async function getPostventaByMonth(db: Knex, filters: PostventaFilters): Promise<PostventaMonthRow[]> {
  const rows = (await baseQuery(db, filters).select('created_at_zammad', 'owner_id', 'state_name')) as Array<{
    created_at_zammad: Date | string | null;
    owner_id: string | null;
    state_name: string | null;
  }>;

  const byMonth = new Map<string, PostventaMonthRow>();
  for (const row of rows) {
    if (!row.created_at_zammad) continue;
    const date = new Date(row.created_at_zammad);
    if (Number.isNaN(date.getTime())) continue;

    const anio = date.getUTCFullYear();
    const mes = date.getUTCMonth() + 1;
    const key = `${anio}-${mes}`;
    const bucket = byMonth.get(key) ?? { anio, mes, nuevos: 0, enProceso: 0, cerrados: 0, resueltos: 0 };

    switch (estadoResumen(row.owner_id, row.state_name)) {
      case 'nuevo':
        bucket.nuevos += 1;
        break;
      case 'enProceso':
        bucket.enProceso += 1;
        break;
      case 'cerrado':
        bucket.cerrados += 1;
        break;
      case 'resuelto':
        bucket.resueltos += 1;
        break;
    }
    byMonth.set(key, bucket);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

export interface PostventaResueltoMonthRow {
  anio: number;
  mes: number;
  resueltos: number;
}

/** Resuelto-state tickets per (year, month) of their OWN close_at_zammad (when they were actually
 * marked Resuelto), not their created_at_zammad - a different lifecycle question than
 * getPostventaByMonth's creation-volume view ("how many came in") answers "how many got resolved,
 * and when". Still scoped by the page's existing date-range filter on created_at_zammad (same
 * convention as every other Postventa breakdown here - the filter narrows WHICH tickets are in
 * scope, not which month they're bucketed into), so a ticket created in range but resolved outside
 * it can still land in a month outside the visible range elsewhere - that's intentional, same
 * lifecycle-view rationale as zammadTicketsAnalyticsRepository.ts's by-month chart. Confirmed live
 * that close_at_zammad is populated on every Resuelto ticket (and every Cerrado one too - Zammad
 * sets it whenever a ticket reaches any closed-type state, not just literal "Cerrado"), so this is
 * a reliable "fecha resuelto" source despite Zammad having no dedicated resolved-at field. */
export async function getPostventaResueltosByMonth(db: Knex, filters: PostventaFilters): Promise<PostventaResueltoMonthRow[]> {
  const rows = (await baseQuery(db, filters).where('state_name', 'Resuelto').select('close_at_zammad')) as Array<{
    close_at_zammad: Date | string | null;
  }>;

  const byMonth = new Map<string, PostventaResueltoMonthRow>();
  for (const row of rows) {
    if (!row.close_at_zammad) continue;
    const date = new Date(row.close_at_zammad);
    if (Number.isNaN(date.getTime())) continue;

    const anio = date.getUTCFullYear();
    const mes = date.getUTCMonth() + 1;
    const key = `${anio}-${mes}`;
    const bucket = byMonth.get(key) ?? { anio, mes, resueltos: 0 };
    bucket.resueltos += 1;
    byMonth.set(key, bucket);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

export interface PostventaAsuntoRow {
  /** Normalized label - the "Postventa::" prefix stripped, and empty/blank raw values folded into
   * "Sin asunto" (56 of 175 tickets at last count had no asunto set at all). */
  asunto: string;
  cantidad: number;
}

function normalizeAsunto(raw: string | null): string {
  if (!raw || raw.trim() === '') return 'Sin asunto';
  return raw.replace(/^Postventa::/, '').trim();
}

/** Ticket counts per (normalized) asunto, across the whole filtered range - not broken down by
 * month, since the set of asunto values is small (~5) and the question this answers is "which
 * motivos dominate", not a trend over time. Same in-JS aggregation rationale as getPostventaByMonth
 * - a few hundred rows, no need for a SQL GROUP BY. Sorted descending by count so the chart's
 * biggest categories render first. */
export async function getPostventaByAsunto(db: Knex, filters: PostventaFilters): Promise<PostventaAsuntoRow[]> {
  const rows = (await baseQuery(db, filters).select('asunto')) as Array<{ asunto: string | null }>;

  const counts = new Map<string, number>();
  for (const row of rows) {
    const asunto = normalizeAsunto(row.asunto);
    counts.set(asunto, (counts.get(asunto) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([asunto, cantidad]) => ({ asunto, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

const TICKET_COLUMNS = [
  'id',
  'number',
  'title',
  'asunto',
  'state_name',
  'priority_name',
  'owner_id',
  'owner_name',
  'customer_email',
  'foliocontrato',
  'telefono',
  'empresa',
  'created_at_zammad',
  'first_response_at_zammad',
  'close_at_zammad',
  'updated_at_zammad',
];

export interface PostventaTicketsPage {
  data: PostventaTicketRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getPostventaTicketsPaged(
  db: Knex,
  filters: PostventaFilters,
  pageParam: unknown,
  pageSizeParam: unknown,
): Promise<PostventaTicketsPage> {
  const page = clampPage(pageParam);
  const pageSize = clampPageSize(pageSizeParam);

  const [rows, total] = await Promise.all([
    baseQuery(db, filters)
      .select(TICKET_COLUMNS)
      .orderBy('created_at_zammad', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize) as Promise<RawTicketRow[]>,
    countOf(baseQuery(db, filters)),
  ]);

  return {
    data: rows.map(toTicketRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Unpaginated - the whole filtered range, for CSV export (mirrors getTareasVencidasForExport's
 * convention). Ordered newest-first, same as the paginated grid. */
export async function getPostventaTicketsForExport(db: Knex, filters: PostventaFilters): Promise<PostventaTicketRow[]> {
  const rows = (await baseQuery(db, filters).select(TICKET_COLUMNS).orderBy('created_at_zammad', 'desc')) as RawTicketRow[];
  return rows.map(toTicketRow);
}
