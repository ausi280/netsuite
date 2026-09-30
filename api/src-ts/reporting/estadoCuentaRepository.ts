import type { Knex } from 'knex';
import { applySubsidiaryRestriction } from './reportingRepository';

/**
 * "Estado de Cuenta" - customer-facing account statement for a single contract, styled after the
 * CryoCell reference PDFs (informe-muestra-MX-CC-*.pdf for the visual style / Edo de cta 0.pdf for
 * the content). Sourced entirely from our own already-synced NetSuite tables (no legacy Cryo.dbo
 * dependency) - the same tables contractDossierRepository.ts already reads for the contract
 * dossier view.
 *
 * Field mapping confirmed against the reference PDFs:
 *  - "ID Cliente" / "Espécimen" code (e.g. "JAL021555-1") is the LEGACY folio
 *    (custrecord_cryo_contratosistemaanterior), not the current NetSuite contract name/numero -
 *    confirmed live: today's contracts' custrecord_cryo_numerocontrato is just a small sequential
 *    number ("1", "2", "3"), nothing like the reference's code. Falls back to the contract's own
 *    NetSuite name when there's no legacy folio (a post-migration contract never had one).
 *  - "Nombre de Mamá" / a second name line = the contract's Titular / Padres family member, same
 *    mapping contractDossierRepository.ts already uses (titular_nombre / padres_nombre) - this
 *    account has no dedicated "mother"/"father" fields distinct from Titular/Padres.
 *  - "Últimos cargos" rows = netsuite_partidas, one row per charge - Concepto is printed verbatim
 *    (custrecord_cryo_concepto already embeds the contract folio and vigencia dates as free text,
 *    generated upstream), Año = custrecord_cryo_aniopartida, Pagado resolved from
 *    custrecord_cryo_estatuspartida (confirmed live via BUILTIN.DF: 1=Pagado, 2=Parcialmente
 *    pagado, 3=Pendiente, 4=Vencido). NetSuite pre-generates a partida for every remaining
 *    contract year up front (confirmed live: one real contract already has rows through 2036) -
 *    a future cargo is hidden from this list until its own due date
 *    (custrecord_cryo_fechalimitepago, "vencimiento") is within 3 months, per explicit
 *    instruction. Past/current cargos are never hidden by this rule, whatever their status.
 *  - "Cobertura por Servicio" (one row per active service - Sangre/Tejido/ADN/etc, confirmed live
 *    via the same custrecord_cryo_tipodeserv id scheme contratosReportRepository.ts/
 *    cuentasRepository.ts already use) - per-service "Fecha de Procesamiento" is
 *    netsuite_services.custrecord_cryo_fecha_procesoserv directly. Per-service "Cubierto Hasta"
 *    is netsuite_services.custrecord_cryo_pagadohasta directly, per explicit instruction - a
 *    deliberate reversal of an earlier version that instead computed MAX(finvigencia) among a
 *    service's own PAID partidas. custrecord_cryo_pagadohasta is confirmed live to hold only a
 *    bare year ("2026", "2036", never a month - sampled 2000 active services account-wide, ~4%
 *    blank, every non-blank value a clean 4-digit year), so it's shown as a bare year, not the
 *    "mes de año" phrasing an earlier version used.
 *  - "Últimos Cargos" total (total_cargos) = SUM of custrecord_cryo_importepartida across every
 *    visible cargo, per explicit instruction - a deliberate reversal of an earlier version that
 *    trusted NetSuite's own custrecord_cryo_total_adeudos rollup instead (that rollup could
 *    disagree with the itemized cargos - e.g. a contract with 16 cargos every one Vencido but a $0
 *    rollup - which is exactly why summing the actual line items was asked for here).
 *  - "Total de Adeudo" (total_adeudo) = the unpaid cargos' own importe PLUS their interés
 *    moratorio, per explicit instruction - not just the bare unpaid partida amounts.
 *    total_adeudo_con_impuesto is the with-tax counterpart: each unpaid cargo's importe_con_impuesto
 *    plus the SAME moratorio total (moratorio is already computed from the with-tax amount - see
 *    below - so it's added as-is, not taxed a second time).
 *  - Both totals are always labeled USD - confirmed live, custrecord_cryo_importepartida is
 *    already denominated in USD (custrecord_cryo_monedapartida = '2') for ~98% of all partidas
 *    account-wide, and every partida on each contract sampled here (Mexico and Peru alike) uses
 *    USD consistently. A cargo whose own moneda ISN'T USD is summed at face value anyway (no FX
 *    conversion available - custrecordcryo_tipocambiocontrato was seen live as literally "0" on
 *    a real contract, unusable as a rate) and flagged via `es_usd` so the frontend can call that
 *    out rather than silently mislabel it.
 *  - Address block = the Titular's billing address (netsuite_customer_addresses,
 *    defaultbilling='T') - see customerAddressSyncService.ts. "Almacenado en Bolsa" (storage
 *    container type) has no confirmed NetSuite source in this account and is deliberately omitted
 *    rather than guessed.
 *  - Per-cargo "importe con impuesto" = importe * 1.16 (Mexico IVA), applied ONLY when the
 *    contract's own custrecord_cryo_subsidiariacontrato is a Mexico subsidiary (same
 *    MEXICO_SUBSIDIARY_IDS set commissionsRepository.ts uses: '5'/'7'/'8') - per explicit
 *    instruction. No tax rate field is synced anywhere for any other subsidiary/country, so a
 *    non-Mexico cargo's importe_con_impuesto is left null rather than guessed at a rate.
 *  - "Interés moratorio" per cargo = moraBase * (meses_vencido * 3%), simple/non-compounding,
 *    where moraBase is the cargo's own WITH-TAX amount (importe_con_impuesto) when known, falling
 *    back to the untaxed importe for a non-Mexico contract - per explicit instruction: moratorio is
 *    calculated on the with-tax value. Applies ONLY to a Vencido (estatus_id='4') cargo.
 *    meses_vencido is DATEDIFF(MONTH, custrecord_cryo_fechalimitepago, today), confirmed live on a
 *    real contract (JAL021555-1, all 3 visible cargos due 28/02/2026) to report 7 whole months as
 *    of today (2026-09-29) - a plain calendar-month count, not a 30-day-period count. Negative/zero
 *    is clamped to 0 (covers a cargo whose own due date technically hasn't passed despite being
 *    marked Vencido).
 *  - Pre-2026 charge history ("sistema anterior", per explicit instruction: NetSuite went live in
 *    2026) comes from CryoCell.dbo.CargosNew, keyed by the contract's own legacy folio
 *    (Especimen = custrecord_cryo_contratosistemaanterior) - netsuite_partidas has NO rows at all
 *    for years before whatever was outstanding at migration time (confirmed live: contract 133042
 *    only has partidas from 2009 on, even though its legacy folio's full charge history in
 *    CargosNew goes back to 2000). Only years NOT already represented among this contract's own
 *    netsuite_partidas rows are pulled from CargosNew, to avoid double-listing (and double-summing
 *    into Total de Adeudo) the same debt twice - confirmed live that migration carried every
 *    currently-OUTSTANDING legacy charge forward into netsuite_partidas regardless of how old
 *    (contract 133042's 2009-2024 Vencido partidas are the exact same charges, same Total, even
 *    the same computed Moratorios value, as CargosNew's own rows for those years) - only its
 *    already-fully-paid 2000-2008 history was never migrated, since there's no debt attached to it.
 *  - Only PAID legacy rows are ever included, per explicit instruction - CargosNew's own
 *    "remaining owed" formula (saldo = Total - Facturado; saldo = 0 means Pagado) is used ONLY to
 *    decide that filter, never to surface a legacy cargo as a second source of debt: an unpaid
 *    CargosNew row is already represented by its netsuite_partidas equivalent (migration carried
 *    every currently-outstanding charge forward regardless of age - see above), and this legacy
 *    path is purely historical paid-charge display. A qualifying legacy cargo's importe is always
 *    its full original Total (never a partial saldo, since only saldo=0 rows qualify) and its
 *    interes_moratorio is always 0 (a paid charge has none outstanding). Currency: legacy Moneda
 *    uses a different code scheme than NetSuite's (confirmed live: 'D'/'P'/'E' vs NetSuite's
 *    picklist ids) - both sources are normalized to a single `es_usd` boolean rather than exposing
 *    either raw scheme, so the PDF's "non-USD" footnote flag works the same regardless of origin.
 */

