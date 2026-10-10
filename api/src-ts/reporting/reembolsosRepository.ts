import type { Knex } from 'knex';

/**
 * Reembolsos (CryoCell's cash-refund workflow for closed/cancelled service cases) - reporting on
 * Cryo.dbo.ControlReembolsos / ControlReembolsosProducto, a DIFFERENT physical database ("Cryo")
 * than this app's existing `legacyDb` connection targets by default ("CryoCell") - both live on the
 * same SQL Server instance (cryoholdco.homeip.net) and the existing login has cross-database read
 * access, confirmed live, so every query here just uses the fully-qualified three-part name
 * (Cryo.dbo.<table>) on the SAME `legacyDb` knex instance rather than a new connection.
 *
 * Ported from the legacy reporting stored procedure Cryo.dbo.Reembolsos_ReporteConsolidado (given
 * to us directly by the user) - that SP returns one wide, month-pivoted table built via a 9-way
 * UNION ALL + PIVOT. This instead returns tidy (long-format) rows, same convention as
 * postventaRepository.ts, so the frontend can build both the detail table/export and the charts
 * from one shape rather than un-pivoting a wide table.
 *
 * Every reembolso-línea (ControlReembolsosProducto - one row per product on a reembolso case) is
 * classified into exactly one `bucket`, mirroring the stored procedure's own UNION ALL branches:
 *  - 'pendiente' - IdEstatusReembolso IN (1,2), OR IdEstatusReembolso=3 with IdMotivoCierre=6 (the
 *    SP has two separate "Pendiente Reembolso" UNION blocks for this - they collapse to one
 *    condition here).
 *  - IdEstatusReembolso=3 (closed) is further split by IdMotivoCierre: 1='sinReembolso',
 *    2='aplicadoTransferencia', 3='aplicadoAnualidades', 4='aplicadoNuevoContrato',
 *    5='aplicadoGarantias'.
 *  - 'otro' - anything else - confirmed live that IdMotivoCierre 0 and 7 both exist in production
 *    (121 and 26 rows respectively, estatus=3) but aren't handled by ANY of the SP's own Resumen
 *    UNION branches either - the SP silently drops these from its summary pivot entirely (they'd
 *    only ever show up in its unfiltered "General" per-producto rows). Classified visibly here
 *    instead of being dropped.
 *
 * Only @YearInicial is actually used as a filter in the SP's real data-populating query, despite it
 * also accepting YearFinal/MonthInicial/MonthFinal parameters - those are dead/unused there,
 * vestigial from a shared generic report-template pattern this SP was copied from. This port keeps
 * just the one real filter (a single año), plus an optional empresa filter - the SP defaults this to
 * the CALLING USER's own empresa via dbo.ObtenEmpresa(@token), a per-user-session concept this app
 * has no equivalent of, so we default to EVERY empresa instead of guessing one.
 */

const PRODUCTO_LABELS: Record<number, string> = { 1: 'SCU', 2: 'TCU' };

export type ReembolsoBucket =
  | 'pendiente'
  | 'sinReembolso'
  | 'aplicadoTransferencia'
  | 'aplicadoAnualidades'
  | 'aplicadoNuevoContrato'
  | 'aplicadoGarantias'
  | 'otro';

export const REEMBOLSO_BUCKET_LABELS: Record<ReembolsoBucket, string> = {
  pendiente: 'Pendiente Reembolso',
  sinReembolso: 'Sin Reembolso',
  aplicadoTransferencia: 'Aplicado Transferencia',
  aplicadoAnualidades: 'Aplicado Anualidades',
  aplicadoNuevoContrato: 'Aplicado Nuevo Contrato',
  aplicadoGarantias: 'Aplicado Garantías',
  otro: 'Sin Clasificar',
};

export function classifyReembolsoBucket(estatus: number | null, motivoCierre: number | null): ReembolsoBucket {
  if (estatus === 1 || estatus === 2) return 'pendiente';
  if (estatus === 3) {
    switch (motivoCierre) {
      case 1:
        return 'sinReembolso';
      case 2:
        return 'aplicadoTransferencia';
      case 3:
        return 'aplicadoAnualidades';
      case 4:
        return 'aplicadoNuevoContrato';
      case 5:
        return 'aplicadoGarantias';
      case 6:
        return 'pendiente';
      default:
        return 'otro';
    }
  }
  return 'otro';
}

export interface ReembolsoFilters {
  /** A single calendar year - the only date filter the source SP's real query actually applies. */
  anio: number;
  /** Cryo.dbo.Empresa.ID_Empresa, as a string. */
  empresaId?: string;
}

export interface ReembolsoEmpresaOption {
  empresa_id: string;
  nombre: string;
}

