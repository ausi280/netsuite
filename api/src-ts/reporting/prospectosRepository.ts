import type { Knex } from 'knex';

/**
 * "Prospectos" - CRM lead-funnel report from the pre-NetSuite legacy Cryo.dbo database (the same
 * database commissionsRepository.ts/notasCobranzaRepository.ts already read from). Reproduces the
 * exact query the sales team already runs by hand in SSMS (Prospecto joined to its Lead/Etapa/
 * Ciudad/TipoCanal/Canal/Vendedor, an optional "noventa" cancellation reason and an optional
 * matched Contrato, plus a phone-number rollup and a "most recent Tarea" lookup), parametrized by
 * a FechaCaptura date range instead of a fixed one. There is no NetSuite/netsuite_* equivalent of
 * this data at all - Prospecto captures people who never became a customer, so nothing here ever
 * gets synced into this app's own tables.
 */
export interface ProspectoRow {
  madre_completo: string | null;
  padre_completo: string | null;
  fecha_probable: string | null;
  telefonos: string | null;
  ciudad: string | null;
  tipo_canal: string | null;
  canal: string | null;
  estatus: number | null;
  id_prospecto: number;
  fecha_captura: string | null;
  mes: number | null;
  etapa: string | null;
  motivo: string | null;
  activo: boolean | number | null;
  vendedor: string | null;
  id_empresa: number | null;
  tareas: number;
  /** ':D' when this prospecto converted to a contract, ':(' otherwise - straight from the
   * original hand-written query, kept as-is rather than turned into a boolean. */
  contrato: string;
  fecha_cierre_tarea: string | null;
  nota_tarea: string | null;
  fecha_venta: string | null;
  folio_contrato: string | null;
  mes_cancelacion: number | null;
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

/** Next-day exclusive upper bound for a plain "YYYY-MM-DD" filter - Prospecto.FechaCaptura is a
 * real datetime column, so a naive `<= fechaFinal` would silently drop everything captured after
 * midnight on the end date. */
function exclusiveUpperBound(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function baseProspectosQuery(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Knex.QueryBuilder {
  return legacyDb('Cryo.dbo.Prospecto as p')
    .innerJoin('Cryo.dbo.Lead as l', 'p.ID_Prospecto', 'l.ID_Prospecto')
    .innerJoin('Cryo.dbo.Etapa as e', 'e.ID_Etapa', 'l.ID_Etapa')
    .innerJoin('Cryo.dbo.Ciudad as c', 'c.ID_Ciudad', 'p.ID_Ciudad')
    .innerJoin('Cryo.dbo.TipoCanal as tc', 'tc.ID_TipoCanal', 'p.ID_TipoCanal')
    .innerJoin('Cryo.dbo.Canal as canal', 'canal.ID_Canal', 'p.ID_Canal')
    .leftJoin('Cryo.dbo.noventa as noventa', 'noventa.ID_NoVenta', 'p.ID_NoVenta')
    .innerJoin('Cryo.dbo.Vendedor as v', 'v.ID_Vendedor', 'p.ID_Vendedor')
    .leftJoin('Cryo.dbo.Contrato as contrato', 'contrato.ID_Contrato', 'p.ID_Contrato')
    .where('p.FechaCaptura', '>=', fechaInicial)
    .andWhere('p.FechaCaptura', '<', exclusiveUpperBound(fechaFinal));
}

function selectProspectoColumns(query: Knex.QueryBuilder, legacyDb: Knex): Knex.QueryBuilder {
  return query.select(
    'p.MadreCompleto as madre_completo',
    'p.PadreCompleto as padre_completo',
    'p.FechaProbable as fecha_probable',
    legacyDb.raw(`(
      SELECT STRING_AGG(TTT.Nombre + ' ' + TT.Telefono, ' ')
      FROM Cryo.dbo.ProspectoTelefono TT
      INNER JOIN Cryo.dbo.TipoTelefono TTT ON TTT.ID_TipoTelefono = TT.ID_TipoTelefono
      WHERE TT.ID_Prospecto = p.ID_Prospecto
    ) as telefonos`),
    'c.Nombre as ciudad',
    'tc.Nombre as tipo_canal',
    'canal.Nombre as canal',
    'p.Estatus as estatus',
    'p.ID_Prospecto as id_prospecto',
    legacyDb.raw('CAST(p.FechaCaptura as date) as fecha_captura'),
    legacyDb.raw('MONTH(p.FechaCaptura) as mes'),
    'e.Nombre as etapa',
    'noventa.Nombre as motivo',
    'p.Activo as activo',
    'v.Nombre as vendedor',
    'p.ID_Empresa as id_empresa',
    legacyDb.raw('(SELECT COUNT(*) FROM Cryo.dbo.Tarea pt WHERE pt.ID_Lead = l.ID_Lead) as tareas'),
    legacyDb.raw(`IIF(p.ID_Contrato IS NOT NULL, ':D', ':(') as contrato`),
    legacyDb.raw(
      '(SELECT TOP 1 CAST(pt.FechaCierre as date) FROM Cryo.dbo.Tarea pt WHERE pt.ID_Lead = l.ID_Lead ORDER BY pt.FechaCierre DESC) as fecha_cierre_tarea',
    ),
    legacyDb.raw('(SELECT TOP 1 pt.Nota FROM Cryo.dbo.Tarea pt WHERE pt.ID_Lead = l.ID_Lead ORDER BY pt.FechaCierre DESC) as nota_tarea'),
    'contrato.FechaVenta as fecha_venta',
    'contrato.Folio as folio_contrato',
    legacyDb.raw('MONTH(p.FechaCancela) as mes_cancelacion'),
  );
}

export interface ProspectosPage {
  data: ProspectoRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getProspectosPaged(
  legacyDb: Knex,
  fechaInicial: string,
  fechaFinal: string,
  pageParam: unknown,
  pageSizeParam: unknown,
): Promise<ProspectosPage> {
  const page = clampPage(pageParam);
  const pageSize = clampPageSize(pageSizeParam);

  const [rows, countRow] = await Promise.all([
    selectProspectoColumns(baseProspectosQuery(legacyDb, fechaInicial, fechaFinal), legacyDb)
      .orderBy('p.FechaCaptura', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize) as Promise<ProspectoRow[]>,
    baseProspectosQuery(legacyDb, fechaInicial, fechaFinal).count('* as count').first() as Promise<{ count: number } | undefined>,
  ]);

  const total = Number(countRow?.count ?? 0);
  return { data: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Unpaginated - the whole filtered range, for CSV export (mirrors buildExportQuery's convention
 * in reportingRepository.ts for every other entity). */
export function getProspectosForExport(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Promise<ProspectoRow[]> {
  return selectProspectoColumns(baseProspectosQuery(legacyDb, fechaInicial, fechaFinal), legacyDb).orderBy(
    'p.FechaCaptura',
    'desc',
  ) as Promise<ProspectoRow[]>;
}