// Same Mexico-subsidiary id set commissionsRepository.ts already uses (custrecord_cryo_subsidiariacontrato
// = '5'/'7'/'8'). No tax rate field is synced anywhere in NetSuite or the legacy Cryo.dbo tables -
// per explicit instruction, a fixed 16% IVA is applied ONLY to Mexico-subsidiary contracts; every
// other subsidiary's "importe con impuesto" is left null (unknown rate) rather than guessed.
const MEXICO_SUBSIDIARY_IDS = new Set(['5', '7', '8']);
const MEXICO_IVA_RATE = 0.16;

/** 3% of the cargo's own importe per whole month overdue, simple (non-compounding) interest -
 * per explicit instruction: importe * (meses_vencido * 0.03), never importe * 1.03^meses. Applies
 * only to a Vencido (estatus_id='4') cargo. */
const MORA_MONTHLY_RATE = 0.03;

/** NetSuite went live in 2026, per explicit instruction - only CargosNew (legacy) rows for years
 * before this are eligible to fill the pre-migration history gap. */
const MIGRATION_YEAR = 2026;

/** Below this, a legacy CargosNew balance (Total - Facturado) is treated as fully paid - guards
 * against float noise, not a real partial balance. */
const SALDO_EPSILON = 0.005;

/** CargosNew.Moneda's own code scheme (confirmed live: 'D'/'P'/'E' in active use) - only 'D'
 * ("Dólares") is USD; everything else gets the PDF's same non-USD footnote flag a NetSuite cargo
 * whose own moneda isn't USD gets. */
