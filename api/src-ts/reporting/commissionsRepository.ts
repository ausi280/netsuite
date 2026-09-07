import type { Knex } from 'knex';
import { applySubsidiaryRestriction, parseSubsidiaryFilter } from './reportingRepository';
import { getEmployeeLevelsMap } from './employeeDetailsRepository';
import { getAllLevelTiers, resolveCommissionPercentage } from './commissionTiersRepository';

/**
 * New-contract salesperson commissions, broken down per contract so it's clear WHY a number is
 * what it is (per the "very fluent, easy to understand" ask).
 *
 * Every active service on a contract (Sangre/Tejido/ADN/Placenta/etc.) contributes its processing
 * price to that contract's total. That total feeds TWO things:
 *   - The tiered commission: the RATE is resolved once per vendedor, from their TOTAL services
 *     sum across every contract they sold in the period (every subsidiary, not just one - a
 *     salesperson's rate tier reflects their whole month's volume) - then that one rate is
 *     applied to each contract's own total.
 *   - A flat 3% Placenta bonus, ON TOP of the tiered commission, whenever the contract includes a
 *     Placenta service - computed on the contract's FULL services total (not just Placenta's own
 *     price), and paid "no matter what" nivel the vendedor is on - a fixed business rule, not one
 *     of the configurable commission_level_tiers.
 *
 * Separately, each "Anualidad" partida (a year of storage the customer prepaid in advance) pays a
 * flat $100 bonus, grouped by año for display - "Procesamiento" partidas are a different charge
 * (the one-time processing sale itself, already covered by the services total above) and never
 * count toward this bonus.
 */

// Fixed business rules, deliberately NOT part of the configurable commission_level_tiers table -
// these apply "no matter what" nivel the vendedor is on.
const PLACENTA_SERVICE_TYPE_ID = '15';
const PLACENTA_BONUS_RATE = 3; // percent, of the contract's full services total
const ANUALIDAD_BONUS_PER_YEAR_LINE = 100; // currency units, per matching partida

export interface ServiceCommissionLine {
  netsuite_id: string;
  /** NetSuite service-type list id (see SERVICE_TYPE_LABELS on the frontend for display labels) - e.g. '15' = Placenta. */
  tipo: string | null;
  precio_procesamiento: number;
  is_placenta: boolean;
}

export interface AnualidadYearLine {
  anio: string;
  count: number;
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
  services: ServiceCommissionLine[];
  /** Sum of every active service's precio_procesamiento on this contract, Placenta included - the
   * base both the tiered commission and the Placenta bonus are computed from. */
  total_servicios: number;
  has_placenta: boolean;
  /** total_servicios * 3%, only when has_placenta - 0 otherwise. */
  placenta_bonus: number;
  /** total_servicios * the vendedor's resolved tier_percentage / 100. */
  tier_commission: number;
  anualidades: AnualidadYearLine[];
  anualidad_bonus_total: number;
  total_commission: number;
}

export interface VendedorCommissionGroup {
  vendedor_id: string;
  vendedor_nombre: string | null;
  nivel: string | null;
  /** This vendedor's TOTAL services sum for the period, across every one of their contracts and
   * subsidiaries (Placenta included) - NOT limited by any subsidiary/currency filter on this
   * request, since the commission tier reflects true total volume, not one filtered slice of it. */
  total_servicios_periodo: number;
  /** The single tiered rate resolved from total_servicios_periodo under this vendedor's nivel -
   * applied uniformly to every one of their contracts below. Null if the vendedor has no nivel,
   * or that nivel has no tier covering this amount. */
  tier_percentage: number | null;
  contracts: ContractCommission[];
  contracts_count: number;
  total_commission: number;
}

const SUBSIDIARY_COLUMN = 'C.custrecord_cryo_subsidiariacontrato';
const CURRENCY_COLUMN = 'C.custrecord_cryo_moneda';
// custrecord_cryo_finicio is a raw NetSuite locale date string ("DD/MM/YYYY", confirmed 100%
// parseable on this table, same as the other custom-record date fields handled this session).
const FECHA_INICIO_DATE_SQL = `TRY_CONVERT(date, C.custrecord_cryo_finicio, 103)`;

interface ContractRow {
  netsuite_id: string;
  name: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | null;
  estatus: string | null;
  subsidiaria_id: string | null;
  moneda: string | null;
  titular_nombre: string | null;
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
      'C.custrecord_cryo_vendedor as vendedor_id',
      'VEND.entityid as vendedor_nombre',
    );
}

function totalForServices(services: ServiceRow[]): number {
  return services.reduce((sum, s) => sum + Number(s.custrecord_cryo_precioprocesamiento ?? 0), 0);
}

