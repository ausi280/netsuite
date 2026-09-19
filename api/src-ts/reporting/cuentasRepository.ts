import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize, parseSubsidiaryFilter } from './reportingRepository';
import type { Paginated } from './types';

/**
 * "Cuentas" - a per-contract account/collections detail sheet the sales/collections team already
 * keeps by hand, reproduced here from two sources: NetSuite (netsuite_contracts joined to the
 * titular, the second titular/"padre" and the child - all family_members - plus the assigned
 * "dueño" employee and a services-costoanualidad rollup) and, ONLY for contracts with a legacy
 * folio match, the pre-NetSuite Cryo.dbo system (TotalAdeudo, EstatusCliente/Cobranza, Zona,
 * Metal, PagoAutomatico, TokenSAT, NoMolestar and a phone-number breakdown by type - none of
 * which have a NetSuite equivalent). Argentina/Peru contracts and any contract not yet backfilled
 * into Cryo.dbo simply have those columns come back null - that's a real "no legacy record"
 * condition, not a bug (same caveat as the DocsCompletos gate in commissionsRepository.ts).
 *
 * A handful of columns from the reference export have NO confirmed source anywhere in NetSuite or
 * Cryo.dbo after a real search of both schemas - see UNAVAILABLE_COLUMNS below. They're always
 * null here; the frontend surfaces them as a clearly-labeled "not available yet" note rather than
 * silently rendering blank cells that look like real (missing) data.
 */
export interface CuentaRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  titular_telefono: string | null;
  /** custrecord_cryo_fnacimientoconf - raw "DD/MM/YYYY" text, same shape as every other NetSuite locale date field this app already parses (see utils/format.ts's toDate on the frontend). */
  fecha_nacimiento_confirmada: string | null;
  mes_nacimiento: number | null;
  titular2_nombre: string | null;
  titular2_email: string | null;
  titular2_telefono: null;
  numero_anos: number | null;
  adeudo_total: number | null;
  interes: null;
  costo_anualidad: number | null;
  nombre_hijo: string | null;
  referencia_cie: null;
  referencia_sap: null;
  zona: string | null;
  fp_scu: null;
  fp_tcu: null;
  fp_dx: null;
  fp_adn: null;
  pago_automatico: boolean | null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
  tel_casa1: string | null;
  tel_casa2: string | null;
  cel_mama: string | null;
  cel_papa: string | null;
  tel_oficina_madre: string | null;
  tel_oficina_padre: string | null;
  tel_pariente1: string | null;
  tel_pariente2: string | null;
  super_promo: null;
  link_pago: null;
  token_sat: string | null;
  pagado_hasta_scu: null;
  pagado_hasta_tcu: null;
  pagado_hasta_dx: null;
  pagado_hasta_adn: null;
  dueno: string | null;
  no_molestar: boolean | null;
}

/** Columns from the reference export with no confirmed source in NetSuite or Cryo.dbo, after
 * checking netsuite_contracts/netsuite_services' full column lists and every Cryo.dbo table whose
 * name plausibly matched (Interes/Anualidad/SAP/CIE/SuperPromo/Pago tables). Shown to the caller
 * so the UI can render one clear note instead of pretending these are just empty for this
 * contract. */
export const UNAVAILABLE_COLUMNS: Array<{ key: keyof CuentaRow; label: string }> = [
  { key: 'titular2_telefono', label: 'Teléfono celular (Titular 2)' },
  { key: 'interes', label: 'Interés' },
  { key: 'referencia_cie', label: 'Referencia CIE NUEVA' },
  { key: 'referencia_sap', label: 'Referencia SAP' },
  { key: 'fp_scu', label: 'FP SCU' },
  { key: 'fp_tcu', label: 'FP TCU' },
  { key: 'fp_dx', label: 'FP DX' },
  { key: 'fp_adn', label: 'FP ADN' },
  { key: 'super_promo', label: 'SuperPromo' },
  { key: 'link_pago', label: 'Link Pago' },
  { key: 'pagado_hasta_scu', label: 'Pagado Hasta SCU' },
  { key: 'pagado_hasta_tcu', label: 'Pagado Hasta TCU' },
  { key: 'pagado_hasta_dx', label: 'Pagado Hasta DX' },
  { key: 'pagado_hasta_adn', label: 'Pagado Hasta ADN' },
];

