import type { Knex } from 'knex';
import { applySubsidiaryRestriction } from './reportingRepository';
import { parseNetSuiteDate } from '../mappers/utils';

/**
 * Cobranza Commissions - which partidas (services) got paid this month, grouped by contract and,
 * within each contract, by año - the data chain confirmed live against production NetSuite this
 * session: netsuite_partidas.custrecord_cryo_facturarelacionada -> netsuite_invoices (the invoice
 * that billed it) -> netsuite_payments.custbody_cryo_associated_invoices_item (a payment applied to
 * that invoice, dated within the selected month) is "this partida was paid this month".
 *
 * Dueño prefers the INVOICE's own custbody_cryo_duenio over the parent contract's
 * custrecord_cryo_duenio, falling back to the contract's when the invoice's own field is null -
 * confirmed live that 1,688 of 15,286 invoices with BOTH fields set (~11%) have an invoice dueño
 * that diverges from their contract's CURRENT dueño, because the contract's dueño was reassigned
 * sometime after the invoice was issued; reading only from the contract was silently crediting the
 * WRONG (current, not historical) dueño for that invoice's collections - from the correct dueño's
 * point of view, that invoice simply never showed up in their report. The fallback to the contract
 * is NOT optional, though: custbody_cryo_duenio is a recent addition and is still null on the large
 * majority of invoices (confirmed live: 224 of this month's 288 paid contracts have it null but DO
 * have a contract-level dueño) - without the fallback, the invoice-first read alone would newly
 * misclassify most of the report as "Bolsa", which is a worse regression than the bug it fixes.
 * Cobrador has no such fallback and is unconditionally invoice-only (custbody_cryo_cobrador) - there
 * is no cobrador field on the contract at all, so a null invoice cobrador simply falls through
 * computeAsignacion's rules below, same as before. The legacy "sistema anterior" folio and
 * subsidiaria still come from the parent contract (those aren't collections-assignment fields and
 * don't have this problem).
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
  /** The invoice's own `total` (tax included) - NOT custrecord_cryo_importepagado, a partida-level
   * custom field meant to carry this same figure but confirmed live to disagree with the invoice's
   * real total on 1,164 of 1,691 October partidas (~69%) - e.g. FV-CRYOMEX-9328's real total is
   * $2,362.15 (confirmed against the NetSuite record directly) while its partida's own
   * custrecord_cryo_importepagado read $126.08, undercounting a Dueño's commission by over $2,200
   * on that one invoice alone. Reading netsuite_invoices.total directly sidesteps that custom
   * field's staleness entirely - it's the same standard NetSuite field for every line on an
   * invoice, with no copying/stamping step that could fall out of sync. Still repeats identically
   * across every partida on the same invoice (it's the same invoice), so dedupe by `invoice_tranid`
   * is still required before summing (see utils/cobranzaCommissions.ts on the frontend). */
  importe_pagado: string | number | null;
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
  /** Taken from the first qualifying invoice encountered for this contract - in practice a contract
   * only ever has one distinct invoice paid in a given month (confirmed live: 2 of 1,869 contracts
   * had more than one over the last 12 months, and neither diverged), but nothing enforces that, so
   * this is a representative value, not a verified-unique one. */
  dueno_nombre: string | null;
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
  // netsuite_invoices.total is a decimal column - mssql returns it as a number, not a string.
  importe_pagado: string | number | null;
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
  'INVOICE.total as importe_pagado',
  'INVOICE.tranid as invoice_tranid',
  'CONTRACT.netsuite_id as contract_id',
  'CONTRACT.name as contract_name',
  'CONTRACT.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
  'CONTRACT.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
  'DUENIO.entityid as dueno_nombre',
  'COBRADOR.entityid as cobrador_nombre',
];

/** Distinct invoice netsuite_ids paid in (month, year) - checked via EITHER linkage mechanism a
 * payment might carry to its invoice: the bespoke custbody_cryo_associated_invoices_item custom
 * field, OR NetSuite's own native payment-application relationship
 * (netsuite_payment_invoice_links, synced from nexttransactionlink - see
 * paymentInvoiceLinkSyncService.ts). The custom field ALONE silently missed most real payments -
 * confirmed live that 58% of all payment-invoice applications since 2026-09-01 have it null despite
 * being genuinely, fully applied to their invoice in NetSuite (e.g. FV-CRYOMEX-9068, NetSuite status
 * "Pagado por completo", paid via PAGCRYOC-7707 with no custom field set at all) - that
 * invoice/partida never showed up in this report for any dueño/cobrador until this fix, same root
 * cause across every affected contract.
 *
 * Built as a UNION ALL joined in (not a correlated `WHERE EXISTS (... OR EXISTS (...))` per row) -
 * confirmed live the correlated-OR form made SQL Server abandon its index seeks entirely: a single
 * month's query went from >120s (timed out) to ~1s once rewritten as a join against this
 * precomputed set. */
