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
 *     price to that contract's total - ONLY when that service's own Estado del Pago
 *     (custrecord_cryo_statuspagoserv) is Pagado; an unpaid/overdue service contributes nothing
 *     yet, and a contract with none of its services Pagado pays no commission at all. The
 *     Contratos RATE is resolved once per vendedor, from
 *     their TOTAL contracts-services sum across every contract they sold in the period (every
 *     subsidiary, not just one), under their nivel_contratos - then that one rate is applied to
 *     each contract's own total.
 *   - An "Otros Contratos" record (a distinct sample-collection record type, custrecord_cryo_
 *     otroscontratos) contributes its linked Servicio package's price (custrecord_cryo_
 *     precioservicio on customrecord_cryo_pe_servicios). The Otros Contratos RATE is resolved
 *     separately, from the vendedor's TOTAL otros-contratos sales sum for the period, under their
 *     nivel_otros_contratos.
 *
 * On top of the Contratos tiered commission, a contract additionally pays a flat 3% bonus whenever
 * it includes a Placenta OR an ADN service (expanded from Placenta-only on 2026-09-30, per explicit
 * instruction) - computed on the contract's FULL services total (not just the triggering service's
 * own price), paid once even if BOTH Placenta and ADN are present (not doubled), and paid "no
 * matter what" nivel the vendedor is on - a fixed business rule, not one of the configurable
 * commission_level_tiers. Otros Contratos have no equivalent bonus.
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
 * "Docs Completos" gates actual payout (reapplied per explicit instruction: "only pay a contract
 * when docscompletos = 1") - a contract with incomplete docs still shows its real total_servicios
 * (so staff can see what it WOULD pay once docs are complete), but placenta_adn_bonus,
 * tier_commission and anualidad_bonus_total are all zeroed, and the contract is excluded entirely
 * from the vendedor's tier-resolution total (totalContratosByVendor) - it contributes nothing
 * toward which nivel/percentage the vendedor resolves to, same as if it didn't exist for that
 * purpose. Otros Contratos have no equivalent legacy record/flag, so this never applies to them.
 */

// custrecord_cryo_statuspagoserv (Estado del Pago) on customrecord_cryo_servicios - confirmed live
// via BUILTIN.DF: 1=Pagado, 3=Pendiente, 4=Vencido. Only Pagado services count toward a contract's
// commission at all (total_servicios, Placenta detection, the vendedor's tier-resolution total) -
// an unpaid service simply doesn't contribute yet; if none of a contract's services are Pagado,
// its total_servicios is 0 and it pays no commission, per explicit instruction ("if not we are not
// paying comission for that contract").
const SERVICE_PAYMENT_STATUS_PAGADO = '1';

// Fixed business rules, deliberately NOT part of the configurable commission_level_tiers table -
// these apply "no matter what" nivel the vendedor is on.
// custrecord_cryo_tipodeserv ids (see SERVICE_TYPE_LABELS on the frontend) - '15' Placenta and '3'
// ADN both trigger the flat bonus below (ADN added 2026-09-30, per explicit instruction to expand
// this rule beyond Placenta-only).
const SPECIAL_BONUS_SERVICE_TYPE_IDS = new Set(['15', '3']);
const SPECIAL_BONUS_RATE = 3; // percent, of the contract's full services total
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
  /** Null when the caller lacks the 'commissions_amounts' grant - see redactCommissionAmounts. */
  precio_procesamiento: number | null;
  /** True when this line's tipo is one of the services that trigger the contract's flat 3% bonus
   * (Placenta or ADN) - see SPECIAL_BONUS_SERVICE_TYPE_IDS. */
  is_bonus_service: boolean;
}