const TABLE = 'netsuite_contracts as C';
const SUBSIDIARY_COLUMN = 'C.custrecord_cryo_subsidiariacontrato';

interface RawCuentaRow {
  netsuite_id: string;
  contrato: string | null;
  folio_sistema_anterior: string | null;
  subsidiaria_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  titular_telefono: string | null;
  fecha_nacimiento_confirmada: string | null;
  mes_nacimiento: number | null;
  titular2_nombre: string | null;
  titular2_email: string | null;
  dueno: string | null;
  nombre_hijo: string | null;
  costo_anualidad: number | string | null;
}

function baseCuentasQuery(db: Knex, search: string): Knex.QueryBuilder {
  const qb = db(TABLE)
    .leftJoin('netsuite_customers as TITULAR', 'TITULAR.netsuite_id', 'C.custrecord_cryo_titularcontrato')
    .leftJoin('netsuite_family_members as TITULAR2', 'TITULAR2.netsuite_id', 'C.custrecord_cryo_padres')
    .leftJoin('netsuite_employees as DUENO', 'DUENO.netsuite_id', 'C.custrecord_cryo_duenio');

  if (search) {
    qb.where((builder) => {
      builder
        .orWhere('C.name', 'like', `%${search}%`)
        .orWhere('TITULAR.companyname', 'like', `%${search}%`)
        .orWhere('C.custrecord_cryo_contratosistemaanterior', 'like', `%${search}%`);
    });
  }

  return qb;
}

function selectCuentaColumns(qb: Knex.QueryBuilder, db: Knex): Knex.QueryBuilder {
  return qb.select(
    'C.netsuite_id',
    'C.name as contrato',
    'C.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
    'C.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
    'TITULAR.companyname as titular_nombre',
    'TITULAR.email as titular_email',
    'TITULAR.phone as titular_telefono',
    'C.custrecord_cryo_fnacimientoconf as fecha_nacimiento_confirmada',
    db.raw(`MONTH(TRY_CONVERT(date, C.custrecord_cryo_fnacimientoconf, 103)) as mes_nacimiento`),
    'TITULAR2.custrecord_cryo_nombremiembro as titular2_nombre',
    'TITULAR2.custrecord_cryo_main_email as titular2_email',
    'DUENO.entityid as dueno',
    db.raw(`(
      SELECT TOP 1 FM.custrecord_cryo_nombremiembro
      FROM netsuite_family_members FM
      WHERE FM.custrecord_cryo_idfamilia = C.custrecord_cryo_numerofamilia
        AND FM.custrecord_cryo_parentesco = '1'
      ORDER BY FM.netsuite_id
    ) as nombre_hijo`),
    db.raw(`(
      SELECT SUM(TRY_CONVERT(decimal(18,2), S.custrecord_cryo_costoanualidad))
      FROM netsuite_services S
      WHERE S.custrecord_cryo_idcontrato = C.netsuite_id AND S.isinactive = 'F'
    ) as costo_anualidad`),
  );
}

// mssql/tedious caps the number of parameters per request (~2100) - same chunking convention as
// commissionsRepository.ts's getCompleteDocsContractIds.
const LEGACY_LOOKUP_CHUNK_SIZE = 1000;