function paidInvoicesThisMonth(db: Knex, month: number, year: number): Knex.QueryBuilder {
  const viaCustomField = db('netsuite_payments as PAY')
    .whereNotNull('PAY.custbody_cryo_associated_invoices_item')
    .whereRaw('MONTH(PAY.trandate) = ?', [month])
    .whereRaw('YEAR(PAY.trandate) = ?', [year])
    .select('PAY.custbody_cryo_associated_invoices_item as invoice_id');

  const viaNativeLink = db('netsuite_payment_invoice_links as LINK')
    .innerJoin('netsuite_payments as PAY', 'PAY.netsuite_id', 'LINK.payment_id')
    .whereRaw('MONTH(PAY.trandate) = ?', [month])
    .whereRaw('YEAR(PAY.trandate) = ?', [year])
    .select('LINK.invoice_id as invoice_id');

  // Plain UNION (not UNION ALL) - deliberately deduplicates to one row per invoice_id, so joining
  // this into baseQuery below can never multiply a partida's row just because its invoice happens
  // to have more than one qualifying payment this month (two partial payments, or the same payment
  // matching both linkage methods at once).
  return viaCustomField.union(viaNativeLink);
}

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
    .innerJoin(paidInvoicesThisMonth(db, month, year).as('PAID'), 'PAID.invoice_id', 'INVOICE.netsuite_id')
    .leftJoin('netsuite_employees as DUENIO', function (this: Knex.JoinClause) {
      this.on(db.raw('DUENIO.netsuite_id = COALESCE(INVOICE.custbody_cryo_duenio, CONTRACT.custrecord_cryo_duenio)'));
    })
    .leftJoin('netsuite_employees as COBRADOR', 'COBRADOR.netsuite_id', 'INVOICE.custbody_cryo_cobrador')
    .where('P.isinactive', 'F');

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary.size > 0) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, subsidiary);
  }

  return qb;
}

/** Shared by the JSON report route and the CSV export - same rows, same grouping, two shapes. A
 * "self cobrador/dueño" caller (see resolveSelfCobradorDuenoId) sees the SAME full report as anyone
 * else, for every cobrador/dueño - just capped to the subsidiaria(s) where they themselves have
 * contracts (restrictSubsidiaries, computed by the caller via resolveSelfCobradorDuenoSubsidiarias),
 * per explicit instruction - NOT narrowed down to only their own assigned contracts within that
 * subsidiaria. */
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

/**
 * Resolves a signed-in user (by their Entra email) to a NetSuite employee - and only returns that
 * employee's netsuite_id if they've actually ever been the resolved Dueño or Cobrador on at least
 * one invoice (or, for Dueño, on at least one contract directly - see baseQuery's COALESCE), same
 * "self access without an explicit grant" pattern as commissionsRepository.ts's
 * resolveSelfVendedorId, so a cobrador/dueño with no 'cobranza_commissions' grant still sees their
 * own collections by default, scoped to just themselves (never every contract) - see
 * contractReportsController.ts's loadCommissionsData for the equivalent full-access-vs-self
 * branching this mirrors.
 */
export async function resolveSelfCobradorDuenoId(db: Knex, email: string | null): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const employee = (await db('netsuite_employees').whereRaw('LOWER(email) = ?', [normalized]).select('netsuite_id').first()) as
    | { netsuite_id: string }
    | undefined;
  if (!employee) return null;

  const [isCobrador, isDuenoOnInvoice, isDuenoOnContract] = await Promise.all([
    db('netsuite_invoices').where('custbody_cryo_cobrador', employee.netsuite_id).select(1).first(),
    db('netsuite_invoices').where('custbody_cryo_duenio', employee.netsuite_id).select(1).first(),
    db('netsuite_contracts').where('custrecord_cryo_duenio', employee.netsuite_id).select(1).first(),
  ]);

  return isCobrador || isDuenoOnInvoice || isDuenoOnContract ? employee.netsuite_id : null;
}

/**
 * The distinct subsidiarias (custrecord_cryo_subsidiaria_partida, the SAME column
 * applySubsidiaryRestriction enforces on the main report) among partidas where this employee is the
 * resolved Dueño or Cobrador - a self cobrador/dueño may only ever see cobranza commissions in the
 * subsidiaria(s) where they actually have contracts, per explicit instruction. Deliberately NOT
 * `permissions.allowedSubsidiaries` (that's empty for a caller with no explicit grant at all, which
 * would zero out their own results) - same reasoning contractReportsController.ts's
 * loadCommissionsData documents for why the self-vendedor path skips subsidiary restriction
 * entirely; here, unlike there, the restriction is exactly what was asked for, computed from the
 * employee's REAL contracts rather than any permission grant.
 */
export async function resolveSelfCobradorDuenoSubsidiarias(db: Knex, employeeId: string): Promise<Set<string>> {
  const rows = (await db('netsuite_partidas as P')
    .innerJoin('netsuite_invoices as INVOICE', 'INVOICE.netsuite_id', 'P.custrecord_cryo_facturarelacionada')
    .innerJoin('netsuite_contracts as CONTRACT', 'CONTRACT.netsuite_id', 'P.custrecord_cryo_numcontrato')
    .where('P.isinactive', 'F')
    .andWhere((builder) => {
      builder
        .where('INVOICE.custbody_cryo_cobrador', employeeId)
        .orWhere('INVOICE.custbody_cryo_duenio', employeeId)
        .orWhere('CONTRACT.custrecord_cryo_duenio', employeeId);
    })
    .distinct('P.custrecord_cryo_subsidiaria_partida as subsidiaria_id')) as Array<{ subsidiaria_id: string | null }>;

  return new Set(rows.map((r) => r.subsidiaria_id).filter((id): id is string => id !== null));
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
