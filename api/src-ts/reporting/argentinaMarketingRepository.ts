import type { Knex } from 'knex';
import {
  addToSummary,
  emptySummary,
  type LeadDetailRow,
  type ProspectoQualificationCategory,
  type ProspectoQualificationResult,
  type QualificationByMonthRow,
  type SalesByMonthRow,
} from './marketingRepository';

/**
 * Reporte de Marketing - Argentina. Same charts and row shapes as México (marketingRepository.ts),
 * but Argentina captures its prospectos in NetSuite, not the legacy Cryo.dbo CRM: leads come from
 * netsuite_leads (synced by leadSyncService.ts) and sales from netsuite_contracts, both scoped to
 * subsidiary 20 (Biocordcell Argentina).
 *
 * Every id below is a NetSuite list internal id, confirmed live (2026-10-19) against subsidiary
 * 20's leads.
 */
const ARGENTINA_SUBSIDIARY = '20';

/** Brand list ids (shared by custentity_nso_lead_marca on leads and custrecord_nso_cc_marca_contrato_mx
 * on contracts): 4 = BIOCELLS, 9 = CRYOLAB - both included per explicit instruction, and selectable
 * one at a time (?marca=). The handful of BCU/BSCU/FCELLS/blank-brand leads under subsidiary 20
 * (~35) are left out. */
export const ARGENTINA_MARCA_IDS = ['4', '9'] as const;
export type ArgentinaMarca = (typeof ARGENTINA_MARCA_IDS)[number];

/** custentity_cryo_canalingreso values that count as Digital/online, per explicit instruction:
 * 5 REDES SOCIALES, 15 WEB, 16 WHATSAPP, 17 INSTAGRAM. Every other channel (Curso preparto, Base
 * médica, Referido..., or none) is offline - same "not one of the online ids = offline" rule as
 * México's ONLINE_TIPO_CANAL_IDS. */
const ONLINE_CANAL_IDS = ['5', '15', '16', '17'];

/**
 * custentity_cryo_motivoperdida, mapped onto three of México's categories. Argentina is NOT on
 * México's lead scoring workbook (classifyLead in marketingRepository.ts) - this is still the
 * motivo-only classification, unchanged:
 *  - No contactado: 4 "No se logro contacto/ No dio respuesta", 7 "Dato equivocado"
 *  - No calificado: 5 "No esta en embarazo", 8 "No le interesa", 10 "Prospecto duplicado",
 *    12 "Ya era cliente", 17 "No autorizó compartir sus datos"
 *  - Prospecto: every other reason (price, competitor, baby already born, public hospital...) or
 *    none at all (still open, or converted)
 */
const NO_CONTACTADO_MOTIVO_IDS = ['4', '7'];
const NO_CALIFICADO_MOTIVO_IDS = ['5', '8', '10', '12', '17'];

function categorizeMotivo(motivoId: string | null): ProspectoQualificationCategory {
  if (motivoId === null) return 'Prospecto';
  if (NO_CONTACTADO_MOTIVO_IDS.includes(motivoId)) return 'No contactado';
  if (NO_CALIFICADO_MOTIVO_IDS.includes(motivoId)) return 'No calificado';
  return 'Prospecto';
}

const sqlList = (ids: string[]) => ids.map((id) => `'${id}'`).join(', ');

// custrecord_cryo_finicio is NetSuite's locale date text ("DD/MM/YYYY") - same parse as
// commissionsRepository.ts's FECHA_INICIO_DATE_SQL.
const FECHA_INICIO_DATE_SQL = 'TRY_CONVERT(date, C.custrecord_cryo_finicio, 103)';

/**
 * Argentina sales per year/month by contract start date (custrecord_cryo_finicio), split
 * online/offline by the channel of the contract holder's own lead (custrecord_cryo_titularcontrato
 * = the lead's customer id - a lead converts in place). A contract whose holder never was a
 * NetSuite lead - confirmed live that's ~40% of them, mostly customers carried over from before the
 * NetSuite CRM - has no channel and so counts as offline. With no `marca`, every contract counts
 * regardless of brand; with one, only contracts of that brand (the contract's own brand field -
 * confirmed live every Argentina contract has it set, all Biocells so far).
 */
