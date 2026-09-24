import type { Knex } from 'knex';
import { applySubsidiaryRestriction, parseSubsidiaryFilter } from './reportingRepository';
import { getEmployeeLevelsMap } from './employeeDetailsRepository';
import { getAllLevelTiers, resolveCommissionPercentage } from './commissionTiersRepository';

/**
 * New-contract salesperson commissions, broken down per contract/otros-contrato so it's clear WHY
 * a number is what it is (per the "very fluent, easy to understand" ask).
 *
 * Contracts and Otros Contratos are two ENTIRELY INDEPENDENT tiered commissions - they don't sum
 * together for tier resolution, and each has its own nivel per employee
 * (employee_details.nivel_contratos / nivel_otros_contratos):
 *   - A regular contract's services (Sangre/Tejido/ADN/Placenta/etc.) contribute their processing
 *     price to that contract's total. The Contratos RATE is resolved once per vendedor, from
 *     their TOTAL contracts-services sum across every contract they sold in the period (every
 *     subsidiary, not just one), under their nivel_contratos - then that one rate is applied to
 *     each contract's own total.
 *   - An "Otros Contratos" record (a distinct sample-collection record type, custrecord_cryo_
 *     otroscontratos) contributes its linked Servicio package's price (custrecord_cryo_
 *     precioservicio on customrecord_cryo_pe_servicios). The Otros Contratos RATE is resolved
 *     separately, from the vendedor's TOTAL otros-contratos sales sum for the period, under their
 *     nivel_otros_contratos.
 *
 * On top of the Contratos tiered commission, a contract additionally pays a flat 3% Placenta bonus
 * whenever it includes a Placenta service - computed on the contract's FULL services total (not
 * just Placenta's own price), and paid "no matter what" nivel the vendedor is on - a fixed
 * business rule, not one of the configurable commission_level_tiers. Otros Contratos have no
 * Placenta-equivalent bonus.
 *
 * Separately, each distinct año with MORE THAN ONE "Anualidad" partida on a contract (a year of
 * storage the customer prepaid in advance) pays a flat $100 bonus - only ONE per year, regardless
 * of how many service-type Anualidad lines exist for that same year (e.g. SCU/TCU/ADN/Placenta
 * anualidad lines for the same año are still a single $100, not $100 each) - grouped by año for
 * display. A year with only a single Anualidad line doesn't pay at all - it takes more than one
 * (e.g. SCU + TCU) to count as a real renewal worth a bonus. "Procesamiento" partidas are a
 * different charge (the one-time processing sale itself, already covered by the services total
 * above) and never count toward this bonus. Otros Contratos have no partidas of their own, so no
 * anualidad bonus applies to them either.
 *
 * Every contract with a vendedor is always SHOWN with a "Docs Completos" flag (Mexico-subsidiary
 * contracts only - Argentina/Peru have no equivalent legacy record, so it's always true for them):
 * Cryo.dbo.Contrato (the pre-NetSuite legacy sales system, still the system of record for this
 * flag; nothing equivalent exists on the NetSuite contract record) has a DocsCompletos bit.
 * Primary match: Cryo.dbo.Contrato.NetSuite = netsuite_contracts.name (confirmed against real
 * production data - this "NetSuite" column is a delayed one-way backfill from NetSuite back into
 * the legacy system, typically populated a few weeks after the sale). Fallback, ONLY when that
 * primary match finds no legacy row at all (never overriding a real match that says incomplete):
 * Cryo.dbo.Contrato.Folio = netsuite_contracts.custrecord_cryo_contratosistemaanterior - confirmed
 * live this is safe (of ~188k legacy rows, only 46 folios have more than one row, and zero of
 * those 46 have conflicting DocsCompletos values across their rows), and it closes a real gap:
 * ~12% of legacy rows have a null NetSuite column at any given time (disproportionately the most
 * recent sales, i.e. exactly the contracts a given month's commission run cares about), which the
 * primary match alone would always treat as incomplete even when DocsCompletos is genuinely
 * already 1.
 *
 * IMPORTANT: as of this session, "Docs Completos" is display-only - it no longer gates anything.
 * Every contract's Placenta/tier/anualidad bonuses, and its contribution to the vendedor's tier
 * total, are computed the same regardless of this flag (per explicit instruction: the label should
 * stay visible, but must never zero out or restrict a real commission calculation). Kept in
 * ContractCommission purely so the UI can still show the badge.
 */

