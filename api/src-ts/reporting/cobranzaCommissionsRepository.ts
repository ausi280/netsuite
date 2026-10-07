import type { Knex } from 'knex';
import { applySubsidiaryRestriction } from './reportingRepository';
import { parseNetSuiteDate } from '../mappers/utils';

/**
 * Cobranza Commissions - which partidas (services) got paid this month, grouped by contract and,
 * within each contract, by año - the data chain confirmed live against production NetSuite this
 * session: netsuite_partidas.custrecord_cryo_facturarelacionada -> netsuite_invoices (the invoice
 * that billed it) -> netsuite_payments.custbody_cryo_associated_invoices_item (a payment applied to
 * that invoice, dated within the selected month) is "this partida was paid this month". The invoice
 * also carries custbody_cryo_cobrador (the collector), while dueño and the legacy "sistema
 * anterior" folio come from the parent contract - same two joins partidaListRepository.ts already
 * uses to resolve contract_name/dueno_nombre for the Partidas grid.
 *
 * This is a first pass: it only lists which partidas were paid and by/for whom - it does not yet
 * compute a commission amount or rate (no tier/percentage logic exists for cobradores today, unlike
 * the vendedor sales commissions in commissionsRepository.ts).
 *
 * `asignado_a`/`asignado_tipo` (see computeAsignacion) is the collections-assignment rule given
 * directly by the business, checked in this order:
 *
 * 1. Cobrador - a contract paid STRICTLY in advance (its earliest paid-this-month partida's
 *    custrecord_cryo_fechalimitepago is AFTER the selected period - e.g. paying in October for a
 *    November-or-later due date) AND with NO other past debt sitting anywhere else on the contract
 *    (no other still-unpaid partida with an older due date) goes to the invoice's own Cobrador
 *    (custbody_cryo_cobrador) - this covers a multi-year advance package exactly the same way as a
 *    single advance payment, since only the EARLIEST due date across the whole paid-this-month set
 *    is checked. A due date in the SAME month as the selected period (on time, not early) does NOT
 *    qualify - that falls to the Dueño rule below, same as it did before Cobrador existed. Falls
 *    through to the rules below if there's no Cobrador on file to credit, or if the Cobrador is
 *    still at the "POR DEFINIR" placeholder.
 * 2. Dueño - everything that isn't Cobrador-eligible, but whose paid-this-month partidas are ALL
 *    from the current (selected) año - no carried-over debt from a prior year. No cap on how many
 *    months behind the due date is ("vencido", however overdue, still goes to Dueño) - only the
 *    single-current-año condition matters here.
 * 3. Bolsa - everything else: multi-year debt (partidas spanning more than one año), no Dueño on
 *    file, or a Dueño still at the "POR DEFINIR" placeholder.
 *
 * "PROCESAMIENTOS" (one-time enrollment/processing fee lines, e.g. "CARGO POR PROCESAMIENTO SCU...",
 * "Inscripción y Procesamiento Infinite...") are dropped from the report entirely (per explicit
 * instruction) - identified by concepto text, not a flag: custrecord_cryo_linea_procesamiento does
 * NOT reliably mark these (confirmed live - the same NetSuite item id is reused for both
 * procesamiento and regular anualidad lines, distinguished only by concepto wording).
 *
 * Separately, a contract's very first billing cycle (e.g. the first year's Almacenamiento/Anualidad
 * lines billed alongside that same procesamiento fee) is NOT a collections/renewal event - it's the
 * initial package, already covered by the new-contract sales commission (see
 * commissionsRepository.ts), not cobranza. Per explicit instruction, this is detected purely by
 * timing: when a contract has a procesamiento partida paid in the SAME selected month as its other
 * partidas (which, since this whole report is already scoped to one month, just means "this
 * contract also has a procesamiento partida in this month's result set"), every one of its OTHER
 * partidas that month is flagged `es_paquete_inicial` - kept visible in the report (labeled "Paquete
 * Inicial de Anualidades") but excluded from the accumulated sums (see
 * utils/cobranzaCommissions.ts on the frontend).
 */

const BOLSA = 'Bolsa';
// Not a real person - the placeholder NetSuite employee name used when a Dueño or Cobrador was
// never actually set. Must never receive an assignment, same as a genuinely null name.
const SIN_ASIGNAR_PLACEHOLDER = 'POR DEFINIR';
const PROCESAMIENTO_PATTERN = /procesamiento/i;
// Shown as asignado_a instead of running the Dueño/Bolsa rule at all, for a contract whose ONLY
// paid-this-month partidas are its opening package (es_paquete_inicial) - there's nothing left to
// assign for collections purposes, so it shouldn't silently read as "Bolsa" (per explicit
// instruction, that reads as if it needed collections follow-up, which it doesn't).
const PAQUETE_INICIAL_LABEL = 'Paquete inicial de anualidades';