export async function getArgentinaSalesByMonth(db: Knex, dateFrom: string, dateTo: string, marca: ArgentinaMarca | null): Promise<SalesByMonthRow[]> {
  const rows = (await db('netsuite_contracts as C')
    .leftJoin('netsuite_leads as L', 'L.netsuite_id', 'C.custrecord_cryo_titularcontrato')
    .where('C.custrecord_cryo_subsidiariacontrato', ARGENTINA_SUBSIDIARY)
    .modify((qb) => {
      if (marca) qb.where('C.custrecord_nso_cc_marca_contrato_mx', marca);
    })
    .whereRaw(`${FECHA_INICIO_DATE_SQL} BETWEEN ? AND ?`, [dateFrom, dateTo])
    .select(
      db.raw(`YEAR(${FECHA_INICIO_DATE_SQL}) as anio`),
      db.raw(`MONTH(${FECHA_INICIO_DATE_SQL}) as mes`),
      db.raw(`IIF(L.custentity_cryo_canalingreso IN (${sqlList(ONLINE_CANAL_IDS)}), 1, 0) as es_online`),
      db.raw('COUNT(*) as cantidad'),
    )
    .groupByRaw(
      `YEAR(${FECHA_INICIO_DATE_SQL}), MONTH(${FECHA_INICIO_DATE_SQL}), IIF(L.custentity_cryo_canalingreso IN (${sqlList(ONLINE_CANAL_IDS)}), 1, 0)`,
    )) as Array<{ anio: number; mes: number; es_online: number; cantidad: number | string }>;

  const byKey = new Map<string, SalesByMonthRow>();
  for (const row of rows) {
    const key = `${row.anio}-${row.mes}`;
    const existing = byKey.get(key) ?? { anio: row.anio, mes: row.mes, online: 0, offline: 0, total: 0 };
    const cantidad = Number(row.cantidad);
    if (row.es_online) existing.online += cantidad;
    else existing.offline += cantidad;
    existing.total += cantidad;
    byKey.set(key, existing);
  }
  return Array.from(byKey.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

interface RawLeadMotivoRow {
  anio: number;
  mes: number;
  motivo_id: string | null;
  es_online: number;
  cantidad: number | string;
}

/**
 * Every Argentina lead in the range (by dategrosslead - the date it entered as a lead), qualified by
 * its motivo de pérdida and split online/offline by canal de ingreso. Same result shape as México's
 * getProspectoQualification.
 */
export async function getArgentinaLeadQualification(
  db: Knex,
  dateFrom: string,
  dateTo: string,
  marca: ArgentinaMarca | null,
): Promise<ProspectoQualificationResult> {
  const onlineSql = `IIF(L.custentity_cryo_canalingreso IN (${sqlList(ONLINE_CANAL_IDS)}), 1, 0)`;
  const rows = (await db('netsuite_leads as L')
    .where('L.subsidiary', ARGENTINA_SUBSIDIARY)
    .whereIn('L.custentity_nso_lead_marca', marca ? [marca] : [...ARGENTINA_MARCA_IDS])
    .whereBetween('L.dategrosslead', [dateFrom, dateTo])
    .select(
      db.raw('YEAR(L.dategrosslead) as anio'),
      db.raw('MONTH(L.dategrosslead) as mes'),
      'L.custentity_cryo_motivoperdida as motivo_id',
      db.raw(`${onlineSql} as es_online`),
      db.raw('COUNT(*) as cantidad'),
    )
    .groupByRaw(`YEAR(L.dategrosslead), MONTH(L.dategrosslead), L.custentity_cryo_motivoperdida, ${onlineSql}`)) as RawLeadMotivoRow[];

  const summary = emptySummary();
  const byMonth = new Map<string, QualificationByMonthRow>();

  for (const row of rows) {
    const cantidad = Number(row.cantidad);
    const categoria = categorizeMotivo(row.motivo_id);
    const canal: 'online' | 'offline' = row.es_online ? 'online' : 'offline';

    addToSummary(summary, categoria, cantidad);

    const monthKey = `${row.anio}-${row.mes}-${canal}`;
    const monthBucket = byMonth.get(monthKey) ?? { anio: row.anio, mes: row.mes, canal, ...emptySummary() };
    addToSummary(monthBucket, categoria, cantidad);
    byMonth.set(monthKey, monthBucket);
  }

  const sortedByMonth = Array.from(byMonth.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes || a.canal.localeCompare(b.canal));

  return { summary, byMonth: sortedByMonth, filterFailures: null };
}

const MARCA_LABELS: Record<string, string> = { '4': 'Biocells', '9': 'Cryolab' };

/** Every Argentina lead in the range, newest first, through the same categorizeMotivo as the charts.
 * The reason is only ever the motivo - Argentina records no attempts or due date to explain more with. */
export async function getArgentinaLeadDetails(db: Knex, dateFrom: string, dateTo: string, marca: ArgentinaMarca | null): Promise<LeadDetailRow[]> {
  const rows = (await db('netsuite_leads as L')
    .where('L.subsidiary', ARGENTINA_SUBSIDIARY)
    .whereIn('L.custentity_nso_lead_marca', marca ? [marca] : [...ARGENTINA_MARCA_IDS])
    .whereBetween('L.dategrosslead', [dateFrom, dateTo])
    .orderBy('L.dategrosslead', 'desc')
    .select(
      'L.netsuite_id',
      'L.entityid',
      'L.dategrosslead',
      'L.custentity_nso_lead_marca as marca',
      'L.custentity_cryo_canalingreso as canal_id',
      'L.canalingreso_nombre',
      'L.estadolead_nombre',
      'L.custentity_cryo_motivoperdida as motivo_id',
      'L.motivoperdida_nombre',
    )) as Array<Record<string, string | null>>;

  return rows.map((row) => {
    const categoria = categorizeMotivo(row.motivo_id);
    return {
      id: String(row.netsuite_id),
      fecha_captura: row.dategrosslead,
      lead: row.entityid,
      empresa: MARCA_LABELS[String(row.marca)] ?? String(row.marca),
      canal: row.canal_id !== null && ONLINE_CANAL_IDS.includes(row.canal_id) ? 'online' : 'offline',
      canal_nombre: row.canalingreso_nombre,
      etapa: row.estadolead_nombre,
      intentos: null,
      fecha_probable: null,
      ciudad: null,
      vendedor: null,
      motivo: row.motivoperdida_nombre,
      categoria,
      razon: row.motivo_id === null ? 'Sin motivo de pérdida: abierto o ya convertido a venta.' : `Motivo de pérdida: ${row.motivoperdida_nombre}.`,
    };
  });
}