// Fixed business rules, deliberately NOT part of the configurable commission_level_tiers table -
// these apply "no matter what" nivel the vendedor is on.
const PLACENTA_SERVICE_TYPE_ID = '15';
const PLACENTA_BONUS_RATE = 3; // percent, of the contract's full services total
const ANUALIDAD_BONUS_PER_YEAR = 100; // currency units, per distinct año - not per service line

// The only subsidiaries whose contracts were ever tracked in the legacy Cryo.dbo.Contrato system
// (confirmed by their netsuite_contracts.name prefix: MX-CC/MX-BC/MX-BS respectively) - the
// DocsCompletos gate below only applies to these; every other subsidiary (Argentina, Peru, ...)
// has no equivalent legacy record to check, so their contracts always pay.
const MEXICO_SUBSIDIARY_IDS = new Set(['5', '7', '8']);

export interface ServiceCommissionLine {
  netsuite_id: string;
  /** NetSuite service-type list id (see SERVICE_TYPE_LABELS on the frontend for display labels) - e.g. '15' = Placenta. */
  tipo: string | null;
  precio_procesamiento: number;
  is_placenta: boolean;
}

export interface AnualidadYearLine {
  anio: string;
  /** How many service-type Anualidad lines (SCU/TCU/ADN/etc.) exist for this año - informational
   * only, since the $100 bonus is paid once per year regardless of this count. */
  count: number;
  /** Always ANUALIDAD_BONUS_PER_YEAR (one flat bonus for the year, not count * that amount). */
  monto: number;
}

export interface ContractCommission {
  netsuite_id: string;
  name: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | null;
  estatus: string | null;
  subsidiaria_id: string | null;
  moneda: string | null;
  titular_nombre: string | null;
  /** custrecord_cryo_contratosistemaanterior - the legacy CryoCell folio, when this contract has one. */
  folio_sistema_anterior: string | null;
  services: ServiceCommissionLine[];
  /** Sum of every active service's precio_procesamiento on this contract, Placenta included - the
   * base both the tiered commission and the Placenta bonus are computed from. */
  total_servicios: number;
  has_placenta: boolean;
  /** Whether this contract's paperwork is complete in the legacy system (always true outside the
   * Mexico subsidiaries, which have no such gate). Display-only - it does NOT affect any of the
   * commission figures below, which are always computed the same regardless of this flag. */
  docs_completos: boolean;
  /** total_servicios * 3%, only when has_placenta - 0 otherwise. */
  placenta_bonus: number;
  /** total_servicios * the vendedor's resolved tier_percentage_contratos / 100. */
  tier_commission: number;
  anualidades: AnualidadYearLine[];
  anualidad_bonus_total: number;
  total_commission: number;
}

/** An "Otros Contratos" sale (sample-collection record, not a regular contract) - its linked
 * Servicio package's price feeds its own independent tiered commission (nivel_otros_contratos),
 * with no Placenta or anualidad bonus equivalent. */
export interface OtrosContratoCommission {
  netsuite_id: string;
  name: string | null;
  fecha: string | null;
  servicio_nombre: string | null;
  monto: number;
  moneda: string | null;
  /** monto * the vendedor's resolved tier_percentage_otros_contratos / 100. */
  tier_commission: number;
}