const LEGACY_USD_MONEDA_CODE = 'D';

const ESTATUS_PARTIDA_LABELS: Record<string, string> = {
  '1': 'Pagado',
  '2': 'Parcialmente pagado',
  '3': 'Pendiente',
  '4': 'Vencido',
};

/** Same custrecord_cryo_tipodeserv/custrecord_cryo_servtipo id scheme as
 * contratosReportRepository.ts/cuentasRepository.ts - '1' Sangre/SCU, '2' Tejido/TCU, '3' ADN,
 * '4' Diente, '15' Placenta (matches web/src/config/labels.ts's SERVICE_TYPE_LABELS). */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  '1': 'Sangre',
  '2': 'Tejido',
  '3': 'ADN',
  '4': 'Diente',
  '7': 'Fibroblastos',
  '14': 'Pulpa Dental',
  '15': 'Placenta',
};

export interface EstadoCuentaCargo {
  /** A NetSuite partida's own netsuite_id, or "legacy-<CargosNew.Id>" for a pre-migration row -
   * see the file-level comment. */
  netsuite_id: string;
  anio: string | null;
  concepto: string | null;
  estatus_id: string | null;
  estatus_label: string;
  pagado: boolean;
  /** The full original charge when pagado; the still-owed REMAINING balance when not - always
   * identical to the full charge for a netsuite-origin cargo (no partial-payment concept there),
   * but can be smaller than the original charge for a legacy CargosNew cargo - see the file-level
   * comment. */
  importe: number;
  /** Normalizes both sources' own currency schemes (NetSuite's picklist id vs CargosNew's
   * 'D'/'P'/'E' codes) into one flag the PDF checks for its non-USD footnote, rather than exposing
   * either raw scheme. */
  es_usd: boolean;
  /** importe * 1.16 (Mexico IVA) for a Mexico-subsidiary contract, or null when the contract's
   * subsidiary has no known tax rate - see MEXICO_SUBSIDIARY_IDS. */
  importe_con_impuesto: number | null;
  /** (importe_con_impuesto ?? importe) * (meses_vencido * 0.03), simple/non-compounding - see
   * MORA_MONTHLY_RATE. Always 0 for a cargo that isn't overdue, and always 0 for a legacy-origin
   * cargo (only PAID legacy history is ever included - see the file-level comment). */
  interes_moratorio: number;
}