export interface AnualidadYearLine {
  anio: string;
  /** How many service-type Anualidad lines (SCU/TCU/ADN/etc.) exist for this año - informational
   * only, since the $100 bonus is paid once per year regardless of this count. */
  count: number;
  /** Always ANUALIDAD_BONUS_PER_YEAR (one flat bonus for the year, not count * that amount). Null
   * when the caller lacks the 'commissions_amounts' grant - see redactCommissionAmounts. */
  monto: number | null;
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
  /** Pagado services only (see custrecord_cryo_statuspagoserv) - an active service with any other
   * payment status is excluded here (and from total_servicios), never shown as if it counted. */
  services: ServiceCommissionLine[];
  /** Distinct custrecord_cryo_statuspagoserv codes (see PARTIDA_STATUS_LABELS on the frontend -
   * same underlying NetSuite list) among this contract's ACTIVE services that are NOT Pagado, so
   * excluded from `services`/total_servicios/the commission figures below. Lets the UI explain WHY
   * a contract shows no services/commission when it actually has some, just unpaid - e.g. "Vencido"
   * - instead of looking identical to a contract with zero services at all. Empty when every
   * active service is Pagado, or the contract genuinely has no active services. */
  non_paid_service_statuses: string[];
  /** Sum of every active service's precio_procesamiento on this contract, Placenta/ADN included -
   * the base both the tiered commission and the special bonus are computed from. Null when the
   * caller lacks the 'commissions_amounts' grant - see redactCommissionAmounts. */
  total_servicios: number | null;
  /** True when the contract has a Placenta and/or ADN service - see SPECIAL_BONUS_SERVICE_TYPE_IDS.
   * Never redacted - this is a status flag, not a dollar amount. */
  has_bonus_service: boolean;
  /** Whether this contract's paperwork is complete in the legacy system (always true outside the
   * Mexico subsidiaries, which have no such gate). Display-only - it does NOT affect any of the
   * commission figures below, which are always computed the same regardless of this flag. Never
   * redacted - the whole point of the 'commissions' (no 'commissions_amounts') grant is to let
   * someone see and act on this flag without seeing dollar amounts. */
  docs_completos: boolean;
  /** total_servicios * 3%, only when has_bonus_service - 0 otherwise. Paid once even when the
   * contract has both Placenta and ADN, never doubled. Null when redacted (see total_servicios). */
  placenta_adn_bonus: number | null;
  /** total_servicios * the vendedor's resolved tier_percentage_contratos / 100. Null when redacted. */
  tier_commission: number | null;
  anualidades: AnualidadYearLine[];
  /** Null when redacted (see total_servicios). */
  anualidad_bonus_total: number | null;
  /** Null when redacted (see total_servicios). */
  total_commission: number | null;
}

/** An "Otros Contratos" sale (sample-collection record, not a regular contract) - its linked
 * Servicio package's price feeds its own independent tiered commission (nivel_otros_contratos),
 * with no Placenta or anualidad bonus equivalent. */
export interface OtrosContratoCommission {
  netsuite_id: string;
  name: string | null;
  fecha: string | null;
  servicio_nombre: string | null;
  /** Null when the caller lacks the 'commissions_amounts' grant - see redactCommissionAmounts. */
  monto: number | null;
  moneda: string | null;
  /** monto * the vendedor's resolved tier_percentage_otros_contratos / 100. Null when redacted. */
  tier_commission: number | null;
}

export interface VendedorCommissionGroup {
  vendedor_id: string;
  vendedor_nombre: string | null;
  /** The vendedor's Contratos nivel - independent from nivel_otros_contratos. */
  nivel_contratos: string | null;
  /** This vendedor's TOTAL contracts-services sum for the period, across every one of their
   * contracts and subsidiaries (Placenta included) - NOT limited by any subsidiary/currency filter
   * on this request, since the commission tier reflects true total volume, not one filtered slice
   * of it. Otros Contratos sales are NOT included here - the two don't sum together. Null when the
   * caller lacks the 'commissions_amounts' grant - see redactCommissionAmounts. */
  total_ventas_contratos_periodo: number | null;
  /** The tiered rate resolved from total_ventas_contratos_periodo under nivel_contratos - applied
   * uniformly to every one of this vendedor's contracts below. Null if the vendedor has no
   * nivel_contratos, or that nivel has no tier covering this amount. */
  tier_percentage_contratos: number | null;
  /** The vendedor's Otros Contratos nivel - independent from nivel_contratos. */
  nivel_otros_contratos: string | null;
  /** This vendedor's TOTAL otros-contratos sales sum for the period, across every subsidiary - NOT
   * limited by any subsidiary/currency filter on this request, and NOT combined with
   * total_ventas_contratos_periodo. Null when redacted (see total_ventas_contratos_periodo). */
  total_ventas_otros_contratos_periodo: number | null;
  /** The tiered rate resolved from total_ventas_otros_contratos_periodo under
   * nivel_otros_contratos - applied uniformly to every one of this vendedor's otros-contratos
   * below. Null if the vendedor has no nivel_otros_contratos, or that nivel has no tier covering
   * this amount. */
  tier_percentage_otros_contratos: number | null;
  contracts: ContractCommission[];
  contracts_count: number;
  /** Sum of every contract's total_commission - paid as its own transaction, separate from
   * otros_contratos_commission (per the "pay in two transactions" instruction - contracts and
   * otros-contratos are two distinct payouts, on two independent tiers). Null when redacted. */
  contracts_commission: number | null;
  otros_contratos: OtrosContratoCommission[];
  otros_contratos_count: number;
  /** Sum of every otros-contrato's tier_commission - its own separate transaction from
   * contracts_commission. Null when redacted. */
  otros_contratos_commission: number | null;
  /** contracts_commission + otros_contratos_commission - shown for convenience, not itself a
   * payout. Null when redacted (see total_ventas_contratos_periodo). */
  total_commission: number | null;
}