export type AsignacionTipo = 'dueno' | 'cobrador' | 'bolsa' | 'paquete_inicial';

export interface CobranzaCommissionPartidaRow {
  netsuite_id: string;
  concepto: string | null;
  servtipo: string | null;
  anio: string | null;
  importe: string | null;
  moneda: string | null;
  estatus: string | null;
  iniciovigencia: string | null;
  finvigencia: string | null;
  fecha_limite_pago: string | null;
  invoice_tranid: string | null;
  /** custrecord_cryo_importepagado - the TOTAL of the invoice this partida was billed on (tax
   * included), copied onto every partida line that invoice covers - confirmed live against
   * production: matches netsuite_invoices.total exactly, and for a single-line invoice is exactly
   * the partida's own `importe` × 1.16. NOT a currency conversion - it's in the SAME currency as
   * `moneda`, just the invoice's real total rather than one service's nominal catalog price.
   * Since sibling partidas on the same invoice all repeat this same value, summing it naively
   * double-counts - callers must dedupe by `invoice_tranid` first (see
   * utils/cobranzaCommissions.ts on the frontend). Null for partidas synced before this field was
   * captured. */
  importe_pagado: string | null;
  /** True when this contract also has a procesamiento (enrollment/processing fee) partida paid in
   * the same month - meaning this partida was part of the contract's initial billing package, not
   * an ongoing renewal. Excluded from accumulated sums, but still shown. See the module doc
   * comment above. */
  es_paquete_inicial: boolean;
}

export interface CobranzaCommissionYearGroup {
  anio: string;
  partidas: CobranzaCommissionPartidaRow[];
}

export interface CobranzaCommissionContractGroup {
  contract_id: string;
  contract_name: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  dueno_nombre: string | null;
  /** Taken from the first qualifying invoice encountered for this contract - in practice every
   * partida paid together on the same contract in a given month comes off the same cobrador, but
   * nothing enforces that, so this is a representative value, not a verified-unique one. */
  cobrador_nombre: string | null;
  /** The resolved assignee's display name (a Dueño's or Cobrador's name), or the literal "Bolsa" /
   * "Paquete inicial de anualidades" label - see computeAsignacion. Use `asignado_tipo` to tell
   * these apart programmatically rather than matching this string. */
  asignado_a: string;
  asignado_tipo: AsignacionTipo;
  years: CobranzaCommissionYearGroup[];
  partidas_count: number;
}

interface RawRow {
  partida_id: string;
  concepto: string | null;
  servtipo: string | null;
  anio: string | null;
  importe: string | null;
  moneda: string | null;
  estatus: string | null;
  iniciovigencia: string | null;
  finvigencia: string | null;
  fecha_limite_pago: string | null;
  invoice_tranid: string | null;
  importe_pagado: string | null;
  contract_id: string;
  contract_name: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  dueno_nombre: string | null;
  cobrador_nombre: string | null;
}

const SUBSIDIARY_COLUMN = 'P.custrecord_cryo_subsidiaria_partida';

const SELECT_COLUMNS = [
  'P.netsuite_id as partida_id',
  'P.custrecord_cryo_concepto as concepto',
  'P.custrecord_cryo_servtipo as servtipo',
  'P.custrecord_cryo_aniopartida as anio',
  'P.custrecord_cryo_importepartida as importe',
  'P.custrecord_cryo_monedapartida as moneda',
  'P.custrecord_cryo_estatuspartida as estatus',
  'P.custrecord_cryo_iniciovigencia as iniciovigencia',
  'P.custrecord_cryo_finvigencia as finvigencia',
  'P.custrecord_cryo_fechalimitepago as fecha_limite_pago',
  'P.custrecord_cryo_importepagado as importe_pagado',
  'INVOICE.tranid as invoice_tranid',
  'CONTRACT.netsuite_id as contract_id',
  'CONTRACT.name as contract_name',
  'CONTRACT.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
  'CONTRACT.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
  'DUENIO.entityid as dueno_nombre',
  'COBRADOR.entityid as cobrador_nombre',
];

