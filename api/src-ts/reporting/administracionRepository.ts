import type { Knex } from 'knex';

/**
 * Reporte Administración - storage counts and abandonment (churn), all from NetSuite data synced
 * into netsuite_services / netsuite_contracts / netsuite_fcells_contratos.
 *
 * Storage ("Core") counts Sangre (Blood) and Tejido (Tissue) servicios per servicio status - Activo,
 * Almacenado, Seguridad total, Suspendido, Cancelado, Disposición each reported on its own, never
 * summed into one total (per explicit instruction). Servicio status is NetSuite's CURRENT one - NetSuite keeps no status history - so a
 * past month only narrows by date: servicios processed (custrecord_cryo_fecha_procesoserv, falling
 * back to the record's creation date) on or before the month's last day.
 *
 * Brazil and Colombia brands have no subsidiaria in NetSuite and are left out on purpose.
 */

export interface BrandConfig {
  subsidiaria: string;
  brand: string;
  country: string;
}

/** Core brands, in report order. */
export const CORE_BRANDS: BrandConfig[] = [
  { subsidiaria: '5', brand: 'Cryo-Cell', country: 'México' },
  { subsidiaria: '7', brand: 'BCU', country: 'México' },
  { subsidiaria: '8', brand: 'BSCU', country: 'México' },
  { subsidiaria: '20', brand: 'Biocells', country: 'Argentina' },
  { subsidiaria: '24', brand: 'Criocord', country: 'Perú' },
  { subsidiaria: '25', brand: 'Lazo de Vida', country: 'Perú' },
];

/** Brands the churn table covers - the only ones NetSuite records a cancellation date for
 * (custrecord_cryo_mx_fechacancelacion). Same three as the legacy CW_ChrunRate_Obtener. */
const CHURN_SUBSIDIARIAS = ['5', '7', '8'];

const FCELLS_SUBSIDIARIA = '12';
const COUNTRY_BY_SUBSIDIARIA: Record<string, string> = {
  ...Object.fromEntries(CORE_BRANDS.map((b) => [b.subsidiaria, b.country])),
  [FCELLS_SUBSIDIARIA]: 'México',
};

// customlist_cryo_tiposervicio
const TIPO_SANGRE = '1';
const TIPO_TEJIDO = '2';
const TIPO_ADN = '3';
const TIPO_FIBROBLASTOS = '7';
const TIPO_MESENQUIMAL_LOCAL = '12';
const TIPO_MESENQUIMAL_SISTEMICA = '13';
const TIPO_PLACENTA = '15';

/** custrecord_cryo_estatusservicio (servicio) / custrecord_cryo_estatus (contrato) labels. */
export const SERVICIO_STATUS_LABELS: Record<string, string> = {
  '1': 'Activo',
  '7': 'Cancelado',
  '8': 'Suspendido',
  '11': 'Disposición',
  '12': 'Seguridad total',
  '13': 'Retirado del tanque',
  '14': 'Almacenado',
};
const STATUS_DISPOSICION = '11';
const STATUS_CANCELADO = '7';
const STATUS_SUSPENDIDO = '8';
const STATUS_RETIRADO = '13';

const FCELLS_STATUS_LABELS: Record<string, string> = { '1': 'Activo', '2': 'Baja', '3': 'Suspendido' };

export type FcellsCategory = 'Fibroblastos' | 'Mesenquimal sistémica' | 'Mesenquimal local' | 'Mesenquimal terapéutica' | 'Aféresis';

/** Fcells record category: its mesenquimal type when set (1 Locales, 2 Sistémicas, 3 Terapéuticas),
 * otherwise its producto (2964 Cultivo de aféresis, 2965 mesenquimales locales, 2966 mesenquimales
 * sistémicas; everything else - 2963/2967 fibroblastos, Argentina's "2005" - is fibroblastos). */
function fcellsCategory(producto: string | null, mesenquimal: string | null): FcellsCategory {
  if (mesenquimal === '1' || producto === '2965') return 'Mesenquimal local';
  if (mesenquimal === '2' || producto === '2966') return 'Mesenquimal sistémica';
  if (mesenquimal === '3') return 'Mesenquimal terapéutica';
  if (producto === '2964') return 'Aféresis';
  return 'Fibroblastos';
}

const SERVICIO_FCELLS_CATEGORY: Record<string, FcellsCategory> = {
  [TIPO_FIBROBLASTOS]: 'Fibroblastos',
  [TIPO_MESENQUIMAL_LOCAL]: 'Mesenquimal local',
  [TIPO_MESENQUIMAL_SISTEMICA]: 'Mesenquimal sistémica',
};

export interface StatusCount {
  estatus: string;
  label: string;
  blood: number;
  tissue: number;
}

export interface BrandStorage extends BrandConfig {
  byStatus: StatusCount[];
}

export interface FcellsCount {
  country: string;
  category: FcellsCategory;
  status: string;
  n: number;
}

export interface PlacentaCount {
  country: string;
  status: string;
  n: number;
}

export interface StorageReport {
  cutoff: string;
  brands: BrandStorage[];
  fcells: FcellsCount[];
  placenta: PlacentaCount[];
}