interface LegacyCuentaInfo {
  numero_anos: number | null;
  adeudo_total: number | null;
  zona: string | null;
  estatus_cliente: string | null;
  estatus_cobranza: string | null;
  metal: string | null;
  pago_automatico: boolean | null;
  no_molestar: boolean | null;
  token_sat: string | null;
  tel_casa1: string | null;
  tel_casa2: string | null;
  cel_mama: string | null;
  cel_papa: string | null;
  tel_oficina_madre: string | null;
  tel_oficina_padre: string | null;
  tel_pariente1: string | null;
  tel_pariente2: string | null;
}

interface PhoneBreakdown {
  tel_casa1?: string;
  tel_casa2?: string;
  cel_mama?: string;
  cel_papa?: string;
  tel_oficina_madre?: string;
  tel_oficina_padre?: string;
  tel_pariente1?: string;
  tel_pariente2?: string;
}

/** Cryo.dbo.TipoTelefono has many duplicate-named rows across different ID_Empresa scopes (e.g.
 * "Casa" exists under ids 2/19/20/23/33) - match by name, not id, same reasoning as the label maps
 * in csvExport.ts. Returns null for phone types this report has no dedicated slot for (Nextel,
 * plain "Celular", "Comercial", "Paciente", ...). */
function phoneCategory(tipoNombre: string): keyof PhoneBreakdown | 'casa' | null {
  const normalized = tipoNombre.trim().toLowerCase();
  if (normalized === 'casa' || normalized === 'fijo' || normalized === 'residencia') return 'casa';
  if (normalized === 'cel madre' || normalized === 'celular madre') return 'cel_mama';
  if (normalized === 'cel padre' || normalized === 'celular padre') return 'cel_papa';
  if (normalized === 'oficina madre') return 'tel_oficina_madre';
  if (normalized === 'oficina padre') return 'tel_oficina_padre';
  if (normalized === 'familiar 1') return 'tel_pariente1';
  if (normalized === 'familiar 2') return 'tel_pariente2';
  return null;
}

async function getPhonesByTitular(legacyDb: Knex, titularIds: number[]): Promise<Map<number, PhoneBreakdown>> {
  const map = new Map<number, PhoneBreakdown>();
  if (titularIds.length === 0) return map;

  for (let i = 0; i < titularIds.length; i += LEGACY_LOOKUP_CHUNK_SIZE) {
    const chunk = titularIds.slice(i, i + LEGACY_LOOKUP_CHUNK_SIZE);
    const rows = (await legacyDb('Cryo.dbo.TitularTelefono as TT')
      .innerJoin('Cryo.dbo.TipoTelefono as TTT', 'TTT.ID_TipoTelefono', 'TT.ID_TipoTelefono')
      .whereIn('TT.ID_Titular', chunk)
      .orderBy('TT.ID_TitularTelefono')
      .select('TT.ID_Titular as id_titular', 'TT.Telefono as telefono', 'TTT.Nombre as tipo_nombre')) as Array<{
      id_titular: number;
      telefono: string;
      tipo_nombre: string;
    }>;

    for (const row of rows) {
      const category = phoneCategory(row.tipo_nombre);
      if (!category) continue;

      const entry = map.get(row.id_titular) ?? {};
      if (category === 'casa') {
        if (!entry.tel_casa1) entry.tel_casa1 = row.telefono;
        else if (!entry.tel_casa2) entry.tel_casa2 = row.telefono;
      } else if (!entry[category]) {
        entry[category] = row.telefono;
      }
      map.set(row.id_titular, entry);
    }
  }

  return map;
}