export interface EstadoCuentaDireccion {
  addr1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface EstadoCuentaServicio {
  tipo_id: string | null;
  tipo_label: string;
  fecha_procesamiento: string | null;
  /** custrecord_cryo_pagadohasta - a bare 4-digit year (e.g. "2026"), or null when blank. */
  cubierto_hasta: string | null;
}

export interface EstadoCuenta {
  netsuite_id: string;
  fecha_emision: Date;
  /** Legacy folio (custrecord_cryo_contratosistemaanterior), falling back to the NetSuite name -
   * used for "ID Cliente" in the client info section (matches the reference PDFs' own field). */
  id_cliente: string | null;
  /** The contract's own current NetSuite name (e.g. "MX-CC-2026-106292-1") - always present,
   * shown alongside the legacy folio on the metadata line ("FOLIO: <name> (<legacy folio>)"). */
  folio_netsuite: string | null;
  nombre_titular: string | null;
  nombre_padres: string | null;
  nombre_bebe: string | null;
  fecha_nacimiento: string | null;
  direccion: EstadoCuentaDireccion | null;
  /** Sum of every visible cargo's importe (USD - see file-level comment). */
  total_cargos: number;
  /** Sum of the unpaid (not estatus_id='1') visible cargos' importe PLUS their interés moratorio
   * (USD) - see the file-level comment. */
  total_adeudo: number;
  /** Same as total_adeudo, but each cargo's with-tax importe_con_impuesto instead of its bare
   * importe (moratorio is added as-is, already with-tax - see the file-level comment), for a
   * Mexico-subsidiary contract; null otherwise - see MEXICO_SUBSIDIARY_IDS. */
  total_adeudo_con_impuesto: number | null;
  /** True when custrecord_cryo_subsidiariacontrato is a Mexico subsidiary - see MEXICO_SUBSIDIARY_IDS. */
  es_mexico: boolean;
  servicios: EstadoCuentaServicio[];
  cargos: EstadoCuentaCargo[];
}

interface RawContractRow {
  netsuite_id: string;
  name: string | null;
  folio_sistema_anterior: string | null;
  titular_id: string | null;
  titular_nombre: string | null;
  padres_nombre: string | null;
  hijo_nombre: string | null;
  fecha_nacimiento: string | null;
  subsidiaria_id: string | null;
}

interface RawServiceRow {
  custrecord_cryo_tipodeserv: string | null;
  custrecord_cryo_fecha_procesoserv: string | null;
  custrecord_cryo_pagadohasta: string | null;
}

interface RawPartidaRow {
  netsuite_id: string;
  custrecord_cryo_aniopartida: string | null;
  custrecord_cryo_concepto: string | null;
  custrecord_cryo_estatuspartida: string | null;
  custrecord_cryo_importepartida: string | number | null;
  custrecord_cryo_monedapartida: string | null;
  meses_vencido: number | null;
}

interface RawCargoNewRow {
  Id: number;
  Fecha: Date | string | null;
  Año: number | null;
  Concepto: string | null;
  Moneda: string | null;
  Total: string | number | null;
  Facturado: string | number | null;
}

/** custrecord_cryo_fechalimitepago is raw NetSuite locale date text (DD/MM/YYYY) - same
 * TRY_CONVERT SQL Server convention commissionsRepository.ts/contratosReportRepository.ts already
 * use for every other partida/contract date field. */
const FECHALIMITEPAGO_DATE_SQL = `TRY_CONVERT(date, custrecord_cryo_fechalimitepago, 103)`;

/** How far into the future a cargo's own due date may be before it's hidden from "Últimos
 * cargos" - per explicit instruction: a future annuity only appears once its vencimiento is
 * within this many months. */
const FUTURE_CARGO_VISIBILITY_MONTHS = 3;

export async function getEstadoCuenta(
  db: Knex,
  legacyDb: Knex,
  netsuiteId: string,
  restrictSubsidiaries: Set<string> | null,
): Promise<EstadoCuenta | null> {
  const contractQuery = db('netsuite_contracts as C')
    .leftJoin('netsuite_customers as TITULAR', 'TITULAR.netsuite_id', 'C.custrecord_cryo_titularcontrato')
    .leftJoin('netsuite_family_members as PADRES', 'PADRES.netsuite_id', 'C.custrecord_cryo_padres')
    .leftJoin('netsuite_family_members as HIJO', 'HIJO.netsuite_id', 'C.custrecord_cryo_especimen')
    .where('C.netsuite_id', netsuiteId);

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(contractQuery, 'C.custrecord_cryo_subsidiariacontrato', restrictSubsidiaries);
  }