export interface VendedorCommissionGroup {
  vendedor_id: string;
  vendedor_nombre: string | null;
  /** The vendedor's Contratos nivel - independent from nivel_otros_contratos. */
  nivel_contratos: string | null;
  /** This vendedor's TOTAL contracts-services sum for the period, across every one of their
   * contracts and subsidiaries (Placenta included) - NOT limited by any subsidiary/currency filter
   * on this request, since the commission tier reflects true total volume, not one filtered slice
   * of it. Otros Contratos sales are NOT included here - the two don't sum together. */
  total_ventas_contratos_periodo: number;
  /** The tiered rate resolved from total_ventas_contratos_periodo under nivel_contratos - applied
   * uniformly to every one of this vendedor's contracts below. Null if the vendedor has no
   * nivel_contratos, or that nivel has no tier covering this amount. */
  tier_percentage_contratos: number | null;
  /** The vendedor's Otros Contratos nivel - independent from nivel_contratos. */
  nivel_otros_contratos: string | null;
  /** This vendedor's TOTAL otros-contratos sales sum for the period, across every subsidiary - NOT
   * limited by any subsidiary/currency filter on this request, and NOT combined with
   * total_ventas_contratos_periodo. */
  total_ventas_otros_contratos_periodo: number;
  /** The tiered rate resolved from total_ventas_otros_contratos_periodo under
   * nivel_otros_contratos - applied uniformly to every one of this vendedor's otros-contratos
   * below. Null if the vendedor has no nivel_otros_contratos, or that nivel has no tier covering
   * this amount. */
  tier_percentage_otros_contratos: number | null;
  contracts: ContractCommission[];
  contracts_count: number;
  /** Sum of every contract's total_commission - paid as its own transaction, separate from
   * otros_contratos_commission (per the "pay in two transactions" instruction - contracts and
   * otros-contratos are two distinct payouts, on two independent tiers). */
  contracts_commission: number;
  otros_contratos: OtrosContratoCommission[];
  otros_contratos_count: number;
  /** Sum of every otros-contrato's tier_commission - its own separate transaction from contracts_commission. */
  otros_contratos_commission: number;
  /** contracts_commission + otros_contratos_commission - shown for convenience, not itself a payout. */
  total_commission: number;
}

const SUBSIDIARY_COLUMN = 'C.custrecord_cryo_subsidiariacontrato';
const CURRENCY_COLUMN = 'C.custrecord_cryo_moneda';
// custrecord_cryo_finicio is a raw NetSuite locale date string ("DD/MM/YYYY", confirmed 100%
// parseable on this table, same as the other custom-record date fields handled this session).
const FECHA_INICIO_DATE_SQL = `TRY_CONVERT(date, C.custrecord_cryo_finicio, 103)`;

const OTROS_SUBSIDIARY_COLUMN = 'O.custrecord_cryo_subsidiaria_otroscontrat';
const OTROS_CURRENCY_COLUMN = 'PS.custrecord_cryo_monedaprecio';
// Same raw NetSuite locale date string shape as custrecord_cryo_finicio above.
const OTROS_FECHA_DATE_SQL = `TRY_CONVERT(date, O.custrecord_cryo_fecha_otroscontratos, 103)`;

interface ContractRow {
  netsuite_id: string;
  name: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | null;
  estatus: string | null;
  subsidiaria_id: string | null;
  moneda: string | null;
  titular_nombre: string | null;
  folio_sistema_anterior: string | null;
  vendedor_id: string;
  vendedor_nombre: string | null;
}

interface ServiceRow {
  netsuite_id: string;
  custrecord_cryo_idcontrato: string;
  custrecord_cryo_tipodeserv: string | null;
  custrecord_cryo_precioprocesamiento: string | number | null;
}

interface AnualidadPartidaRow {
  custrecord_cryo_numcontrato: string;
  custrecord_cryo_aniopartida: string | null;
  custrecord_cryo_importepartida: string | number | null;
}

interface OtrosContratoRow {
  netsuite_id: string;
  name: string | null;
  fecha: string | null;
  vendedor_id: string;
  vendedor_nombre: string | null;
  servicio_nombre: string | null;
  monto: string | number | null;
  moneda: string | null;
}

function baseContractsQuery(db: Knex, month: number, year: number): Knex.QueryBuilder {
  return db('netsuite_contracts as C')
    .leftJoin('netsuite_customers as CUST', 'CUST.netsuite_id', 'C.custrecord_cryo_titularcontrato')
    .leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'C.custrecord_cryo_vendedor')
    .whereNotNull('C.custrecord_cryo_vendedor')
    .whereRaw(`MONTH(${FECHA_INICIO_DATE_SQL}) = ?`, [month])
    .whereRaw(`YEAR(${FECHA_INICIO_DATE_SQL}) = ?`, [year])
    .select(
      'C.netsuite_id',
      'C.name',
      'C.custrecord_cryo_numerocontrato as numero_contrato',
      'C.custrecord_cryo_finicio as fecha_inicio',
      'C.custrecord_cryo_estatus as estatus',
      'C.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
      'C.custrecord_cryo_moneda as moneda',
      'CUST.companyname as titular_nombre',
      'C.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
      'C.custrecord_cryo_vendedor as vendedor_id',
      'VEND.entityid as vendedor_nombre',
    );
}