async function getLegacyCuentaInfoByFolio(legacyDb: Knex, folios: string[]): Promise<Map<string, LegacyCuentaInfo>> {
  const result = new Map<string, LegacyCuentaInfo>();
  if (folios.length === 0) return result;

  const contratoRows: Array<{
    folio: string;
    id_titular: number | null;
    numero_anos: number | null;
    adeudo_total: number | string | null;
    no_molestar: boolean | null;
    pago_automatico: boolean | null;
    token_sat: string | null;
    estatus_cliente: string | null;
    estatus_cobranza: string | null;
    zona: string | null;
    metal: string | null;
  }> = [];

  for (let i = 0; i < folios.length; i += LEGACY_LOOKUP_CHUNK_SIZE) {
    const chunk = folios.slice(i, i + LEGACY_LOOKUP_CHUNK_SIZE);
    const rows = await legacyDb('Cryo.dbo.Contrato as Ctr')
      .leftJoin('Cryo.dbo.Titular as T', 'T.ID_Titular', 'Ctr.ID_Titular')
      .leftJoin('Cryo.dbo.EstatusCliente as EC', 'EC.ID_EstatusCliente', 'Ctr.ID_EstatusCliente')
      .leftJoin('Cryo.dbo.EstatusCobranza as ECob', 'ECob.ID_EstatusCobranza', 'Ctr.ID_EstatusCobranza')
      .leftJoin('Cryo.dbo.Zona as Z', 'Z.ID_Zona', 'Ctr.ID_Zona')
      .leftJoin('Cryo.dbo.Metales as M', 'M.ID_Metal', 'Ctr.ID_Metal')
      .whereIn('Ctr.Folio', chunk)
      .select(
        'Ctr.Folio as folio',
        'Ctr.ID_Titular as id_titular',
        'Ctr.Anos as numero_anos',
        'Ctr.TotalAdeudo as adeudo_total',
        'Ctr.NoMolestar as no_molestar',
        'T.PagoAutomatico as pago_automatico',
        'T.TokenSAT as token_sat',
        'EC.Nombre as estatus_cliente',
        'ECob.Nombre as estatus_cobranza',
        'Z.Nombre as zona',
        'M.Nombre as metal',
      );
    contratoRows.push(...(rows as typeof contratoRows));
  }

  const titularIds = Array.from(new Set(contratoRows.map((r) => r.id_titular).filter((id): id is number => id !== null)));
  const phonesByTitular = await getPhonesByTitular(legacyDb, titularIds);

  for (const row of contratoRows) {
    const phones = row.id_titular !== null ? phonesByTitular.get(row.id_titular) ?? {} : {};
    result.set(row.folio, {
      numero_anos: row.numero_anos,
      adeudo_total: row.adeudo_total !== null ? Number(row.adeudo_total) : null,
      zona: row.zona,
      estatus_cliente: row.estatus_cliente,
      estatus_cobranza: row.estatus_cobranza,
      metal: row.metal,
      pago_automatico: row.pago_automatico,
      no_molestar: row.no_molestar,
      token_sat: row.token_sat,
      tel_casa1: phones.tel_casa1 ?? null,
      tel_casa2: phones.tel_casa2 ?? null,
      cel_mama: phones.cel_mama ?? null,
      cel_papa: phones.cel_papa ?? null,
      tel_oficina_madre: phones.tel_oficina_madre ?? null,
      tel_oficina_padre: phones.tel_oficina_padre ?? null,
      tel_pariente1: phones.tel_pariente1 ?? null,
      tel_pariente2: phones.tel_pariente2 ?? null,
    });
  }

  return result;
}