// A servicio's date for "was it there by the cutoff": its processing date, else its creation date;
// undated rows always count.
const SERVICIO_DATE_SQL = `ISNULL(TRY_CONVERT(date, S.custrecord_cryo_fecha_procesoserv, 103), ISNULL(TRY_CONVERT(date, LEFT(S.created, 10), 103), '19000101'))`;

/** Last day of the given month, as YYYY-MM-DD. */
export function monthCutoff(month: number, year: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

export async function getStorageReport(db: Knex, cutoff: string): Promise<StorageReport> {
  const subs = Object.keys(COUNTRY_BY_SUBSIDIARIA);
  const servicioRows: Array<{ sub: string; tipo: string; est: string | null; n: number }> = await db.raw(
    `SELECT C.custrecord_cryo_subsidiariacontrato AS sub, S.custrecord_cryo_tipodeserv AS tipo, S.custrecord_cryo_estatusservicio AS est, COUNT(*) AS n
     FROM netsuite_services S
     JOIN netsuite_contracts C ON C.netsuite_id = S.custrecord_cryo_idcontrato
     WHERE ISNULL(S.isinactive, 'F') <> 'T'
       AND S.custrecord_cryo_tipodeserv IN (?, ?, ?, ?, ?, ?)
       AND C.custrecord_cryo_subsidiariacontrato IN (${subs.map(() => '?').join(', ')})
       AND ${SERVICIO_DATE_SQL} <= ?
     GROUP BY C.custrecord_cryo_subsidiariacontrato, S.custrecord_cryo_tipodeserv, S.custrecord_cryo_estatusservicio`,
    [TIPO_SANGRE, TIPO_TEJIDO, TIPO_FIBROBLASTOS, TIPO_MESENQUIMAL_LOCAL, TIPO_MESENQUIMAL_SISTEMICA, TIPO_PLACENTA, ...subs, cutoff],
  );

  const brands: BrandStorage[] = CORE_BRANDS.map((config) => {
    const byStatus = new Map<string, StatusCount>();
    for (const row of servicioRows) {
      if (row.sub !== config.subsidiaria || (row.tipo !== TIPO_SANGRE && row.tipo !== TIPO_TEJIDO)) continue;
      const est = row.est ?? '';
      const n = Number(row.n);
      const entry = byStatus.get(est) ?? { estatus: est, label: SERVICIO_STATUS_LABELS[est] ?? (est ? `Estatus ${est}` : 'Sin estatus'), blood: 0, tissue: 0 };
      if (row.tipo === TIPO_SANGRE) entry.blood += n;
      else entry.tissue += n;
      byStatus.set(est, entry);
    }
    return { ...config, byStatus: Array.from(byStatus.values()) };
  });

  const fcells: FcellsCount[] = [];
  const placenta: PlacentaCount[] = [];
  for (const row of servicioRows) {
    const country = COUNTRY_BY_SUBSIDIARIA[row.sub];
    const status = SERVICIO_STATUS_LABELS[row.est ?? ''] ?? 'Sin estatus';
    const category = SERVICIO_FCELLS_CATEGORY[row.tipo];
    if (category) fcells.push({ country, category, status, n: Number(row.n) });
    if (row.tipo === TIPO_PLACENTA) placenta.push({ country, status, n: Number(row.n) });
  }

  // The Fcells record itself (customrecord_cryo_fcells). A record with no subsidiaria is FCells
  // México's - every one of them carries an FCells México producto.
  const fcellsRows: Array<{ sub: string | null; producto: string | null; mesenquimal: string | null; est: string | null; n: number }> = await db.raw(
    `SELECT custrecord_cryo_subsidiariafcells AS sub, custrecord_cryo_productofcells AS producto, custrecord_cryo_fcells_mesenquimal AS mesenquimal,
            custrecord_cryo_estatusfcells AS est, COUNT(*) AS n
     FROM netsuite_fcells_contratos
     WHERE ISNULL(isinactive, 'F') <> 'T'
       AND ISNULL(TRY_CONVERT(date, custrecord_cryo_fecha_procesamiento, 103),
             ISNULL(TRY_CONVERT(date, custrecord_cryo_fechaalta, 103), ISNULL(TRY_CONVERT(date, LEFT(created, 10), 103), '19000101'))) <= ?
     GROUP BY custrecord_cryo_subsidiariafcells, custrecord_cryo_productofcells, custrecord_cryo_fcells_mesenquimal, custrecord_cryo_estatusfcells`,
    [cutoff],
  );
  for (const row of fcellsRows) {
    fcells.push({
      country: COUNTRY_BY_SUBSIDIARIA[row.sub ?? FCELLS_SUBSIDIARIA] ?? 'México',
      category: fcellsCategory(row.producto, row.mesenquimal),
      status: FCELLS_STATUS_LABELS[row.est ?? ''] ?? 'Sin estatus',
      n: Number(row.n),
    });
  }

  return { cutoff, brands, fcells, placenta };
}

export interface ChurnRow {
  subsidiaria: string;
  brand: string;
  /** Contracts in storage at the start of the period. */
  inicio: number;
  /** Contracts cancelled during the period. */
  abandonos: number;
  /** abandonos / inicio × 100. */
  tasaAbandono: number | null;
  /** Contracts whose first Sangre/Tejido/ADN servicio was processed during the period. */
  nuevos: number;
  /** inicio - abandonos + nuevos. */
  final: number;
  /** final / inicio × 100 - 100. */
  tasaCrecimiento: number | null;
  /** 100 - abandonos × 100 / nuevos - same figure as the legacy report's AbandonosVsNuevos. */
  abandonosVsNuevos: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Abandonment per Mexico brand over [from, to], at contract level, mirroring the legacy
 * CW_ChrunRate_Obtener with NetSuite data:
 * - a contract's start is its first processed Sangre/Tejido/ADN servicio (contracts have no
 *   processing date of their own filled in). Without one, the earlier of the baby's birth date and
 *   the contract's creation date: thousands of historical contracts were loaded into NetSuite on
 *   8-11 Aug 2026 with no processing date (their birth date is the real one), while a new sale is
 *   created before the birth (its creation date is the sale);
 * - Inicio: started before `from`, not Disposición/Retirado, not Suspendido (NetSuite has no
 *   suspension date, so a suspension is treated as already in effect), and not cancelled before
 *   `from` - a Cancelado contract with no cancellation date counts as cancelled before;
 * - Abandonos: Cancelado with custrecord_cryo_mx_fechacancelacion inside the period. NetSuite only
 *   records that date since October 2026, so earlier periods show (almost) no abandonos;
 * - Nuevos: started inside the period.
 */
export async function getChurnReport(db: Knex, from: string, to: string): Promise<ChurnRow[]> {
  const rows: Array<{ sub: string; inicio: number; abandonos: number; nuevos: number }> = await db.raw(
    `WITH entry AS (
       SELECT S.custrecord_cryo_idcontrato AS cid, MIN(TRY_CONVERT(date, S.custrecord_cryo_fecha_procesoserv, 103)) AS fecha
       FROM netsuite_services S
       WHERE ISNULL(S.isinactive, 'F') <> 'T' AND S.custrecord_cryo_tipodeserv IN (?, ?, ?)
       GROUP BY S.custrecord_cryo_idcontrato
     ), K AS (
       SELECT C.custrecord_cryo_subsidiariacontrato AS sub, C.custrecord_cryo_estatus AS est,
              ISNULL(E.fecha, CASE WHEN N.nac IS NOT NULL AND (N.creado IS NULL OR N.nac < N.creado) THEN N.nac ELSE N.creado END) AS inicio_fecha,
              TRY_CONVERT(date, JSON_VALUE(C.raw_data, '$.custrecord_cryo_mx_fechacancelacion'), 103) AS cancel_fecha
       FROM netsuite_contracts C
       JOIN entry E ON E.cid = C.netsuite_id
       CROSS APPLY (SELECT TRY_CONVERT(date, C.custrecord_cryo_fechanacimiento, 103) AS nac, TRY_CONVERT(date, LEFT(C.created, 10), 103) AS creado) N
       WHERE C.custrecord_cryo_subsidiariacontrato IN (${CHURN_SUBSIDIARIAS.map(() => '?').join(', ')})
     )
     SELECT sub,
       SUM(CASE WHEN inicio_fecha < ? AND ISNULL(est, '') NOT IN (?, ?, ?)
                 AND NOT (est = ? AND (cancel_fecha IS NULL OR cancel_fecha < ?)) THEN 1 ELSE 0 END) AS inicio,
       SUM(CASE WHEN est = ? AND cancel_fecha BETWEEN ? AND ? THEN 1 ELSE 0 END) AS abandonos,
       SUM(CASE WHEN inicio_fecha BETWEEN ? AND ? THEN 1 ELSE 0 END) AS nuevos
     FROM K
     GROUP BY sub`,
    [
      TIPO_SANGRE,
      TIPO_TEJIDO,
      TIPO_ADN,
      ...CHURN_SUBSIDIARIAS,
      from,
      STATUS_DISPOSICION,
      STATUS_RETIRADO,
      STATUS_SUSPENDIDO,
      STATUS_CANCELADO,
      from,
      STATUS_CANCELADO,
      from,
      to,
      from,
      to,
    ],
  );

  return CHURN_SUBSIDIARIAS.map((sub) => {
    const brand = CORE_BRANDS.find((b) => b.subsidiaria === sub)!.brand;
    const row = rows.find((r) => r.sub === sub);
    const inicio = Number(row?.inicio ?? 0);
    const abandonos = Number(row?.abandonos ?? 0);
    const nuevos = Number(row?.nuevos ?? 0);
    const final = inicio - abandonos + nuevos;
    return {
      subsidiaria: sub,
      brand,
      inicio,
      abandonos,
      tasaAbandono: inicio > 0 ? round2((abandonos / inicio) * 100) : null,
      nuevos,
      final,
      tasaCrecimiento: inicio > 0 ? round2((final * 100) / inicio - 100) : null,
      abandonosVsNuevos: nuevos > 0 ? round2(100 - (abandonos * 100) / nuevos) : null,
    };
  });
}