/** custrecord_cryo_fecha_otroscontratos is this record's equivalent of a contract's own
 * custrecord_cryo_finicio - the date its sale is scoped to a commission period by. */
function baseOtrosContratosQuery(db: Knex, month: number, year: number): Knex.QueryBuilder {
  return db('netsuite_otros_contratos as O')
    .leftJoin('netsuite_pe_servicios as PS', 'PS.netsuite_id', 'O.custrecord_cryo_servicio_otroscontratos')
    .leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'O.custrecord_cryo_vendedor_otroscontratos')
    .whereNotNull('O.custrecord_cryo_vendedor_otroscontratos')
    .whereRaw(`MONTH(${OTROS_FECHA_DATE_SQL}) = ?`, [month])
    .whereRaw(`YEAR(${OTROS_FECHA_DATE_SQL}) = ?`, [year])
    .select(
      'O.netsuite_id',
      'O.name',
      'O.custrecord_cryo_fecha_otroscontratos as fecha',
      'O.custrecord_cryo_vendedor_otroscontratos as vendedor_id',
      'VEND.entityid as vendedor_nombre',
      'PS.name as servicio_nombre',
      'PS.custrecord_cryo_precioservicio as monto',
      'PS.custrecord_cryo_monedaprecio as moneda',
    );
}

/**
 * Resolves a signed-in user (by their Entra email) to a NetSuite employee - and only returns
 * that employee's netsuite_id if they've actually sold at least one contract/otros-contrato as
 * vendedor (an employee row with a matching email but no sales isn't a "salesperson" for this
 * purpose). Used to let a non-admin, non-'contracts'-granted user still reach their OWN
 * commissions - see isCommissionsSelfAllowed in contractReportsController.ts. Case-insensitive
 * since Entra's preferred_username casing isn't guaranteed to match how email was synced from
 * NetSuite.
 */
export async function resolveSelfVendedorId(db: Knex, email: string | null): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const employee = (await db('netsuite_employees').whereRaw('LOWER(email) = ?', [normalized]).select('netsuite_id').first()) as
    | { netsuite_id: string }
    | undefined;
  if (!employee) return null;

  const [hasContract, hasOtrosContrato] = await Promise.all([
    db('netsuite_contracts').where('custrecord_cryo_vendedor', employee.netsuite_id).select(1).first(),
    db('netsuite_otros_contratos').where('custrecord_cryo_vendedor_otroscontratos', employee.netsuite_id).select(1).first(),
  ]);

  return hasContract || hasOtrosContrato ? employee.netsuite_id : null;
}

function totalForServices(services: ServiceRow[]): number {
  return services.reduce((sum, s) => sum + Number(s.custrecord_cryo_precioprocesamiento ?? 0), 0);
}

// mssql/tedious caps the number of parameters per request (~2100) - chunk whereIn batches well
// under that so this still works for a vendedor set with hundreds of contracts in a period.
const LEGACY_LOOKUP_CHUNK_SIZE = 1000;

/**
 * Which of these Mexico contracts have DocsCompletos = 1 in the legacy Cryo.dbo.Contrato table.
 * Primary match: legacy.NetSuite = contract.name. Fallback, ONLY for a contract with no legacy
 * row at all under that name (the backfill hasn't reached it yet - confirmed live this affects
 * ~12% of legacy rows at any given time, skewed toward the most recent sales): legacy.Folio =
 * contract.folio_sistema_anterior. Never used to override a real name-based match, even one that
 * says incomplete - see the file-level comment above for why the folio fallback is safe. Returns
 * the set of contracts' own netsuite_id considered complete.
 */
