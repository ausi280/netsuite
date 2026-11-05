import type { Knex } from 'knex';
import { applySubsidiaryRestriction } from './reportingRepository';

/**
 * Ventas por zona y ejecutivo (Reporte Comercial), for the report's own date range - México only:
 * the sales zones only exist in the legacy Cryo.dbo CRM (CryoWeb), and every zone there is Mexican.
 *
 *  - Core = CryoWeb contracts (Cryo.dbo.Contrato, the 3 Mexican empresas), by sale date
 *    (FechaVenta), cancelled ones (Activo = 0) excluded. Amount = Contrato.Total (with IVA). Not
 *    NetSuite's contracts, per explicit instruction: NetSuite's Mexican contracts match CryoWeb's
 *    one-to-one only through July 2026 - from August, when the NetSuite sync started, they drift
 *    (confirmed live: Aug 54 vs 62, Sep 120 vs 56), most have no vendedor and none has a sales zone,
 *    and their services' prices don't add up to the sale (~84% of CryoWeb's Importe). CryoWeb is
 *    still current (sales through the last day of the previous month) and has zone, vendedor and
 *    amount on every contract.
 *  - Genética = NetSuite "Otros Contratos", by their own date - they only exist in NetSuite. Amount
 *    = the linked service package's price (same as commissionsRepository.ts), which is without IVA,
 *    so it's reported with IVA to match core. Zone = the NetSuite vendedor's CryoWeb Vendedor zone.
 *
 * A sale whose amount comes to $0 (a "cortesía" genetics package, a core contract with no Total) is
 * left out entirely, per explicit instruction - counted in core_sin_monto / genetica_sin_monto.
 */

const MEXICO_SUBSIDIARY_IDS = ['5', '7', '8'];
/** CryoWeb empresa of each Mexican NetSuite subsidiary: CRYO-CELL DE MEXICO, BCU, BSCU - so the
 * caller's NetSuite subsidiary restriction can apply to CryoWeb contracts too. */
const EMPRESA_BY_SUBSIDIARY: Record<string, number> = { '5': 1, '7': 2, '8': 3 };
const CURRENCY_USD = '2';
const IVA_RATE = 1.16;
const SIN_ZONA = 'Sin zona';
const SIN_EJECUTIVO = 'Sin ejecutivo';
/** Below this (MXN with IVA) a sale shows as $0 - "cortesía" packages are priced at fractions of a cent. */
const MONTO_MINIMO = 0.5;

// Raw NetSuite locale date string ("DD/MM/YYYY"), same parse as commissionsRepository.ts.
const OTROS_FECHA_DATE_SQL = 'TRY_CONVERT(date, O.custrecord_cryo_fecha_otroscontratos, 103)';

export interface VentasZonaEjecutivoRow {
  zona: string;
  ejecutivo: string;
  core_unidades: number;
  /** MXN with IVA. */
  core_monto: number;
  genetica_unidades: number;
  /** MXN with IVA. */
  genetica_monto: number;
}

export interface VentasResult {
  rows: VentasZonaEjecutivoRow[];
  /** Sales left out because their amount comes to $0. */
  core_sin_monto: number;
  genetica_sin_monto: number;
}

/** NetSuite placeholder employee for "no vendedor yet" - treated as no vendedor. */
const VENDEDOR_PLACEHOLDERS = new Set(['POR DEFINIR']);

/** Brand suffixes CryoWeb appends to some vendedor names ("ARACELI MORENO CRYOCELL"). */
const NAME_NOISE_WORDS = new Set(['CRYOCELL', 'CRYO', 'BCU', 'BSCU']);

function nameWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !NAME_NOISE_WORDS.has(word))
    .sort();
}

/** Order-insensitive name key, so NetSuite's "PINEDA LOZA, JAZMIN" and CryoWeb's "JAZMIN PINEDA
 * LOZA" are the same person. */
function nameKey(name: string): string {
  return nameWords(name).join(' ');
}

/**
 * CryoWeb often has a shorter spelling of the same person ("LORENA HERNANDEZ" for NetSuite's
 * "HERNANDEZ LOPEZ, LORENA"). A CryoWeb name resolves to the one NetSuite employee whose name holds
 * every one of its words, so a person's core and genetics sales land on the same line - when none
 * or several different people do, it stays as CryoWeb spelled it. Several NetSuite employees with
 * the very same name are one person (NetSuite has duplicates, e.g. an inactive "ARACELI MORENO
 * HERNANDEZ" next to the active "MORENO HERNANDEZ, ARACELI") - NetSuite's usual "APELLIDOS, NOMBRE"
 * spelling wins.
 */
function resolveToNetSuiteName(cryoWebName: string, netSuiteNames: string[]): string {
  const words = nameWords(cryoWebName);
  if (words.length === 0) return cryoWebName;
  const candidates = netSuiteNames.filter((nsName) => {
    const nsWords = new Set(nameWords(nsName));
    return words.every((word) => nsWords.has(word));
  });
  if (candidates.length === 0 || new Set(candidates.map(nameKey)).size > 1) return cryoWebName;
  return candidates.find((name) => name.includes(',')) ?? candidates[0];
}

function vendedorNetSuite(name: string | null): string | null {
  return name && !VENDEDOR_PLACEHOLDERS.has(name.trim().toUpperCase()) ? name : null;
}

/** Next-day exclusive upper bound - FechaVenta is a real datetime column (same as
 * marketingRepository.ts's exclusiveUpperBound). */