  const contract = (await contractQuery.select(
      'C.netsuite_id',
      'C.name',
      'C.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
      'C.custrecord_cryo_titularcontrato as titular_id',
      'TITULAR.companyname as titular_nombre',
      'PADRES.custrecord_cryo_nombremiembro as padres_nombre',
      'HIJO.custrecord_cryo_nombremiembro as hijo_nombre',
      'C.custrecord_cryo_fnacimientoconf as fecha_nacimiento',
      'C.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
    )
    .first()) as RawContractRow | undefined;

  if (!contract) return null;

  const esMexico = Boolean(contract.subsidiaria_id && MEXICO_SUBSIDIARY_IDS.has(contract.subsidiaria_id));

  const [cargoRows, direccion, serviceRows] = await Promise.all([
    db<RawPartidaRow>('netsuite_partidas')
      .where('custrecord_cryo_numcontrato', netsuiteId)
      .andWhere((builder) => {
        builder.whereNull('custrecord_cryo_fechalimitepago').orWhereRaw(`${FECHALIMITEPAGO_DATE_SQL} <= DATEADD(MONTH, ?, CAST(GETDATE() AS date))`, [
          FUTURE_CARGO_VISIBILITY_MONTHS,
        ]);
      })
      .select(
        'netsuite_id',
        'custrecord_cryo_aniopartida',
        'custrecord_cryo_concepto',
        'custrecord_cryo_estatuspartida',
        'custrecord_cryo_importepartida',
        'custrecord_cryo_monedapartida',
        db.raw(`DATEDIFF(MONTH, ${FECHALIMITEPAGO_DATE_SQL}, CAST(GETDATE() AS date)) as meses_vencido`),
      )
      .orderBy('custrecord_cryo_aniopartida') as unknown as Promise<RawPartidaRow[]>,
    contract.titular_id
      ? (db('netsuite_customer_addresses')
          .where('customer_id', contract.titular_id)
          .andWhere('defaultbilling', 'T')
          .select('addr1', 'city', 'state', 'zip', 'country')
          .first() as Promise<EstadoCuentaDireccion | undefined>)
      : Promise.resolve(undefined),
    db<RawServiceRow>('netsuite_services')
      .where('custrecord_cryo_idcontrato', netsuiteId)
      .andWhere('isinactive', 'F')
      .select('custrecord_cryo_tipodeserv', 'custrecord_cryo_fecha_procesoserv', 'custrecord_cryo_pagadohasta'),
  ]);

  const netsuiteCargos: EstadoCuentaCargo[] = cargoRows.map((row) => {
    const estatusId = row.custrecord_cryo_estatuspartida;
    const importe = Number(row.custrecord_cryo_importepartida ?? 0);
    const importeConImpuesto = esMexico ? importe * (1 + MEXICO_IVA_RATE) : null;
    const mesesVencido = estatusId === '4' ? Math.max(0, row.meses_vencido ?? 0) : 0;
    // Moratorio is computed off the WITH-TAX amount when known (falls back to the untaxed importe
    // for a non-Mexico contract, where no tax rate is known at all) - per explicit instruction.
    const moraBase = importeConImpuesto ?? importe;
    return {
      netsuite_id: row.netsuite_id,
      anio: row.custrecord_cryo_aniopartida,
      concepto: row.custrecord_cryo_concepto,
      estatus_id: estatusId,
      estatus_label: (estatusId && ESTATUS_PARTIDA_LABELS[estatusId]) || 'Sin estatus',
      pagado: estatusId === '1',
      importe,
      es_usd: row.custrecord_cryo_monedapartida == null || row.custrecord_cryo_monedapartida === '2',
      importe_con_impuesto: importeConImpuesto,
      interes_moratorio: mesesVencido > 0 ? moraBase * (mesesVencido * MORA_MONTHLY_RATE) : 0,
    };
  });