async function getCompleteDocsContractIds(
  legacyDb: Knex,
  contracts: Array<{ netsuite_id: string; name: string | null; folio_sistema_anterior: string | null }>,
): Promise<Set<string>> {
  const uniqueNames = Array.from(new Set(contracts.map((c) => c.name).filter((n): n is string => Boolean(n))));
  // Every legacy NetSuite value with a row at all (regardless of DocsCompletos) - used to tell
  // "no row yet" (falls back to folio) apart from "row exists, DocsCompletos is 0" (does not).
  const namesWithLegacyRow = new Set<string>();
  const namesComplete = new Set<string>();

  for (let i = 0; i < uniqueNames.length; i += LEGACY_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueNames.slice(i, i + LEGACY_LOOKUP_CHUNK_SIZE);
    const rows = (await legacyDb('Cryo.dbo.Contrato')
      .whereIn('NetSuite', chunk)
      .select('NetSuite as name', 'DocsCompletos as docsCompletos')) as Array<{ name: string; docsCompletos: boolean | number }>;
    for (const row of rows) {
      namesWithLegacyRow.add(row.name);
      if (row.docsCompletos) namesComplete.add(row.name);
    }
  }

  const needsFolioFallback = (c: { name: string | null }) => !c.name || !namesWithLegacyRow.has(c.name);
  const folios = Array.from(
    new Set(
      contracts
        .filter((c) => needsFolioFallback(c) && c.folio_sistema_anterior)
        .map((c) => c.folio_sistema_anterior as string),
    ),
  );
  const foliosComplete = new Set<string>();
  for (let i = 0; i < folios.length; i += LEGACY_LOOKUP_CHUNK_SIZE) {
    const chunk = folios.slice(i, i + LEGACY_LOOKUP_CHUNK_SIZE);
    const rows = (await legacyDb('Cryo.dbo.Contrato').whereIn('Folio', chunk).andWhere('DocsCompletos', 1).select('Folio as folio')) as Array<{
      folio: string;
    }>;
    for (const row of rows) foliosComplete.add(row.folio);
  }

  const complete = new Set<string>();
  for (const c of contracts) {
    const viaName = Boolean(c.name && namesComplete.has(c.name));
    const viaFolio = needsFolioFallback(c) && Boolean(c.folio_sistema_anterior && foliosComplete.has(c.folio_sistema_anterior));
    if (viaName || viaFolio) complete.add(c.netsuite_id);
  }
  return complete;
}

function buildContractCommission(
  contract: ContractRow,
  services: ServiceRow[],
  anualidadPartidas: AnualidadPartidaRow[],
  tierPercentage: number | null,
  docsComplete: boolean,
): ContractCommission {
  const serviceLines: ServiceCommissionLine[] = services.map((s) => ({
    netsuite_id: s.netsuite_id,
    tipo: s.custrecord_cryo_tipodeserv,
    precio_procesamiento: Number(s.custrecord_cryo_precioprocesamiento ?? 0),
    is_placenta: s.custrecord_cryo_tipodeserv === PLACENTA_SERVICE_TYPE_ID,
  }));

  const totalServicios = totalForServices(services);
  const hasPlacenta = serviceLines.some((s) => s.is_placenta);
  // docsComplete is display-only (see the file-level comment) - it never zeroes out any of these.
  const placentaBonus = hasPlacenta ? (totalServicios * PLACENTA_BONUS_RATE) / 100 : 0;
  const tierCommission = tierPercentage !== null ? (totalServicios * tierPercentage) / 100 : 0;

  const anualidadByYear = new Map<string, number>();
  for (const partida of anualidadPartidas) {
    const anio = partida.custrecord_cryo_aniopartida ?? 'N/A';
    anualidadByYear.set(anio, (anualidadByYear.get(anio) ?? 0) + 1);
  }
  // A year with only 1 service-type Anualidad line doesn't pay - it takes more than one (e.g.
  // SCU + TCU for the same año) to count as a real anualidad renewal worth a bonus.
  const anualidades: AnualidadYearLine[] = Array.from(anualidadByYear.entries())
    .filter(([, count]) => count > 1)
    .map(([anio, count]) => ({ anio, count, monto: ANUALIDAD_BONUS_PER_YEAR }))
    .sort((a, b) => a.anio.localeCompare(b.anio));
  const anualidadBonusTotal = anualidades.length * ANUALIDAD_BONUS_PER_YEAR;

  return {
    netsuite_id: contract.netsuite_id,
    name: contract.name,
    numero_contrato: contract.numero_contrato,
    fecha_inicio: contract.fecha_inicio,
    estatus: contract.estatus,
    subsidiaria_id: contract.subsidiaria_id,
    moneda: contract.moneda,
    titular_nombre: contract.titular_nombre,
    folio_sistema_anterior: contract.folio_sistema_anterior,
    services: serviceLines,
    total_servicios: totalServicios,
    has_placenta: hasPlacenta,
    docs_completos: docsComplete,
    placenta_bonus: placentaBonus,
    tier_commission: tierCommission,
    anualidades,
    anualidad_bonus_total: anualidadBonusTotal,
    total_commission: placentaBonus + tierCommission + anualidadBonusTotal,
  };
}

