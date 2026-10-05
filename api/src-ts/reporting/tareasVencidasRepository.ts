import type { Knex } from 'knex';

/**
 * "Tareas Vencidas" - Cryo.dbo.Tarea rows that are overdue and were never properly closed on
 * time: FechaFinal (the task's own deadline) already passed, AND FechaCierre (when it was
 * actually closed) is either null (never closed at all) or earlier than FechaFinal. Requested
 * verbatim as: "Tarea with FechaFinal less than today and FechaCierre null or less than
 * FechaFinal". Same legacy Cryo.dbo database every other Comercial/Prospectos/Marketing report
 * reads from, joined the same way (Tarea -> Lead -> Prospecto -> Vendedor) so "vendedor" here
 * means the same thing it does everywhere else in this app.
 *
 * Paginated like prospectosRepository.ts's getProspectosPaged - Cryo.dbo.Tarea has over a million
 * rows total and ~118k match this condition historically (confirmed live), far too many to fetch
 * unpaginated for the on-screen grid (CSV export still fetches the whole filtered range, same as
 * every other bespoke report's export endpoint).
 */
export interface TareaVencidaRow {
  id_tarea: number;
  tipo_tarea: string | null;
  fecha_inicial: string | null;
  /** The task's own deadline - always in the past for every row this query returns. */
  fecha_final: string | null;
  /** Null (never closed) or earlier than fecha_final (closed late is NOT included here - see the
   * file-level comment: only FechaCierre IS NULL OR FechaCierre < FechaFinal match). */
  fecha_cierre: string | null;
  nota: string | null;
  activo: boolean;
  id_vendedor: number;
  vendedor: string | null;
  id_prospecto: number;
  madre_completo: string | null;
  padre_completo: string | null;
  telefonos: string | null;
}

/** Distinct (id_vendedor, vendedor) pairs that have at least one matching Tarea in a given
 * FechaFinal range - cheap enough to fetch unpaginated (a few dozen rows), used to drive the
 * vendedor filter dropdown (deduped further client-side the same way the Comercial report's own
 * vendedor dropdown already is - see web/src/utils/comercial.ts's normalizeVendedorName). */