  // Pre-2026 history from the legacy system - only for years this contract's own netsuite_partidas
  // doesn't already cover, to avoid double-listing (and double-summing) the same debt twice. See
  // the file-level comment.
  const netsuiteYears = new Set(netsuiteCargos.map((cargo) => cargo.anio).filter((anio): anio is string => anio !== null));
  const legacyRows = contract.folio_sistema_anterior
    ? ((await legacyDb<RawCargoNewRow>('CargosNew')
        .where('Especimen', contract.folio_sistema_anterior)
        .andWhere('Activo', 1)
        .select('Id', 'Fecha', 'Año', 'Concepto', 'Moneda', 'Total', 'Facturado')) as RawCargoNewRow[])
    : [];

  const legacyCargos: EstadoCuentaCargo[] = legacyRows
    .map((row) => {
      const anio = row.Año != null ? String(row.Año) : row.Fecha ? String(new Date(row.Fecha).getFullYear()) : null;
      const total = Number(row.Total ?? 0);
      const saldo = Math.max(0, total - Number(row.Facturado ?? 0));
      return { row, anio, total, pagado: saldo < SALDO_EPSILON };
    })
    // Only PAID legacy history, per explicit instruction - an unpaid CargosNew row is already
    // represented by its netsuite_partidas equivalent (migration carried every currently-
    // outstanding charge forward regardless of age - see the file-level comment), so this is
    // purely historical paid-charge display, never a second source of debt.
    .filter(({ anio, pagado }) => anio !== null && pagado && Number(anio) < MIGRATION_YEAR && !netsuiteYears.has(anio))
    .map(({ row, anio, total }) => ({
      netsuite_id: `legacy-${row.Id}`,
      anio,
      concepto: row.Concepto,
      estatus_id: '1',
      estatus_label: 'Pagado',
      pagado: true,
      importe: total,
      es_usd: row.Moneda === LEGACY_USD_MONEDA_CODE,
      importe_con_impuesto: esMexico ? total * (1 + MEXICO_IVA_RATE) : null,
      interes_moratorio: 0,
    }));

  const cargos = [...legacyCargos, ...netsuiteCargos].sort((a, b) => Number(a.anio ?? 0) - Number(b.anio ?? 0));

  const totalCargos = cargos.reduce((sum, cargo) => sum + cargo.importe, 0);
  const cargosAdeudo = cargos.filter((cargo) => !cargo.pagado);
  // Total de Adeudo = the unpaid partidas THEMSELVES plus their moratorio interest, per explicit
  // instruction - not just the bare partida amounts. total_adeudo_con_impuesto uses each cargo's
  // own with-tax amount instead (moratorio is already computed from the with-tax amount - see
  // above - so it's added as-is in both, not taxed a second time).
  const totalMoratorio = cargosAdeudo.reduce((sum, cargo) => sum + cargo.interes_moratorio, 0);
  const totalAdeudo = cargosAdeudo.reduce((sum, cargo) => sum + cargo.importe, 0) + totalMoratorio;
  const totalAdeudoConImpuesto = esMexico
    ? cargosAdeudo.reduce((sum, cargo) => sum + (cargo.importe_con_impuesto ?? 0), 0) + totalMoratorio
    : null;

  const servicios: EstadoCuentaServicio[] = serviceRows.map((row) => ({
    tipo_id: row.custrecord_cryo_tipodeserv,
    tipo_label: (row.custrecord_cryo_tipodeserv && SERVICE_TYPE_LABELS[row.custrecord_cryo_tipodeserv]) || `Tipo ${row.custrecord_cryo_tipodeserv ?? '?'}`,
    fecha_procesamiento: row.custrecord_cryo_fecha_procesoserv,
    cubierto_hasta: row.custrecord_cryo_pagadohasta || null,
  }));

  return {
    netsuite_id: contract.netsuite_id,
    fecha_emision: new Date(),
    id_cliente: contract.folio_sistema_anterior || contract.name,
    folio_netsuite: contract.name,
    nombre_titular: contract.titular_nombre,
    nombre_padres: contract.padres_nombre,
    nombre_bebe: contract.hijo_nombre,
    fecha_nacimiento: contract.fecha_nacimiento,
    direccion: direccion ?? null,
    total_cargos: totalCargos,
    total_adeudo: totalAdeudo,
    total_adeudo_con_impuesto: totalAdeudoConImpuesto,
    es_mexico: esMexico,
    servicios,
    cargos,
  };
}