function buildOtrosContratoCommission(row: OtrosContratoRow, tierPercentage: number | null): OtrosContratoCommission {
  const monto = Number(row.monto ?? 0);
  const tierCommission = tierPercentage !== null ? (monto * tierPercentage) / 100 : 0;

  return {
    netsuite_id: row.netsuite_id,
    name: row.name,
    fecha: row.fecha,
    servicio_nombre: row.servicio_nombre,
    monto,
    moneda: row.moneda,
    tier_commission: tierCommission,
  };
}

interface VendorTierContext {
  nivelContratosByVendor: Map<string, string | null>;
  totalContratosByVendor: Map<string, number>;
  tierPercentageContratosByVendor: Map<string, number | null>;
  nivelOtrosByVendor: Map<string, string | null>;
  totalOtrosByVendor: Map<string, number>;
  tierPercentageOtrosByVendor: Map<string, number | null>;
}

function getOrCreateGroup(groups: Map<string, VendedorCommissionGroup>, vendedorId: string, vendedorNombre: string | null, ctx: VendorTierContext): VendedorCommissionGroup {
  let group = groups.get(vendedorId);
  if (!group) {
    group = {
      vendedor_id: vendedorId,
      vendedor_nombre: vendedorNombre,
      nivel_contratos: ctx.nivelContratosByVendor.get(vendedorId) ?? null,
      total_ventas_contratos_periodo: ctx.totalContratosByVendor.get(vendedorId) ?? 0,
      tier_percentage_contratos: ctx.tierPercentageContratosByVendor.get(vendedorId) ?? null,
      nivel_otros_contratos: ctx.nivelOtrosByVendor.get(vendedorId) ?? null,
      total_ventas_otros_contratos_periodo: ctx.totalOtrosByVendor.get(vendedorId) ?? 0,
      tier_percentage_otros_contratos: ctx.tierPercentageOtrosByVendor.get(vendedorId) ?? null,
      contracts: [],
      contracts_count: 0,
      contracts_commission: 0,
      otros_contratos: [],
      otros_contratos_count: 0,
      otros_contratos_commission: 0,
      total_commission: 0,
    };
    groups.set(vendedorId, group);
  }
  return group;
}

/**
 * New-contract sales commissions, grouped by vendedor: every contract with a salesperson
 * (custrecord_cryo_vendedor) whose start date (custrecord_cryo_finicio) falls in the given
 * month/year, PLUS every "Otros Contratos" sale (custrecord_cryo_vendedor_otroscontratos) whose
 * own date (custrecord_cryo_fecha_otroscontratos) falls in the same month/year. Sales with no
 * vendedor assigned are excluded from both - there's no commission to pay on them.
 */