/**
 * Nulls out every dollar figure in the commissions grid, for a caller who's allowed to see which
 * vendedores/contracts exist and act on their Docs Completos status (e.g. someone reviewing and
 * marking DocsCompletos in the legacy system) but is NOT granted 'commissions_amounts' (see
 * isCommissionsAmountsAllowed/loadCommissionsData in contractReportsController.ts) - a deliberate
 * separation-of-duties control, requested explicitly: the person approving paperwork completeness
 * shouldn't see (or be influenced by) the money involved. Never applied to a self-vendedor's own
 * results - they always see their own real amounts, this redaction only ever applies to the
 * "see every vendedor" full-access path. Structural fields (names, dates, status, docs_completos,
 * has_bonus_service, tier_percentage_*, counts) are left untouched - only money is hidden.
 */
export function redactCommissionAmounts(groups: VendedorCommissionGroup[]): VendedorCommissionGroup[] {
  return groups.map((group) => ({
    ...group,
    total_ventas_contratos_periodo: null,
    total_ventas_otros_contratos_periodo: null,
    contracts_commission: null,
    otros_contratos_commission: null,
    total_commission: null,
    contracts: group.contracts.map((contract) => ({
      ...contract,
      services: contract.services.map((service) => ({ ...service, precio_procesamiento: null })),
      total_servicios: null,
      placenta_adn_bonus: null,
      tier_commission: null,
      anualidades: contract.anualidades.map((anualidad) => ({ ...anualidad, monto: null })),
      anualidad_bonus_total: null,
      total_commission: null,
    })),
    otros_contratos: group.otros_contratos.map((otros) => ({ ...otros, monto: null, tier_commission: null })),
  }));
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
  /** Estado del Pago (see SERVICE_PAYMENT_STATUS_PAGADO) - fetched for every active service now
   * (not just Pagado ones), so buildContractCommission can report which non-Pagado statuses are
   * present on a contract whose services are all excluded from the commission figures below. */
  custrecord_cryo_statuspagoserv: string | null;
}

interface AnualidadPartidaRow {
  custrecord_cryo_numcontrato: string;
  custrecord_cryo_aniopartida: string | null;
  custrecord_cryo_importepartida: string | number | null;
}

/**
 * A service's own custrecord_cryo_statuspagoserv is sometimes stale in NetSuite - confirmed live
 * for contracts MX-BS-2026-011818-1/011819-1/011820-2: every service row shows Vencido/Pendiente
 * (statuspagoserv '4'/'3'), while each one's own matching "Procesamiento" partida (same contract,
 * same custrecord_cryo_servtipo = the service's custrecord_cryo_tipodeserv - confirmed live these
 * reference the same NetSuite list, and the partida's own importe matches the service's
 * precioprocesamiento exactly) shows custrecord_cryo_estatuspartida = '1' Pagado. The partida is
 * the one actually tied to real payment collection, so a service now also counts as Pagado when
 * ITS OWN matching Procesamiento partida says Pagado, even if the service record's own field
 * hasn't been updated to match - see isServicePagado below. Only '1' Pagado counts here, same as
 * SERVICE_PAYMENT_STATUS_PAGADO - a Partidamente Pagado ('2') partida does NOT count as a fallback.
 */
interface ProcesamientoPartidaRow {
  custrecord_cryo_numcontrato: string;
  custrecord_cryo_servtipo: string | null;
  custrecord_cryo_estatuspartida: string | null;
}