function exclusiveUpperBound(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface CoreRow {
  zona: string | null;
  vendedor: string | null;
  total: number | null;
}

interface GeneticaRow {
  vendedor: string | null;
  monto: number | null;
  moneda: string | null;
}

/** Each CryoWeb vendedor's zone, keyed by nameKey - an active row wins over an inactive one with the
 * same name (people get re-created when they change empresa). */
async function getCryoWebVendedorZonas(legacyDb: Knex, empresas: number[]): Promise<Map<string, string>> {
  const rows = (await legacyDb('Cryo.dbo.Vendedor as v')
    .innerJoin('Cryo.dbo.Zona as z', 'z.ID_Zona', 'v.ID_Zona')
    .whereIn('v.ID_Empresa', empresas)
    .orderBy('v.Activo', 'desc')
    .select('v.Nombre as nombre', 'z.Nombre as zona')) as Array<{ nombre: string | null; zona: string }>;
  const zonas = new Map<string, string>();
  for (const row of rows) {
    if (!row.nombre) continue;
    const key = nameKey(row.nombre);
    if (!zonas.has(key)) zonas.set(key, row.zona);
  }
  return zonas;
}

/** Sales between `desde` and `hasta` (YYYY-MM-DD, both inclusive). */
export async function getVentas(db: Knex, legacyDb: Knex, desde: string, hasta: string, restrictSubsidiaries: Set<string> | null): Promise<VentasResult> {
  const subsidiaries = restrictSubsidiaries === null ? MEXICO_SUBSIDIARY_IDS : MEXICO_SUBSIDIARY_IDS.filter((id) => restrictSubsidiaries.has(id));
  const empresas = subsidiaries.map((id) => EMPRESA_BY_SUBSIDIARY[id]);
  if (empresas.length === 0) return { rows: [], core_sin_monto: 0, genetica_sin_monto: 0 };

  const coreQb = legacyDb('Cryo.dbo.Contrato as c')
    .leftJoin('Cryo.dbo.Zona as z', 'z.ID_Zona', 'c.ID_Zona')
    .leftJoin('Cryo.dbo.Vendedor as v', 'v.ID_Vendedor', 'c.ID_Vendedor')
    .whereIn('c.ID_Empresa', empresas)
    .where('c.Activo', 1)
    .where('c.FechaVenta', '>=', desde)
    .andWhere('c.FechaVenta', '<', exclusiveUpperBound(hasta))
    .select('z.Nombre as zona', 'v.Nombre as vendedor', 'c.Total as total');

  const geneticaQb = db('netsuite_otros_contratos as O')
    .leftJoin('netsuite_pe_servicios as PS', 'PS.netsuite_id', 'O.custrecord_cryo_servicio_otroscontratos')
    .leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'O.custrecord_cryo_vendedor_otroscontratos')
    .whereRaw(`${OTROS_FECHA_DATE_SQL} BETWEEN ? AND ?`, [desde, hasta])
    .select('VEND.entityid as vendedor', db.raw('TRY_CONVERT(float, PS.custrecord_cryo_precioservicio) as monto'), 'PS.custrecord_cryo_monedaprecio as moneda');
  applySubsidiaryRestriction(geneticaQb, 'O.custrecord_cryo_subsidiaria_otroscontrat', new Set(subsidiaries));

  const [core, genetica, vendedorZonas, empleados] = await Promise.all([
    coreQb as Promise<CoreRow[]>,
    geneticaQb as Promise<GeneticaRow[]>,
    getCryoWebVendedorZonas(legacyDb, empresas),
    db('netsuite_employees').whereNotNull('entityid').pluck('entityid') as Promise<string[]>,
  ]);
  const netSuiteNames = empleados.filter((name) => vendedorNetSuite(name) !== null);

  const rows = new Map<string, VentasZonaEjecutivoRow>();
  function bucket(zona: string, ejecutivo: string): VentasZonaEjecutivoRow {
    const rowKey = `${zona}|${ejecutivo === SIN_EJECUTIVO ? '' : nameKey(ejecutivo)}`;
    let row = rows.get(rowKey);
    if (!row) {
      row = { zona, ejecutivo, core_unidades: 0, core_monto: 0, genetica_unidades: 0, genetica_monto: 0 };
      rows.set(rowKey, row);
    }
    return row;
  }

  let coreSinMonto = 0;
  for (const contract of core) {
    const monto = Number(contract.total ?? 0);
    if (monto < MONTO_MINIMO) {
      coreSinMonto += 1;
      continue;
    }
    const ejecutivo = contract.vendedor ? resolveToNetSuiteName(contract.vendedor, netSuiteNames) : SIN_EJECUTIVO;
    const row = bucket(contract.zona ?? SIN_ZONA, ejecutivo);
    row.core_unidades += 1;
    row.core_monto += monto;
  }

  let geneticaSinMonto = 0;
  for (const venta of genetica) {
    // Every Mexican service package is priced in MXN (confirmed live) - a USD one would need an
    // exchange rate the record doesn't carry, so it comes to no amount.
    const monto = venta.moneda === CURRENCY_USD ? 0 : Number(venta.monto ?? 0) * IVA_RATE;
    if (monto < MONTO_MINIMO) {
      geneticaSinMonto += 1;
      continue;
    }
    const vendedor = vendedorNetSuite(venta.vendedor);
    const row = bucket((vendedor && vendedorZonas.get(nameKey(vendedor))) || SIN_ZONA, vendedor ?? SIN_EJECUTIVO);
    row.genetica_unidades += 1;
    row.genetica_monto += monto;
  }

  const result = Array.from(rows.values());
  result.sort((a, b) => a.zona.localeCompare(b.zona) || b.core_monto + b.genetica_monto - (a.core_monto + a.genetica_monto));
  return { rows: result, core_sin_monto: coreSinMonto, genetica_sin_monto: geneticaSinMonto };
}