export interface TareaVendedorOption {
  id_vendedor: number;
  vendedor: string | null;
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
 * exclusiveUpperBound, needed since Tarea.FechaFinal is a real datetime column. */
function exclusiveUpperBound(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function baseTareasVencidasQuery(
  legacyDb: Knex,
  fechaInicial: string,
  fechaFinal: string,
  vendedorIds: number[] | null,
): Knex.QueryBuilder {
  const qb = legacyDb('Cryo.dbo.Tarea as t')
    .innerJoin('Cryo.dbo.Lead as l', 't.ID_Lead', 'l.ID_Lead')
    .innerJoin('Cryo.dbo.Prospecto as p', 'p.ID_Prospecto', 'l.ID_Prospecto')
    .innerJoin('Cryo.dbo.Vendedor as v', 'v.ID_Vendedor', 'p.ID_Vendedor')
    .where('t.FechaFinal', '<', legacyDb.raw('GETDATE()'))
    .andWhere((builder) => builder.whereNull('t.FechaCierre').orWhereRaw('t.FechaCierre < t.FechaFinal'))
    .andWhere('t.FechaFinal', '>=', fechaInicial)
    .andWhere('t.FechaFinal', '<', exclusiveUpperBound(fechaFinal));

  if (vendedorIds && vendedorIds.length > 0) {
    qb.whereIn('p.ID_Vendedor', vendedorIds);
  }

  return qb;
}

function selectTareaVencidaColumns(query: Knex.QueryBuilder, legacyDb: Knex): Knex.QueryBuilder {
  return query
    .leftJoin('Cryo.dbo.TipoTarea as tt', 'tt.ID_TipoTarea', 't.ID_TipoTarea')
    .select(
      't.ID_Tarea as id_tarea',
      'tt.Nombre as tipo_tarea',
      legacyDb.raw('CAST(t.FechaInicial as date) as fecha_inicial'),
      legacyDb.raw('CAST(t.FechaFinal as date) as fecha_final'),
      legacyDb.raw('CAST(t.FechaCierre as date) as fecha_cierre'),
      't.Nota as nota',
      't.Activo as activo',
      'p.ID_Vendedor as id_vendedor',
      'v.Nombre as vendedor',
      'p.ID_Prospecto as id_prospecto',
      'p.MadreCompleto as madre_completo',
      'p.PadreCompleto as padre_completo',
      legacyDb.raw(`(
        SELECT STRING_AGG(TTT.Nombre + ' ' + TT.Telefono, ' ')
        FROM Cryo.dbo.ProspectoTelefono TT
        INNER JOIN Cryo.dbo.TipoTelefono TTT ON TTT.ID_TipoTelefono = TT.ID_TipoTelefono
        WHERE TT.ID_Prospecto = p.ID_Prospecto
      ) as telefonos`),
    );
}

export interface TareasVencidasPage {
  data: TareaVencidaRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getTareasVencidasPaged(
  legacyDb: Knex,
  fechaInicial: string,
  fechaFinal: string,
  vendedorIds: number[] | null,
  pageParam: unknown,
  pageSizeParam: unknown,
): Promise<TareasVencidasPage> {
  const page = clampPage(pageParam);
  const pageSize = clampPageSize(pageSizeParam);

  const [rows, countRow] = await Promise.all([
    selectTareaVencidaColumns(baseTareasVencidasQuery(legacyDb, fechaInicial, fechaFinal, vendedorIds), legacyDb)
      .orderBy('t.FechaFinal', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize) as Promise<TareaVencidaRow[]>,
    baseTareasVencidasQuery(legacyDb, fechaInicial, fechaFinal, vendedorIds).count('* as count').first() as Promise<
      { count: number } | undefined
    >,
  ]);

  const total = Number(countRow?.count ?? 0);
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Unpaginated - the whole filtered range, for CSV export (mirrors getProspectosForExport's
 * convention). Ordered oldest-deadline-first, same as the paginated grid, so the first page of
 * the CSV matches the first page on screen. */
export function getTareasVencidasForExport(
  legacyDb: Knex,
  fechaInicial: string,
  fechaFinal: string,
  vendedorIds: number[] | null,
): Promise<TareaVencidaRow[]> {
  return selectTareaVencidaColumns(baseTareasVencidasQuery(legacyDb, fechaInicial, fechaFinal, vendedorIds), legacyDb).orderBy(
    't.FechaFinal',
    'asc',
  ) as Promise<TareaVencidaRow[]>;
}

export async function getTareaVencidaVendedorOptions(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Promise<TareaVendedorOption[]> {
  return baseTareasVencidasQuery(legacyDb, fechaInicial, fechaFinal, null).distinct(
    'p.ID_Vendedor as id_vendedor',
    'v.Nombre as vendedor',
  ) as unknown as Promise<TareaVendedorOption[]>;
}

export interface TareaVencidaMonthRow {
  anio: number;
  mes: number;
  cantidad: number;
}

export interface TareaVencidaByVendedorMonthRow extends TareaVencidaMonthRow {
  id_vendedor: number;
  vendedor: string | null;
}

export interface TareasVencidasByMonthResult {
  /** Every matching Tarea in the period, grouped by (año, mes) of FechaFinal, across every
   * vendedor - for the "globalmente" chart. */
  global: TareaVencidaMonthRow[];
  /** Same grouping, split per vendedor - one row per (vendedor, año, mes) combination actually
   * present - for the "por vendedor" chart. Always unfiltered by vendedor (fetches every
   * vendedor's rows in one go, same as comercialRepository.ts's own global/porVendedor split) -
   * the frontend slices this down to one selected vendedor's rows itself, the same way it already
   * does for every other per-vendedor chart on this page. */
  porVendedor: TareaVencidaByVendedorMonthRow[];
}

/** Aggregated via SQL GROUP BY (not "fetch granular rows, aggregate in TS" like comercialRepository.ts) -
 * unlike that report's tareas-per-prospecto count, there's no correlated subquery in play here
 * forcing a client-side aggregation; a plain COUNT(*)/GROUP BY over real columns works fine and
 * avoids pulling all ~118k matching Tarea rows into Node just to count them by month. */
export async function getTareasVencidasByMonth(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Promise<TareasVencidasByMonthResult> {
  const [global, porVendedor] = await Promise.all([
    baseTareasVencidasQuery(legacyDb, fechaInicial, fechaFinal, null)
      .select(legacyDb.raw('YEAR(t.FechaFinal) as anio'), legacyDb.raw('MONTH(t.FechaFinal) as mes'))
      .count('* as cantidad')
      .groupByRaw('YEAR(t.FechaFinal), MONTH(t.FechaFinal)')
      .orderByRaw('YEAR(t.FechaFinal), MONTH(t.FechaFinal)') as unknown as Promise<Array<{ anio: number; mes: number; cantidad: number | string }>>,
    baseTareasVencidasQuery(legacyDb, fechaInicial, fechaFinal, null)
      .select('p.ID_Vendedor as id_vendedor', 'v.Nombre as vendedor', legacyDb.raw('YEAR(t.FechaFinal) as anio'), legacyDb.raw('MONTH(t.FechaFinal) as mes'))
      .count('* as cantidad')
      .groupByRaw('p.ID_Vendedor, v.Nombre, YEAR(t.FechaFinal), MONTH(t.FechaFinal)')
      .orderByRaw('v.Nombre, YEAR(t.FechaFinal), MONTH(t.FechaFinal)') as unknown as Promise<
      Array<{ id_vendedor: number; vendedor: string | null; anio: number; mes: number; cantidad: number | string }>
    >,
  ]);

  return {
    global: global.map((row) => ({ anio: row.anio, mes: row.mes, cantidad: Number(row.cantidad) })),
    porVendedor: porVendedor.map((row) => ({
      id_vendedor: row.id_vendedor,
      vendedor: row.vendedor,
      anio: row.anio,
      mes: row.mes,
      cantidad: Number(row.cantidad),
    })),
  };
}