function procesamientoPartidaKey(idContrato: string, tipoServ: string | null): string {
  return `${idContrato}-${tipoServ ?? ''}`;
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

/** A service counts as Pagado when either its own statuspagoserv says so, or its matching
 * Procesamiento partida does (see ProcesamientoPartidaRow for why the partida is also checked). */
function isServicePagado(service: ServiceRow, paidProcesamientoKeys: Set<string>): boolean {
  return (
    service.custrecord_cryo_statuspagoserv === SERVICE_PAYMENT_STATUS_PAGADO ||
    paidProcesamientoKeys.has(procesamientoPartidaKey(service.custrecord_cryo_idcontrato, service.custrecord_cryo_tipodeserv))
  );
}

/** Filters for Pagado internally (not at each call site) - `services` now always holds every
 * active service regardless of payment status (see ServiceRow.custrecord_cryo_statuspagoserv), so
 * this is the one place both callers (a contract's own total_servicios, and a vendedor's
 * tier-resolution total at the bottom of this file) rely on to keep excluding unpaid amounts. */
function totalForServices(services: ServiceRow[], paidProcesamientoKeys: Set<string>): number {
  return services
    .filter((s) => isServicePagado(s, paidProcesamientoKeys))
    .reduce((sum, s) => sum + Number(s.custrecord_cryo_precioprocesamiento ?? 0), 0);
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
  paidProcesamientoKeys: Set<string>,
  tierPercentage: number | null,
  docsComplete: boolean,
): ContractCommission {
  // `services` now holds every ACTIVE service regardless of payment status (see
  // ServiceRow.custrecord_cryo_statuspagoserv) - the displayed breakdown (serviceLines) stays
  // Pagado-only (now also via the partida fallback - see isServicePagado), same as before this
  // changed, so the "Comisión por nivel" line's listed prices always still add up to
  // total_servicios exactly as shown.
  const paidServices = services.filter((s) => isServicePagado(s, paidProcesamientoKeys));

  const serviceLines: ServiceCommissionLine[] = paidServices.map((s) => ({
    netsuite_id: s.netsuite_id,
    tipo: s.custrecord_cryo_tipodeserv,
    precio_procesamiento: Number(s.custrecord_cryo_precioprocesamiento ?? 0),
    is_bonus_service: s.custrecord_cryo_tipodeserv !== null && SPECIAL_BONUS_SERVICE_TYPE_IDS.has(s.custrecord_cryo_tipodeserv),
  }));

  // Distinct non-Pagado statuses among this contract's active services that the partida fallback
  // ALSO didn't rescue - lets the UI explain WHY it shows no services/commission when the contract
  // actually has some, just not Pagado yet (e.g. "Vencido"), instead of looking indistinguishable
  // from having zero services at all. A service whose own status says unpaid but whose partida
  // says Pagado is NOT listed here (see paidServices above - it's treated as paid, full stop).
  const nonPaidServiceStatuses = Array.from(
    new Set(
      services
        .filter((s) => !isServicePagado(s, paidProcesamientoKeys))
        .map((s) => s.custrecord_cryo_statuspagoserv)
        .filter((status): status is string => status !== null),
    ),
  );

  const totalServicios = totalForServices(services, paidProcesamientoKeys);
  const hasBonusService = serviceLines.some((s) => s.is_bonus_service);
  // Gated by docsComplete - see the file-level comment. total_servicios above is NOT gated (still
  // shows the real Pagado total regardless of docs), only these actual payout amounts are zeroed.
  const placentaAdnBonus = docsComplete && hasBonusService ? (totalServicios * SPECIAL_BONUS_RATE) / 100 : 0;
  const tierCommission = docsComplete && tierPercentage !== null ? (totalServicios * tierPercentage) / 100 : 0;

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
  const anualidadBonusTotal = docsComplete ? anualidades.length * ANUALIDAD_BONUS_PER_YEAR : 0;

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
    non_paid_service_statuses: nonPaidServiceStatuses,
    total_servicios: totalServicios,
    has_bonus_service: hasBonusService,
    docs_completos: docsComplete,
    placenta_adn_bonus: placentaAdnBonus,
    tier_commission: tierCommission,
    anualidades,
    anualidad_bonus_total: anualidadBonusTotal,
    total_commission: placentaAdnBonus + tierCommission + anualidadBonusTotal,
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

  const mexicoContracts = [...displayContracts, ...allVendorContracts].filter(
    (c) => c.subsidiaria_id !== null && MEXICO_SUBSIDIARY_IDS.has(c.subsidiaria_id),
  );
  const completeDocsContractIds = await getCompleteDocsContractIds(legacyDb, mexicoContracts);
  const hasCompleteDocs = (c: ContractRow) =>
    c.subsidiaria_id === null || !MEXICO_SUBSIDIARY_IDS.has(c.subsidiaria_id) || completeDocsContractIds.has(c.netsuite_id);

  const displayContractIds = displayContracts.map((c) => c.netsuite_id);
  const allContractIds = Array.from(new Set([...allVendorContracts.map((c) => c.netsuite_id), ...displayContractIds]));

  const [services, anualidadPartidas, procesamientoPartidas, levels, tiers] = await Promise.all([
    // No longer filtered to Pagado here (see ServiceRow.custrecord_cryo_statuspagoserv) -
    // buildContractCommission filters for Pagado itself when computing serviceLines/total/bonus,
    // but needs every active row (any status) to also report non_paid_service_statuses.
    db<ServiceRow>('netsuite_services')
      .whereIn('custrecord_cryo_idcontrato', allContractIds)
      .andWhere('isinactive', 'F')
      .select(
        'netsuite_id',
        'custrecord_cryo_idcontrato',
        'custrecord_cryo_tipodeserv',
        'custrecord_cryo_precioprocesamiento',
        'custrecord_cryo_statuspagoserv',
      ),
    db<AnualidadPartidaRow>('netsuite_partidas')
      .whereIn('custrecord_cryo_numcontrato', displayContractIds)
      .andWhere('isinactive', 'F')
      .whereRaw("UPPER(custrecord_cryo_concepto) LIKE '%ANUALIDAD%'")
      .whereRaw("UPPER(custrecord_cryo_concepto) NOT LIKE '%PROCESAMIENTO%'")
      .select('custrecord_cryo_numcontrato', 'custrecord_cryo_aniopartida', 'custrecord_cryo_importepartida'),
    // Scoped to allContractIds (every contract in the vendor's period), not just displayContractIds
    // - totalForServices also runs over allVendorContracts below, so the fallback must cover those
    // too, not only the currently-displayed/filtered ones. See ProcesamientoPartidaRow.
    db<ProcesamientoPartidaRow>('netsuite_partidas')
      .whereIn('custrecord_cryo_numcontrato', allContractIds)
      .andWhere('isinactive', 'F')
      .whereRaw("UPPER(custrecord_cryo_concepto) LIKE '%PROCESAMIENTO%'")
      .select('custrecord_cryo_numcontrato', 'custrecord_cryo_servtipo', 'custrecord_cryo_estatuspartida'),
    getEmployeeLevelsMap(db),
    getAllLevelTiers(db),
  ]);

  const paidProcesamientoKeys = new Set(
    procesamientoPartidas
      .filter((p) => p.custrecord_cryo_estatuspartida === SERVICE_PAYMENT_STATUS_PAGADO)
      .map((p) => procesamientoPartidaKey(p.custrecord_cryo_numcontrato, p.custrecord_cryo_servtipo)),
  );

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
  // tier. Kept entirely separate from the Otros Contratos total below. Skips any contract with
  // incomplete docs (see the file-level comment) - it contributes nothing toward which nivel the
  // vendedor resolves to, same as buildContractCommission zeroing that contract's own payout.
  const totalContratosByVendor = new Map<string, number>();
  for (const contract of allVendorContracts) {
    if (!hasCompleteDocs(contract)) continue;
    const total = totalForServices(servicesByContract.get(contract.netsuite_id) ?? [], paidProcesamientoKeys);
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
      paidProcesamientoKeys,
      tierPercentage,
      hasCompleteDocs(contract),
    );

    const group = getOrCreateGroup(groups, contract.vendedor_id, contract.vendedor_nombre, ctx);
    group.contracts.push(contractCommission);
    group.contracts_count += 1;
    // Never null here - buildContractCommission always computes real numbers; redaction (see
    // redactCommissionAmounts) only ever happens later, as a controller-layer post-process on the
    // fully-built result, not during this accumulation.
    group.contracts_commission = (group.contracts_commission ?? 0) + contractCommission.total_commission!;
    group.total_commission = (group.total_commission ?? 0) + contractCommission.total_commission!;
  }

  for (const otros of displayOtros) {
    const tierPercentage = tierPercentageOtrosByVendor.get(otros.vendedor_id) ?? null;
    const otrosCommission = buildOtrosContratoCommission(otros, tierPercentage);

    const group = getOrCreateGroup(groups, otros.vendedor_id, otros.vendedor_nombre, ctx);
    group.otros_contratos.push(otrosCommission);
    group.otros_contratos_count += 1;
    // Never null here - see the comment above the contracts loop.
    group.otros_contratos_commission = (group.otros_contratos_commission ?? 0) + otrosCommission.tier_commission!;
    group.total_commission = (group.total_commission ?? 0) + otrosCommission.tier_commission!;
  }

  return Array.from(groups.values()).sort((a, b) => (a.vendedor_nombre ?? '').localeCompare(b.vendedor_nombre ?? ''));
}