export interface ReembolsoRow {
  id_reembolso_producto: number;
  folio: string | null;
  empresa_id: string;
  empresa: string;
  producto: string;
  causa: string;
  bucket: ReembolsoBucket;
  anio: number;
  mes: number;
  monto: number;
}

export interface ReembolsoMonthRow {
  anio: number;
  mes: number;
  bucket: ReembolsoBucket;
  monto: number;
}

export interface ReembolsoCausaRow {
  causa: string;
  monto: number;
}

interface RawRow {
  IdReembolsoProducto: number;
  Folio: string | null;
  IdEmpresa: number;
  Empresa: string;
  IdProducto: number | null;
  IdCausaReembolso: number | null;
  NombreCausa: string | null;
  IdEstatusReembolso: number | null;
  IdMotivoCierre: number | null;
  MontoReembolso: number | string | null;
  Mes: number;
}

function baseQuery(db: Knex, filters: ReembolsoFilters): Knex.QueryBuilder {
  const qb = db('Cryo.dbo.ControlReembolsosProducto as T1')
    .innerJoin('Cryo.dbo.ControlReembolsos as T0', 'T0.IdReembolso', 'T1.IdReembolso')
    .innerJoin('Cryo.dbo.Empresa as EMP', 'EMP.ID_Empresa', 'T0.IdEmpresa')
    .leftJoin('Cryo.dbo.CatCausasReembolsos as CAUSA', 'CAUSA.IdCausaReembolso', 'T1.IdCausaReembolso')
    .where('T1.Activo', true)
    .andWhere('T0.Activo', true)
    .andWhereRaw('YEAR(ISNULL(T0.FechaIncidenciaManual, T0.FechaIncidencia)) = ?', [filters.anio]);

  if (filters.empresaId) {
    qb.andWhere('T0.IdEmpresa', filters.empresaId);
  }

  return qb;
}

const SELECT_COLUMNS = [
  'T1.IdReembolsoProducto',
  'T0.Folio',
  'T0.IdEmpresa',
  'EMP.Nombre as Empresa',
  'T1.IdProducto',
  'T1.IdCausaReembolso',
  'CAUSA.NombreCausa',
  'T0.IdEstatusReembolso',
  'T0.IdMotivoCierre',
  'T1.MontoReembolso',
];

function toRow(raw: RawRow): ReembolsoRow {
  return {
    id_reembolso_producto: raw.IdReembolsoProducto,
    folio: raw.Folio,
    empresa_id: String(raw.IdEmpresa),
    empresa: raw.Empresa,
    producto: (raw.IdProducto && PRODUCTO_LABELS[raw.IdProducto]) || 'Sin producto',
    causa: raw.NombreCausa ?? 'Sin causa',
    bucket: classifyReembolsoBucket(raw.IdEstatusReembolso, raw.IdMotivoCierre),
    anio: 0, // filled in by the caller, which already knows the filtered año
    mes: raw.Mes,
    monto: Number(raw.MontoReembolso ?? 0),
  };
}

/** Every empresa with at least one active Reembolso on file (regardless of país - a superset of the
 * SP's own combo, which hardcodes ID_Pais=1/excludes ID_Empresa=99 "Inactivaciones" - rather than
 * risk hiding real data from a país the SP's combo didn't anticipate). */
export async function getReembolsoEmpresaOptions(db: Knex): Promise<ReembolsoEmpresaOption[]> {
  const rows = (await db('Cryo.dbo.ControlReembolsos as T0')
    .innerJoin('Cryo.dbo.Empresa as EMP', 'EMP.ID_Empresa', 'T0.IdEmpresa')
    .where('T0.Activo', true)
    .andWhereNot('T0.IdEmpresa', 99)
    .distinct('T0.IdEmpresa as empresa_id', 'EMP.Nombre as nombre')
    .orderBy('EMP.Nombre')) as Array<{ empresa_id: number; nombre: string }>;

  return rows.map((r) => ({ empresa_id: String(r.empresa_id), nombre: r.nombre }));
}

/** The full filtered set for one año (and optional empresa), one row per reembolso-línea - for the
 * detail table and CSV export alike. Small volume (a few hundred to ~700 rows/año account-wide,
 * confirmed live), so both read the same unpaginated query - see getReembolsosPaged below for the
 * on-screen paginated view. */
async function getReembolsosDetail(db: Knex, filters: ReembolsoFilters): Promise<ReembolsoRow[]> {
  const rows = (await baseQuery(db, filters)
    .select(SELECT_COLUMNS)
    .select(db.raw('MONTH(ISNULL(T0.FechaIncidenciaManual, T0.FechaIncidencia)) as Mes'))) as RawRow[];
  return rows.map((raw) => ({ ...toRow(raw), anio: filters.anio }));
}