function buildCuentaRow(raw: RawCuentaRow, legacy: LegacyCuentaInfo | undefined): CuentaRow {
  return {
    netsuite_id: raw.netsuite_id,
    contrato: raw.contrato,
    folio_sistema_anterior: raw.folio_sistema_anterior,
    subsidiaria_id: raw.subsidiaria_id,
    titular_nombre: raw.titular_nombre,
    titular_email: raw.titular_email,
    titular_telefono: raw.titular_telefono,
    fecha_nacimiento_confirmada: raw.fecha_nacimiento_confirmada,
    mes_nacimiento: raw.mes_nacimiento,
    titular2_nombre: raw.titular2_nombre,
    titular2_email: raw.titular2_email,
    titular2_telefono: null,
    numero_anos: legacy?.numero_anos ?? null,
    adeudo_total: legacy?.adeudo_total ?? null,
    interes: null,
    costo_anualidad: raw.costo_anualidad !== null ? Number(raw.costo_anualidad) : null,
    nombre_hijo: raw.nombre_hijo,
    referencia_cie: null,
    referencia_sap: null,
    zona: legacy?.zona ?? null,
    fp_scu: null,
    fp_tcu: null,
    fp_dx: null,
    fp_adn: null,
    pago_automatico: legacy?.pago_automatico ?? null,
    estatus_cliente: legacy?.estatus_cliente ?? null,
    estatus_cobranza: legacy?.estatus_cobranza ?? null,
    metal: legacy?.metal ?? null,
    tel_casa1: legacy?.tel_casa1 ?? null,
    tel_casa2: legacy?.tel_casa2 ?? null,
    cel_mama: legacy?.cel_mama ?? null,
    cel_papa: legacy?.cel_papa ?? null,
    tel_oficina_madre: legacy?.tel_oficina_madre ?? null,
    tel_oficina_padre: legacy?.tel_oficina_padre ?? null,
    tel_pariente1: legacy?.tel_pariente1 ?? null,
    tel_pariente2: legacy?.tel_pariente2 ?? null,
    super_promo: null,
    link_pago: null,
    token_sat: legacy?.token_sat ?? null,
    pagado_hasta_scu: null,
    pagado_hasta_tcu: null,
    pagado_hasta_dx: null,
    pagado_hasta_adn: null,
    dueno: raw.dueno,
    no_molestar: legacy?.no_molestar ?? null,
  };
}

async function enrichWithLegacyData(legacyDb: Knex, rows: RawCuentaRow[]): Promise<CuentaRow[]> {
  const folios = Array.from(new Set(rows.map((r) => r.folio_sistema_anterior).filter((f): f is string => Boolean(f))));
  const legacyByFolio = await getLegacyCuentaInfoByFolio(legacyDb, folios);
  return rows.map((row) => buildCuentaRow(row, row.folio_sistema_anterior ? legacyByFolio.get(row.folio_sistema_anterior) : undefined));
}

export interface CuentasParams {
  page: unknown;
  pageSize: unknown;
  search: unknown;
  subsidiary: unknown;
}

export async function getCuentasPaged(
  db: Knex,
  legacyDb: Knex,
  params: CuentasParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<CuentaRow>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const requestedSubsidiaries = parseSubsidiaryFilter(params.subsidiary);

  const qb = baseCuentasQuery(db, search);
  if (restrictSubsidiaries !== null) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  if (requestedSubsidiaries.size > 0) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, requestedSubsidiaries);

  const countQb = qb.clone().clearSelect().count('* as count').first();
  const rowsQb = selectCuentaColumns(qb, db)
    .orderBy('C.lastmodifieddate_dt', 'desc')
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  const [rawRows, countRow] = await Promise.all([rowsQb as Promise<RawCuentaRow[]>, countQb as Promise<{ count: number } | undefined>]);
  const data = await enrichWithLegacyData(legacyDb, rawRows);
  const total = Number(countRow?.count ?? 0);

  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Unpaginated - the whole filtered set, for CSV export (same convention as every other entity's exportEntityRows). */
export async function getCuentasForExport(
  db: Knex,
  legacyDb: Knex,
  params: Pick<CuentasParams, 'search' | 'subsidiary'>,
  restrictSubsidiaries: Set<string> | null,
): Promise<CuentaRow[]> {
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const requestedSubsidiaries = parseSubsidiaryFilter(params.subsidiary);

  const qb = baseCuentasQuery(db, search);
  if (restrictSubsidiaries !== null) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  if (requestedSubsidiaries.size > 0) applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, requestedSubsidiaries);

  const rawRows = (await selectCuentaColumns(qb, db).orderBy('C.lastmodifieddate_dt', 'desc')) as RawCuentaRow[];
  return enrichWithLegacyData(legacyDb, rawRows);
}
