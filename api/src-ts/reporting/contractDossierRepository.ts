import type { Knex } from 'knex';
import { applySubsidiaryRestriction } from './reportingRepository';

export interface ContractDossierHeader {
  netsuite_id: string;
  name: string | null;
  folio_sistema_anterior: string | null;
  numero_contrato: string | null;
  estatus: string | null;
  isinactive: string | null;
  fecha_inicio: string | null;
  subsidiaria_id: string | null;
  moneda: string | null;
  tipo_cambio: string | null;
  saldo_inicial: string | null;
  total: number | null;
  total_adeudos: number | null;
  total_partidas: number | null;
  titular_id: string | null;
  titular_nombre: string | null;
  titular_email: string | null;
  padres_id: string | null;
  padres_nombre: string | null;
  hijo_id: string | null;
  hijo_nombre: string | null;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  cobrador_id: string | null;
  cobrador_nombre: string | null;
}

export interface ContractDossier {
  contract: ContractDossierHeader;
  services: Record<string, unknown>[];
  annuities: Record<string, unknown>[];
}

/**
 * Rich, single-contract "dossier" view - header resolved to real names (titular, padres,
 * especimen/hijo, vendedor, cobrador) plus its services and annuities (partidas), mirroring the
 * shape of the NetSuite RESTlet `nso_cryo_consulta_contratos_rs.js`'s /get response, but built
 * entirely from our own already-synced tables (no live NetSuite call needed).
 */
export async function getContractDossier(
  db: Knex,
  netsuiteId: string,
  restrictSubsidiaries: Set<string> | null,
): Promise<ContractDossier | null> {
  const headerQuery = db('netsuite_contracts as C')
    .leftJoin('netsuite_customers as CUST', 'CUST.netsuite_id', 'C.custrecord_cryo_titularcontrato')
    .leftJoin('netsuite_family_members as PADRES', 'PADRES.netsuite_id', 'C.custrecord_cryo_padres')
    .leftJoin('netsuite_family_members as HIJO', 'HIJO.netsuite_id', 'C.custrecord_cryo_especimen')
    .leftJoin('netsuite_employees as VEND', 'VEND.netsuite_id', 'C.custrecord_cryo_vendedor')
    .leftJoin('netsuite_employees as COBRADOR', 'COBRADOR.netsuite_id', 'C.custrecord_cryo_duenio')
    .where('C.netsuite_id', netsuiteId)
    .select(
      'C.netsuite_id',
      'C.name',
      'C.custrecord_cryo_contratosistemaanterior as folio_sistema_anterior',
      'C.custrecord_cryo_numerocontrato as numero_contrato',
      'C.custrecord_cryo_estatus as estatus',
      'C.isinactive',
      'C.custrecord_cryo_finicio as fecha_inicio',
      'C.custrecord_cryo_subsidiariacontrato as subsidiaria_id',
      'C.custrecord_cryo_moneda as moneda',
      'C.custrecordcryo_tipocambiocontrato as tipo_cambio',
      'C.custrecord_cryo_saldo_inicial as saldo_inicial',
      'C.raw_data',
      'C.custrecord_cryo_titularcontrato as titular_id',
      'CUST.companyname as titular_nombre',
      'CUST.email as titular_email',
      'C.custrecord_cryo_padres as padres_id',
      'PADRES.custrecord_cryo_nombremiembro as padres_nombre',
      'C.custrecord_cryo_especimen as hijo_id',
      'HIJO.custrecord_cryo_nombremiembro as hijo_nombre',
      'C.custrecord_cryo_vendedor as vendedor_id',
      'VEND.entityid as vendedor_nombre',
      'C.custrecord_cryo_duenio as cobrador_id',
      'COBRADOR.entityid as cobrador_nombre',
    );

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(headerQuery, 'C.custrecord_cryo_subsidiariacontrato', restrictSubsidiaries);
  }

  const row = await headerQuery.first();
  if (!row) return null;

  // custrecord_cryo_total/_total_adeudos/_total_partidas aren't in the curated netsuite_contracts
  // column set, but the sync stores every field NetSuite returned in raw_data - cheaper to read
  // them from there than to add and backfill 3 more dedicated columns for a detail-only view.
  let totals = { total: null as number | null, total_adeudos: null as number | null, total_partidas: null as number | null };
  if (typeof row.raw_data === 'string') {
    try {
      const raw = JSON.parse(row.raw_data);
      totals = {
        total: raw.custrecord_cryo_total != null ? Number(raw.custrecord_cryo_total) : null,
        total_adeudos: raw.custrecord_cryo_total_adeudos != null ? Number(raw.custrecord_cryo_total_adeudos) : null,
        total_partidas: raw.custrecord_cryo_total_partidas != null ? Number(raw.custrecord_cryo_total_partidas) : null,
      };
    } catch {
      // raw_data wasn't valid JSON - leave totals null rather than fail the whole dossier.
    }
  }

  const { raw_data: _rawData, ...header } = row;

  const [services, annuities] = await Promise.all([
    db('netsuite_services')
      .where('custrecord_cryo_idcontrato', netsuiteId)
      .andWhere('isinactive', 'F')
      .select(
        'netsuite_id',
        'name',
        'custrecord_cryo_serviciocontratado',
        'custrecord_cryo_tipodeserv',
        'custrecord_cryo_estatusservicio',
        'custrecord_cryo_costoanualidad',
        'custrecord_cryo_costo_anual_auto',
        'custrecord_cryo_precioprocesamiento',
        'custrecord_cryo_monedaserv',
      )
      .orderBy('name'),
    db('netsuite_partidas')
      .where('custrecord_cryo_numcontrato', netsuiteId)
      .select(
        'netsuite_id',
        'name',
        'custrecord_cryo_aniopartida',
        'custrecord_cryo_concepto',
        'custrecord_cryo_estatuspartida',
        'custrecord_cryo_importepartida',
        'custrecord_cryo_monedapartida',
        'custrecord_cryo_fechapartida',
        'custrecord_cryo_fechalimitepago',
        'custrecord_cryo_iniciovigencia',
        'custrecord_cryo_finvigencia',
        'custrecord_cryo_interes',
        'isinactive',
      )
      .orderBy('custrecord_cryo_aniopartida'),
  ]);

  return {
    contract: { ...header, ...totals } as ContractDossierHeader,
    services,
    annuities,
  };
}