function buildContractCommission(
  contract: ContractRow,
  services: ServiceRow[],
  anualidadPartidas: AnualidadPartidaRow[],
  tierPercentage: number | null,
): ContractCommission {
  const serviceLines: ServiceCommissionLine[] = services.map((s) => ({
    netsuite_id: s.netsuite_id,
    tipo: s.custrecord_cryo_tipodeserv,
    precio_procesamiento: Number(s.custrecord_cryo_precioprocesamiento ?? 0),
    is_placenta: s.custrecord_cryo_tipodeserv === PLACENTA_SERVICE_TYPE_ID,
  }));

  const totalServicios = totalForServices(services);
  const hasPlacenta = serviceLines.some((s) => s.is_placenta);
  const placentaBonus = hasPlacenta ? (totalServicios * PLACENTA_BONUS_RATE) / 100 : 0;
  const tierCommission = tierPercentage !== null ? (totalServicios * tierPercentage) / 100 : 0;

  const anualidadByYear = new Map<string, number>();
  for (const partida of anualidadPartidas) {
    const anio = partida.custrecord_cryo_aniopartida ?? 'N/A';
    anualidadByYear.set(anio, (anualidadByYear.get(anio) ?? 0) + 1);
  }
  const anualidades: AnualidadYearLine[] = Array.from(anualidadByYear.entries())
    .map(([anio, count]) => ({ anio, count, monto: count * ANUALIDAD_BONUS_PER_YEAR_LINE }))
    .sort((a, b) => a.anio.localeCompare(b.anio));
  const anualidadBonusTotal = anualidades.reduce((sum, a) => sum + a.monto, 0);

  return {
    netsuite_id: contract.netsuite_id,
    name: contract.name,
    numero_contrato: contract.numero_contrato,
    fecha_inicio: contract.fecha_inicio,
    estatus: contract.estatus,
    subsidiaria_id: contract.subsidiaria_id,
    moneda: contract.moneda,
    titular_nombre: contract.titular_nombre,
    services: serviceLines,
    total_servicios: totalServicios,
    has_placenta: hasPlacenta,
    placenta_bonus: placentaBonus,
    tier_commission: tierCommission,
    anualidades,
    anualidad_bonus_total: anualidadBonusTotal,
    total_commission: placentaBonus + tierCommission + anualidadBonusTotal,
  };
}

/**
 * New-contract sales commissions, grouped by vendedor: every contract with a salesperson
 * (custrecord_cryo_vendedor) whose start date (custrecord_cryo_finicio) falls in the given
 * month/year. Contracts with no vendedor assigned are excluded - there's no commission to pay on
 * them.
 */
export async function getCommissionsByVendedor(
  db: Knex,
  month: number,
  year: number,
  restrictSubsidiaries: Set<string> | null,
  subsidiary?: unknown,
  currency?: string,
): Promise<VendedorCommissionGroup[]> {
  const displayQb = baseContractsQuery(db, month, year).orderBy('VEND.entityid').orderBy('C.custrecord_cryo_finicio');

  // Permission-based restriction (null = unrestricted/admin) and the caller's requested
  // subsidiary filter are independent, AND'd conditions - same convention as getPagedRows: the
  // requested filter can only narrow within what the caller is already allowed to see.
  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(displayQb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  const requestedSubsidiaries = parseSubsidiaryFilter(subsidiary);
  if (requestedSubsidiaries.size > 0) {
    applySubsidiaryRestriction(displayQb, SUBSIDIARY_COLUMN, requestedSubsidiaries);
  }
  if (currency) {
    displayQb.andWhere(CURRENCY_COLUMN, currency);
  }

  const displayContracts = (await displayQb) as ContractRow[];
  if (displayContracts.length === 0) return [];

  const vendedorIds = Array.from(new Set(displayContracts.map((c) => c.vendedor_id)));

  // Every contract these vendedores have in the period, ignoring the requested subsidiary/
  // currency filter (a display narrowing, not a security boundary) - only the permission-based
  // restriction (a real security boundary) still applies here too. Used solely to compute each
  // vendedor's TRUE total sales for tier resolution: a salesperson's rate must reflect all their
  // sales across every subsidiary, not one filtered slice of them.
  const totalsQb = baseContractsQuery(db, month, year).whereIn('C.custrecord_cryo_vendedor', vendedorIds);
  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(totalsQb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  const allVendorContracts = (await totalsQb) as ContractRow[];

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

  // Vendedor-level totals, across EVERY contract they sold this period (allVendorContracts),
  // not just the ones passing the requested filters - this is what actually determines the tier.
  const totalServiciosByVendor = new Map<string, number>();
  for (const contract of allVendorContracts) {
    const total = totalForServices(servicesByContract.get(contract.netsuite_id) ?? []);
    totalServiciosByVendor.set(contract.vendedor_id, (totalServiciosByVendor.get(contract.vendedor_id) ?? 0) + total);
  }

  const nivelByVendor = new Map<string, string | null>();
  const tierPercentageByVendor = new Map<string, number | null>();
  for (const vendedorId of vendedorIds) {
    const nivel = levels.get(vendedorId) ?? null;
    const total = totalServiciosByVendor.get(vendedorId) ?? 0;
    nivelByVendor.set(vendedorId, nivel);
    tierPercentageByVendor.set(vendedorId, resolveCommissionPercentage(tiers, nivel, total));
  }

  const groups = new Map<string, VendedorCommissionGroup>();
  for (const contract of displayContracts) {
    const tierPercentage = tierPercentageByVendor.get(contract.vendedor_id) ?? null;
    const contractCommission = buildContractCommission(
      contract,
      servicesByContract.get(contract.netsuite_id) ?? [],
      anualidadesByContract.get(contract.netsuite_id) ?? [],
      tierPercentage,
    );

    let group = groups.get(contract.vendedor_id);
    if (!group) {
      group = {
        vendedor_id: contract.vendedor_id,
        vendedor_nombre: contract.vendedor_nombre,
        nivel: nivelByVendor.get(contract.vendedor_id) ?? null,
        total_servicios_periodo: totalServiciosByVendor.get(contract.vendedor_id) ?? 0,
        tier_percentage: tierPercentage,
        contracts: [],
        contracts_count: 0,
        total_commission: 0,
      };
      groups.set(contract.vendedor_id, group);
    }
    group.contracts.push(contractCommission);
    group.contracts_count += 1;
    group.total_commission += contractCommission.total_commission;
  }

  return Array.from(groups.values()).sort((a, b) => (a.vendedor_nombre ?? '').localeCompare(b.vendedor_nombre ?? ''));
}
