import type { Knex } from 'knex';

/**
 * "Comercial" - how many "Tarea" (follow-up task) rows each prospecto accumulated before being
 * captured, both overall and per vendedor, by month, Activo status and canal - same legacy
 * Cryo.dbo database prospectosRepository.ts/marketingRepository.ts already read from (Prospecto
 * joined to Lead, scoped by FechaCaptura). Tareas = COUNT(*) of Cryo.dbo.Tarea rows linked via
 * Lead.ID_Lead - the exact same correlated subquery prospectosRepository.ts's own `tareas` column
 * already uses, just aggregated here instead of returned per-row. Month buckets are (anio, mes)
 * pairs, not bare month numbers - the default 12-month range already crosses a year boundary
 * (confirmed live), so "mes 1" alone would silently merge January of two different years. `activo`
 * and `canal` are both part of every row's grouping key (not separate aggregates) so the
 * frontend's Activos/Todos switch and Online/Offline split can filter any of these charts by
 * summing only the rows matching the selected state, without a second round trip.
 */

/**
 * Online vs offline, same classification marketingRepository.ts's ONLINE_TIPO_CANAL_IDS uses: id 1
 * (empresa 1), 16 (empresa 2) and 29 (empresa 3) are each that empresa's own "Internet" TipoCanal.
 * Safe to reuse verbatim here even though Comercial (unlike Marketing) isn't scoped to empresas
 * 1/2/3 alone - confirmed live that Comercial's real 12-month dataset also includes empresa 7
 * (Prospectos de Visita Médica / Prospectos CRM / Prospecto Cryolab, no "Internet" TipoCanal at
 * all), and Cryo.dbo.TipoCanal ids are never reused across empresas, so every empresa-7 prospecto
 * correctly and safely falls through to "offline" by simply not matching any of these three ids -
 * no empresa-7-specific id is needed.
 */
const ONLINE_TIPO_CANAL_IDS = [1, 16, 29];

/** Next-day exclusive upper bound - same convention as prospectosRepository.ts's
 * exclusiveUpperBound, needed since Prospecto.FechaCaptura is a real datetime column. */
function exclusiveUpperBound(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface RawProspectoRow {
  id_vendedor: number;
  vendedor: string | null;
  anio: number;
  mes: number;
  tareas: number | string;
  /** Cryo.dbo.Prospecto.Activo - confirmed live as a real boolean (mssql BIT mapped by the driver),
   * not 0/1 ints or a tri-state. */
  activo: boolean;
  es_online: number;
}

export type ProspectoCanal = 'online' | 'offline';

export interface TareasCountRow {
  anio: number;
  mes: number;
  /** Number of Tarea rows this bucket of prospectos has. */
  tareas: number;
  /** Cryo.dbo.Prospecto.Activo for every prospecto counted in this row - part of the grouping key,
   * so a caller wanting "Todos" sums both activo states for the same (año, mes, tareas), and a
   * caller wanting only active prospectos filters to activo === true before summing. */
  activo: boolean;
  /** Online (Internet TipoCanal) vs offline (everything else) - same split as
   * marketingRepository.ts, also part of the grouping key for the same reason as activo above. */
  canal: ProspectoCanal;
  /** How many prospectos have exactly this many tareas (and this activo state and canal). */
  cantidad: number;
}

export interface TareasByVendedorRow extends TareasCountRow {
  id_vendedor: number;
  vendedor: string | null;
}

export interface ComercialReportResult {
  /** Every prospecto in the period, grouped by (año, mes, tareas, activo, canal), across every
   * vendedor. */
  global: TareasCountRow[];
  /** Same grouping, but split per vendedor - one row per (vendedor, año, mes, tareas, activo,
   * canal) combination actually present. */
  porVendedor: TareasByVendedorRow[];
}

/**
 * Fetches one row per prospecto (its vendedor, año/mes, tareas count, Activo flag and canal)
 * rather than trying to GROUP BY the correlated subquery directly in SQL (SQL Server doesn't
 * accept grouping by a subquery expression without repeating it verbatim) - same "fetch granular
 * rows, aggregate in TS" approach marketingRepository.ts's getProspectoQualification already uses
 * for a similar correlated-count shape. One query covers both aggregates below (tareas global,
 * tareas per vendedor) - no reason to round-trip the database twice.
 */
async function getProspectoRows(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Promise<RawProspectoRow[]> {
  return legacyDb('Cryo.dbo.Prospecto as p')
    .innerJoin('Cryo.dbo.Lead as l', 'p.ID_Prospecto', 'l.ID_Prospecto')
    .innerJoin('Cryo.dbo.Vendedor as v', 'v.ID_Vendedor', 'p.ID_Vendedor')
    .where('p.FechaCaptura', '>=', fechaInicial)
    .andWhere('p.FechaCaptura', '<', exclusiveUpperBound(fechaFinal))
    .select(
      'p.ID_Vendedor as id_vendedor',
      'v.Nombre as vendedor',
      legacyDb.raw('YEAR(p.FechaCaptura) as anio'),
      legacyDb.raw('MONTH(p.FechaCaptura) as mes'),
      'p.Activo as activo',
      legacyDb.raw(`IIF(p.ID_TipoCanal IN (${ONLINE_TIPO_CANAL_IDS.join(',')}), 1, 0) as es_online`),
      legacyDb.raw('(SELECT COUNT(*) FROM Cryo.dbo.Tarea pt WHERE pt.ID_Lead = l.ID_Lead) as tareas'),
    ) as unknown as Promise<RawProspectoRow[]>;
}

export async function getProspectosPorTareas(legacyDb: Knex, fechaInicial: string, fechaFinal: string): Promise<ComercialReportResult> {
  const rows = await getProspectoRows(legacyDb, fechaInicial, fechaFinal);

  const globalMap = new Map<string, TareasCountRow>();
  const porVendedorMap = new Map<string, TareasByVendedorRow>();

  for (const row of rows) {
    const tareas = Number(row.tareas);
    const { anio, mes, activo } = row;
    const canal: ProspectoCanal = row.es_online ? 'online' : 'offline';

    const globalKey = `${anio}-${mes}-${tareas}-${activo}-${canal}`;
    const globalExisting = globalMap.get(globalKey) ?? { anio, mes, tareas, activo, canal, cantidad: 0 };
    globalExisting.cantidad += 1;
    globalMap.set(globalKey, globalExisting);

    const vendedorKey = `${row.id_vendedor}-${anio}-${mes}-${tareas}-${activo}-${canal}`;
    const vendedorExisting = porVendedorMap.get(vendedorKey) ?? {
      id_vendedor: row.id_vendedor,
      vendedor: row.vendedor,
      anio,
      mes,
      tareas,
      activo,
      canal,
      cantidad: 0,
    };
    vendedorExisting.cantidad += 1;
    porVendedorMap.set(vendedorKey, vendedorExisting);
  }

  const global = Array.from(globalMap.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes || a.tareas - b.tareas);

  const porVendedor = Array.from(porVendedorMap.values()).sort(
    (a, b) => (a.vendedor ?? '').localeCompare(b.vendedor ?? '') || a.anio - b.anio || a.mes - b.mes || a.tareas - b.tareas,
  );

  return { global, porVendedor };
}