function baseQuery(
  db: Knex,
  month: number,
  year: number,
  subsidiary: Set<string>,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const qb = db('netsuite_partidas as P')
    .innerJoin('netsuite_invoices as INVOICE', 'INVOICE.netsuite_id', 'P.custrecord_cryo_facturarelacionada')
    .innerJoin('netsuite_contracts as CONTRACT', 'CONTRACT.netsuite_id', 'P.custrecord_cryo_numcontrato')
    .leftJoin('netsuite_employees as DUENIO', 'DUENIO.netsuite_id', 'CONTRACT.custrecord_cryo_duenio')
    .leftJoin('netsuite_employees as COBRADOR', 'COBRADOR.netsuite_id', 'INVOICE.custbody_cryo_cobrador')
    .where('P.isinactive', 'F')
    .whereExists(function (this: Knex.QueryBuilder) {
      this.select(1)
        .from('netsuite_payments as PAY')
        .whereRaw('PAY.custbody_cryo_associated_invoices_item = INVOICE.netsuite_id')
        .whereRaw('MONTH(PAY.trandate) = ?', [month])
        .whereRaw('YEAR(PAY.trandate) = ?', [year]);
    });

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary.size > 0) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, subsidiary);
  }

  return qb;
}

/** Shared by the JSON report route and the CSV export - same rows, same grouping, two shapes. */
export async function getCobranzaCommissionsReport(
  db: Knex,
  month: number,
  year: number,
  subsidiary: Set<string>,
  restrictSubsidiaries: Set<string> | null,
): Promise<CobranzaCommissionContractGroup[]> {
  const rows: RawRow[] = await baseQuery(db, month, year, subsidiary, restrictSubsidiaries)
    .select(SELECT_COLUMNS)
    .orderBy('CONTRACT.name', 'asc')
    .orderBy('P.custrecord_cryo_aniopartida', 'asc')
    .orderBy('P.custrecord_cryo_iniciovigencia', 'asc');

  const contractsById = new Map<string, CobranzaCommissionContractGroup>();
  const yearGroupsByContract = new Map<string, Map<string, CobranzaCommissionYearGroup>>();

  for (const row of rows) {
    let contract = contractsById.get(row.contract_id);
    if (!contract) {
      contract = {
        contract_id: row.contract_id,
        contract_name: row.contract_name,
        folio_sistema_anterior: row.folio_sistema_anterior,
        subsidiaria_id: row.subsidiaria_id,
        dueno_nombre: row.dueno_nombre,
        cobrador_nombre: row.cobrador_nombre,
        asignado_a: BOLSA,
        asignado_tipo: 'bolsa',
        years: [],
        partidas_count: 0,
      };
      contractsById.set(row.contract_id, contract);
      yearGroupsByContract.set(row.contract_id, new Map());
    }

    const yearKey = row.anio ?? 'sin-anio';
    const yearGroups = yearGroupsByContract.get(row.contract_id)!;
    let yearGroup = yearGroups.get(yearKey);
    if (!yearGroup) {
      yearGroup = { anio: yearKey, partidas: [] };
      yearGroups.set(yearKey, yearGroup);
      contract.years.push(yearGroup);
    }

    yearGroup.partidas.push({
      netsuite_id: row.partida_id,
      concepto: row.concepto,
      servtipo: row.servtipo,
      anio: row.anio,
      importe: row.importe,
      moneda: row.moneda,
      estatus: row.estatus,
      iniciovigencia: row.iniciovigencia,
      finvigencia: row.finvigencia,
      fecha_limite_pago: row.fecha_limite_pago,
      invoice_tranid: row.invoice_tranid,
      importe_pagado: row.importe_pagado,
      es_paquete_inicial: false,
    });
    contract.partidas_count += 1;
  }

  const contracts = Array.from(contractsById.values()).filter(excludeProcesamientoAndFlagOpeningPackage);
  const pastDebtContractIds = await findContractsWithPastDebt(
    db,
    contracts.map((c) => c.contract_id),
    year,
    month,
  );

  for (const contract of contracts) {
    const isOnlyOpeningPackage = contract.years.every((y) => y.partidas.every((p) => p.es_paquete_inicial));
    const asignacion = isOnlyOpeningPackage
      ? { nombre: PAQUETE_INICIAL_LABEL, tipo: 'paquete_inicial' as const }
      : computeAsignacion(contract, year, month, pastDebtContractIds.has(contract.contract_id));
    contract.asignado_a = asignacion.nombre;
    contract.asignado_tipo = asignacion.tipo;
  }
  return contracts;
}

/** Contract ids with at least one OTHER still-unpaid partida (custrecord_cryo_estatuspartida not
 * '1'/Pagado - a partida this report's own payment just settled is already back to Pagado by now,
 * so it never counts here) whose due date is strictly before the selected period - i.e. real,
 * separate lingering arrears, not anything to do with what just got paid. Required for the Cobrador
 * rule's "no past debt" condition. */