export async function getCommissionsByVendedor(
  db: Knex,
  legacyDb: Knex,
  month: number,
  year: number,
  restrictSubsidiaries: Set<string> | null,
  subsidiary?: unknown,
  currency?: string,
  /** Set only for a "self-vendedor" caller (see resolveSelfVendedorId) - narrows both display
   * queries down to that one vendedor's own sales before anything else runs, so every downstream
   * total/tier/group calculation naturally covers only them. null/undefined for every other
   * caller (admins and anyone with the 'contracts' grant see every vendedor, as before). */
  restrictVendedorId?: string | null,
): Promise<VendedorCommissionGroup[]> {
  const displayContractsQb = baseContractsQuery(db, month, year).orderBy('VEND.entityid').orderBy('C.custrecord_cryo_finicio');
  const displayOtrosQb = baseOtrosContratosQuery(db, month, year).orderBy('VEND.entityid').orderBy('O.custrecord_cryo_fecha_otroscontratos');

  if (restrictVendedorId) {
    displayContractsQb.andWhere('C.custrecord_cryo_vendedor', restrictVendedorId);
    displayOtrosQb.andWhere('O.custrecord_cryo_vendedor_otroscontratos', restrictVendedorId);
  }

  // Permission-based restriction (null = unrestricted/admin) and the caller's requested
  // subsidiary filter are independent, AND'd conditions - same convention as getPagedRows: the
  // requested filter can only narrow within what the caller is already allowed to see.
  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(displayContractsQb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
    applySubsidiaryRestriction(displayOtrosQb, OTROS_SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  const requestedSubsidiaries = parseSubsidiaryFilter(subsidiary);
  if (requestedSubsidiaries.size > 0) {
    applySubsidiaryRestriction(displayContractsQb, SUBSIDIARY_COLUMN, requestedSubsidiaries);
    applySubsidiaryRestriction(displayOtrosQb, OTROS_SUBSIDIARY_COLUMN, requestedSubsidiaries);
  }
  if (currency) {
    displayContractsQb.andWhere(CURRENCY_COLUMN, currency);
    displayOtrosQb.andWhere(OTROS_CURRENCY_COLUMN, currency);
  }

  const [displayContracts, displayOtros] = await Promise.all([
    displayContractsQb as Promise<ContractRow[]>,
    displayOtrosQb as Promise<OtrosContratoRow[]>,
  ]);
  if (displayContracts.length === 0 && displayOtros.length === 0) return [];

  const vendedorIds = Array.from(new Set([...displayContracts.map((c) => c.vendedor_id), ...displayOtros.map((o) => o.vendedor_id)]));

  // Every contract/otros-contrato these vendedores have in the period, ignoring the requested
  // subsidiary/currency filter (a display narrowing, not a security boundary) - only the
  // permission-based restriction (a real security boundary) still applies here too. Used solely to
  // compute each vendedor's TRUE total sales for tier resolution: a salesperson's rate must
  // reflect all their sales across every subsidiary, not one filtered slice of them. Contracts and
  // otros-contratos totals are kept entirely separate - they don't sum together.
  const totalsContractsQb = baseContractsQuery(db, month, year).whereIn('C.custrecord_cryo_vendedor', vendedorIds);
  const totalsOtrosQb = baseOtrosContratosQuery(db, month, year).whereIn('O.custrecord_cryo_vendedor_otroscontratos', vendedorIds);
  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(totalsContractsQb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
    applySubsidiaryRestriction(totalsOtrosQb, OTROS_SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  const [allVendorContracts, allVendorOtros] = await Promise.all([
    totalsContractsQb as Promise<ContractRow[]>,
    totalsOtrosQb as Promise<OtrosContratoRow[]>,
  ]);

  // Docs-completos is resolved purely for display now (see the file-level comment) - it no
  // longer excludes a contract from the vendedor's tier total or from its own bonuses.
  const mexicoContracts = [...displayContracts, ...allVendorContracts].filter(
    (c) => c.subsidiaria_id !== null && MEXICO_SUBSIDIARY_IDS.has(c.subsidiaria_id),
  );
  const completeDocsContractIds = await getCompleteDocsContractIds(legacyDb, mexicoContracts);
  const hasCompleteDocs = (c: ContractRow) =>
    c.subsidiaria_id === null || !MEXICO_SUBSIDIARY_IDS.has(c.subsidiaria_id) || completeDocsContractIds.has(c.netsuite_id);

  const displayContractIds = displayContracts.map((c) => c.netsuite_id);
  const allContractIds = Array.from(new Set([...allVendorContracts.map((c) => c.netsuite_id), ...displayContractIds]));

  const [services, anualidadPartidas, levels, tiers] = await Promise.all([
    db<ServiceRow>('netsuite_services')
      .whereIn('custrecord_cryo_idcontrato', allContractIds)
      .andWhere('isinactive', 'F')
      .select('netsuite_id', 'custrecord_cryo_idcontrato', 'custrecord_cryo_tipodeserv', 'custrecord_cryo_precioprocesamiento'),
    db<AnualidadPartidaRow>('netsuite_partidas')
      .whereIn('custrecord_cryo_numcontrato', displayContractIds)
      .andWhere('isinactive', 'F')
      .whereRaw("UPPER(custrecord_cryo_concepto) LIKE '%ANUALIDAD%'")
      .whereRaw("UPPER(custrecord_cryo_concepto) NOT LIKE '%PROCESAMIENTO%'")
      .select('custrecord_cryo_numcontrato', 'custrecord_cryo_aniopartida', 'custrecord_cryo_importepartida'),
    getEmployeeLevelsMap(db),
    getAllLevelTiers(db),
  ]);

  const servicesByContract = new Map<string, ServiceRow[]>();
  for (const service of services) {
    const list = servicesByContract.get(service.custrecord_cryo_idcontrato) ?? [];
    list.push(service);
    servicesByContract.set(service.custrecord_cryo_idcontrato, list);
  }

  const anualidadesByContract = new Map<string, AnualidadPartidaRow[]>();
  for (const partida of anualidadPartidas) {
    const list = anualidadesByContract.get(partida.custrecord_cryo_numcontrato) ?? [];
    list.push(partida);
    anualidadesByContract.set(partida.custrecord_cryo_numcontrato, list);
  }

  // Vendedor-level totals, across EVERY contract they sold this period (the "allVendorContracts"
  // set), not just the ones passing the requested filters - this is what determines the Contratos
  // tier. Kept entirely separate from the Otros Contratos total below. Not filtered by
  // docs-completos - see the file-level comment.
  const totalContratosByVendor = new Map<string, number>();
  for (const contract of allVendorContracts) {
    const total = totalForServices(servicesByContract.get(contract.netsuite_id) ?? []);
    totalContratosByVendor.set(contract.vendedor_id, (totalContratosByVendor.get(contract.vendedor_id) ?? 0) + total);
  }
  const totalOtrosByVendor = new Map<string, number>();
  for (const otros of allVendorOtros) {
    const monto = Number(otros.monto ?? 0);
    totalOtrosByVendor.set(otros.vendedor_id, (totalOtrosByVendor.get(otros.vendedor_id) ?? 0) + monto);
  }

  const nivelContratosByVendor = new Map<string, string | null>();
  const nivelOtrosByVendor = new Map<string, string | null>();
  const tierPercentageContratosByVendor = new Map<string, number | null>();
  const tierPercentageOtrosByVendor = new Map<string, number | null>();
  for (const vendedorId of vendedorIds) {
    const employeeLevels = levels.get(vendedorId);
    const nivelContratos = employeeLevels?.nivelContratos ?? null;
    const nivelOtros = employeeLevels?.nivelOtrosContratos ?? null;
    nivelContratosByVendor.set(vendedorId, nivelContratos);
    nivelOtrosByVendor.set(vendedorId, nivelOtros);
    tierPercentageContratosByVendor.set(vendedorId, resolveCommissionPercentage(tiers, nivelContratos, totalContratosByVendor.get(vendedorId) ?? 0));
    tierPercentageOtrosByVendor.set(vendedorId, resolveCommissionPercentage(tiers, nivelOtros, totalOtrosByVendor.get(vendedorId) ?? 0));
  }

  const ctx: VendorTierContext = {
    nivelContratosByVendor,
    totalContratosByVendor,
    tierPercentageContratosByVendor,
    nivelOtrosByVendor,
    totalOtrosByVendor,
    tierPercentageOtrosByVendor,
  };

  const groups = new Map<string, VendedorCommissionGroup>();

  for (const contract of displayContracts) {
    const tierPercentage = tierPercentageContratosByVendor.get(contract.vendedor_id) ?? null;
    const contractCommission = buildContractCommission(
      contract,
      servicesByContract.get(contract.netsuite_id) ?? [],
      anualidadesByContract.get(contract.netsuite_id) ?? [],
      tierPercentage,
      hasCompleteDocs(contract),
    );

    const group = getOrCreateGroup(groups, contract.vendedor_id, contract.vendedor_nombre, ctx);
    group.contracts.push(contractCommission);
    group.contracts_count += 1;
    group.contracts_commission += contractCommission.total_commission;
    group.total_commission += contractCommission.total_commission;
  }

  for (const otros of displayOtros) {
    const tierPercentage = tierPercentageOtrosByVendor.get(otros.vendedor_id) ?? null;
    const otrosCommission = buildOtrosContratoCommission(otros, tierPercentage);

    const group = getOrCreateGroup(groups, otros.vendedor_id, otros.vendedor_nombre, ctx);
    group.otros_contratos.push(otrosCommission);
    group.otros_contratos_count += 1;
    group.otros_contratos_commission += otrosCommission.tier_commission;
    group.total_commission += otrosCommission.tier_commission;
  }

  return Array.from(groups.values()).sort((a, b) => (a.vendedor_nombre ?? '').localeCompare(b.vendedor_nombre ?? ''));
}