export interface ReembolsosPage {
  data: ReembolsoRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function clampPage(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function clampPageSize(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return 50;
  return Math.min(n, 200);
}

/** Paginated wrapper over getReembolsosDetail's same filtered set, for the on-screen table -
 * fetches the whole filtered año in one go (small volume, see above) and pages in JS rather than at
 * the SQL level, since every other consumer (by-month/by-causa/export) already needs the full set
 * anyway and this keeps all four views guaranteed consistent with each other. */
export async function getReembolsosPaged(
  db: Knex,
  filters: ReembolsoFilters,
  pageParam: unknown,
  pageSizeParam: unknown,
): Promise<ReembolsosPage> {
  const all = await getReembolsosDetail(db, filters);
  const page = clampPage(pageParam);
  const pageSize = clampPageSize(pageSizeParam);
  const start = (page - 1) * pageSize;

  return {
    data: all.slice(start, start + pageSize),
    page,
    pageSize,
    total: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
  };
}

export async function getReembolsosForExport(db: Knex, filters: ReembolsoFilters): Promise<ReembolsoRow[]> {
  return getReembolsosDetail(db, filters);
}

/** Monto per (año, mes, bucket) - the stacked-by-bucket monthly chart. */
export async function getReembolsosByMonth(db: Knex, filters: ReembolsoFilters): Promise<ReembolsoMonthRow[]> {
  const rows = await getReembolsosDetail(db, filters);

  const byKey = new Map<string, ReembolsoMonthRow>();
  for (const row of rows) {
    const key = `${row.mes}-${row.bucket}`;
    const entry = byKey.get(key) ?? { anio: row.anio, mes: row.mes, bucket: row.bucket, monto: 0 };
    entry.monto += row.monto;
    byKey.set(key, entry);
  }

  return Array.from(byKey.values()).sort((a, b) => a.mes - b.mes);
}

/** Monto per causa (NombreCausa), across the whole filtered año - sorted descending so the biggest
 * causas render first, same convention as postventaRepository.ts's getPostventaByAsunto. */
export async function getReembolsosByCausa(db: Knex, filters: ReembolsoFilters): Promise<ReembolsoCausaRow[]> {
  const rows = await getReembolsosDetail(db, filters);

  const byCausa = new Map<string, number>();
  for (const row of rows) {
    byCausa.set(row.causa, (byCausa.get(row.causa) ?? 0) + row.monto);
  }

  return Array.from(byCausa.entries())
    .map(([causa, monto]) => ({ causa, monto }))
    .sort((a, b) => b.monto - a.monto);
}

export interface ReembolsoCierreMonthRow {
  anio: number;
  mes: number;
  cantidad: number;
  monto: number;
}

/** Closed reembolsos (IdEstatusReembolso=3 - any motivo: sinReembolso/aplicadoTransferencia/
 * aplicadoAnualidades/aplicadoNuevoContrato/aplicadoGarantias - i.e. everything except the
 * 'pendiente' bucket) per (year, month) of their own T0.FechaActualizacion. ControlReembolsos has
 * no dedicated "fecha cierre" column, but FechaActualizacion is a reliable proxy for one: confirmed
 * live only 2 of 1,820 closed reembolsos have it null, and it's always on/after FechaIncidencia
 * (sampled live - a reembolso filed in 2022 showing FechaActualizacion in 2026, consistent with
 * "last touched when it was finally closed", never earlier than when it was opened). Still scoped
 * by the page's existing año/empresa filter (based on FechaIncidencia, not FechaActualizacion), same
 * lifecycle-view convention as postventaRepository.ts's getPostventaResueltosByMonth - a reembolso
 * filed within the selected año but closed in a later month can land outside that año's own 12
 * months here, which is intentional (closing can lag filing by months or years). */
export async function getReembolsosCerradosByMonth(db: Knex, filters: ReembolsoFilters): Promise<ReembolsoCierreMonthRow[]> {
  const rows = (await baseQuery(db, filters)
    .where('T0.IdEstatusReembolso', 3)
    .select('T0.FechaActualizacion as FechaActualizacion', 'T1.MontoReembolso as MontoReembolso')) as Array<{
    FechaActualizacion: Date | string | null;
    MontoReembolso: number | string | null;
  }>;

  const byMonth = new Map<string, ReembolsoCierreMonthRow>();
  for (const row of rows) {
    if (!row.FechaActualizacion) continue;
    const date = new Date(row.FechaActualizacion);
    if (Number.isNaN(date.getTime())) continue;

    const anio = date.getUTCFullYear();
    const mes = date.getUTCMonth() + 1;
    const key = `${anio}-${mes}`;
    const bucket = byMonth.get(key) ?? { anio, mes, cantidad: 0, monto: 0 };
    bucket.cantidad += 1;
    bucket.monto += Number(row.MontoReembolso ?? 0);
    byMonth.set(key, bucket);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}