async function findContractsWithPastDebt(db: Knex, contractIds: string[], year: number, month: number): Promise<Set<string>> {
  if (contractIds.length === 0) return new Set();

  const referenceDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const rows: Array<{ contract_id: string }> = await db('netsuite_partidas')
    .whereIn('custrecord_cryo_numcontrato', contractIds)
    .andWhere('isinactive', 'F')
    .andWhere(function (this: Knex.QueryBuilder) {
      this.whereNull('custrecord_cryo_estatuspartida').orWhereNot('custrecord_cryo_estatuspartida', '1');
    })
    .andWhereRaw("TRY_CONVERT(date, custrecord_cryo_fechalimitepago, 103) < ?", [referenceDate])
    .distinct('custrecord_cryo_numcontrato as contract_id');

  return new Set(rows.map((r) => r.contract_id));
}

/** Mutates `contract.years` in place: drops every procesamiento-concept partida, and - only when
 * at least one was found this month - flags every remaining partida on the contract as
 * `es_paquete_inicial`. Returns false when nothing is left to show (the contract had ONLY a
 * procesamiento partida paid this month), so the caller can drop the whole contract. */
function excludeProcesamientoAndFlagOpeningPackage(contract: CobranzaCommissionContractGroup): boolean {
  let hadProcesamiento = false;
  let remaining = 0;

  for (const yearGroup of contract.years) {
    const before = yearGroup.partidas.length;
    yearGroup.partidas = yearGroup.partidas.filter((p) => !PROCESAMIENTO_PATTERN.test(p.concepto ?? ''));
    if (yearGroup.partidas.length !== before) hadProcesamiento = true;
    remaining += yearGroup.partidas.length;
  }
  contract.years = contract.years.filter((y) => y.partidas.length > 0);

  if (hadProcesamiento) {
    for (const yearGroup of contract.years) {
      for (const partida of yearGroup.partidas) {
        partida.es_paquete_inicial = true;
      }
    }
  }

  contract.partidas_count = remaining;
  return remaining > 0;
}

interface Asignacion {
  nombre: string;
  tipo: AsignacionTipo;
}

/** See the module doc comment above for the rule itself. `year`/`month` are the report's selected
 * period (the reference point "how many months behind/ahead" is measured from), not the real
 * current date - so re-viewing a past month's report always reproduces the same assignment.
 * `hasPastDebt` comes from findContractsWithPastDebt - the Cobrador rule's "no past debt"
 * condition. */
function computeAsignacion(contract: CobranzaCommissionContractGroup, year: number, month: number, hasPastDebt: boolean): Asignacion {
  const allDueDates = contract.years
    .flatMap((y) => y.partidas)
    .map((p) => parseNetSuiteDate(p.fecha_limite_pago))
    .filter((d): d is Date => d !== null);
  const reference = new Date(year, month - 1, 1);
  const monthsBehindOf = (due: Date) => (reference.getFullYear() - due.getFullYear()) * 12 + (reference.getMonth() - due.getMonth());

  if (allDueDates.length > 0 && !hasPastDebt && contract.cobrador_nombre && contract.cobrador_nombre !== SIN_ASIGNAR_PLACEHOLDER) {
    const earliestDueOverall = new Date(Math.min(...allDueDates.map((d) => d.getTime())));
    // < 0 means the earliest paid-this-month due date is STRICTLY AFTER the selected period - a
    // genuine advance payment. Same month (=== 0, paid right on schedule) falls through to the
    // Dueño rule below instead - only early counts as Cobrador. Covers a multi-year advance
    // package the same way as a single advance payment, since only the earliest due date across
    // the whole set matters.
    if (monthsBehindOf(earliestDueOverall) < 0) {
      return { nombre: contract.cobrador_nombre, tipo: 'cobrador' };
    }
  }

  if (!contract.dueno_nombre || contract.dueno_nombre === SIN_ASIGNAR_PLACEHOLDER) return { nombre: BOLSA, tipo: 'bolsa' };
  if (contract.years.length !== 1 || contract.years[0].anio !== String(year)) return { nombre: BOLSA, tipo: 'bolsa' };

  // No cap on how far behind - "vencido" (overdue), however many months, still goes to Dueño as
  // long as it's single-current-year debt. Still requires at least one parseable due date, as a
  // minimal data-integrity guard against a malformed/empty record.
  const hasAnyDueDate = contract.years[0].partidas.some((p) => parseNetSuiteDate(p.fecha_limite_pago) !== null);
  return hasAnyDueDate ? { nombre: contract.dueno_nombre, tipo: 'dueno' } : { nombre: BOLSA, tipo: 'bolsa' };
}
