import type { Knex } from 'knex';
import { getAllLevelTiers } from './commissionTiersRepository';
import { resolveSelfVendedorId } from './commissionsRepository';
import { applySubsidiaryRestriction } from './reportingRepository';

/**
 * Monthly "Plan de trabajo" for vendedores - the visitas médicas / eventos / cursos they plan for a
 * month, downloadable as a PDF for their gerente (see salesWorkPlanPdf.ts). Replaces the standalone
 * plan.html page the gerencia used to hand out as a link (which only saved to the vendedor's own
 * browser).
 *
 * The venta objetivos aren't captured anywhere - they come from the vendedor's niveles: the first
 * tier (the amount where commission starts) of their nivel_contratos is the Venta CORE goal and of
 * their nivel_otros_contratos the Venta Genética goal, both with IVA (tiers are without IVA, while
 * the gerencia states goals with IVA - e.g. OC's first tier $28,000 x 1.16 = $32,480). The rest of
 * the objetivos (visitas, prospectos...) are free text the gerencia sets per month.
 */

const PLANS = 'sales_work_plans';
const ACTIVITIES = 'sales_work_plan_activities';
const IVA_RATE = 1.16;

export const ACTIVITY_TYPES = ['Visita médica', 'Evento', 'Curso psicoprofiláctico', 'Plática doulas', 'Capacitación enfermería'] as const;
export const VISIT_TYPE = 'Visita médica';

export interface WorkPlanActivity {
  id: number;
  fecha: string; // YYYY-MM-DD
  hora: string | null; // HH:MM
  tipo: string;
  medico_netsuite_id: string | null;
  medico_nombre: string | null;
  hospital_netsuite_id: string | null;
  hospital_nombre: string | null;
  especialidad: string | null;
  motivo: string | null;
  evento_nombre: string | null;
  sede: string | null;
  asistentes: number | null;
  requerimientos: string[];
  notas: string | null;
}

export type WorkPlanActivityInput = Omit<WorkPlanActivity, 'id'>;

export interface VentaObjetivos {
  nivel_contratos: string | null;
  nivel_otros_contratos: string | null;
  /** First tier of nivel_contratos x IVA - null when no nivel or that nivel has no tiers. */
  core: number | null;
  /** First tier of nivel_otros_contratos x IVA. */
  genetica: number | null;
}

export interface WorkPlan {
  vendedor_id: string;
  vendedor_nombre: string;
  year: number;
  month: number;
  puesto: string | null;
  objetivos: string[];
  venta: VentaObjetivos;
  activities: WorkPlanActivity[];
}

export interface PlanVendedor {
  netsuite_id: string;
  nombre: string;
  nivel_contratos: string | null;
  nivel_otros_contratos: string | null;
}

/** "PIÑA COSIO, VIRIDIANA" -> "Viridiana Piña Cosio" - NetSuite's entityid is "APELLIDOS, NOMBRE" in caps. */
export function personName(entityid: string | null): string {
  if (!entityid) return '';
  const [apellidos, nombre] = entityid.split(',').map((s) => s.trim());
  const ordered = nombre ? `${nombre} ${apellidos}` : apellidos;
  return ordered
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && ['de', 'del', 'la', 'las', 'los', 'y'].includes(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function parseJsonList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The employee the signed-in user may plan for themselves: their netsuite_employees row (by email,
 * case-insensitive) when they have a nivel assigned - a new vendedor gets a nivel before their first
 * sale, so this can't rely on resolveSelfVendedorId alone - or has sold something.
 */
export async function resolveSelfPlanVendedorId(db: Knex, email: string | null): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const employee = (await db('netsuite_employees as E')
    .leftJoin('employee_details as D', 'D.employee_netsuite_id', 'E.netsuite_id')
    .whereRaw('LOWER(E.email) = ?', [normalized])
    .select('E.netsuite_id', 'D.nivel_contratos', 'D.nivel_otros_contratos')
    .first()) as { netsuite_id: string; nivel_contratos: string | null; nivel_otros_contratos: string | null } | undefined;
  if (!employee) return null;
  if (employee.nivel_contratos || employee.nivel_otros_contratos) return employee.netsuite_id;
  return resolveSelfVendedorId(db, email);
}

/** Vendedores a gerente can pick: every active employee with a nivel assigned, plus anyone who
 * already has a plan (so an old plan stays reachable after their nivel is cleared). */
export async function listPlanVendedores(db: Knex): Promise<PlanVendedor[]> {
  const rows = (await db('netsuite_employees as E')
    .leftJoin('employee_details as D', 'D.employee_netsuite_id', 'E.netsuite_id')
    .where((b) =>
      b
        .where((active) => active.where('E.isinactive', false).andWhere((n) => n.whereNotNull('D.nivel_contratos').orWhereNotNull('D.nivel_otros_contratos')))
        .orWhereIn('E.netsuite_id', db(PLANS).distinct('vendedor_id')),
    )
    .select('E.netsuite_id', 'E.entityid', 'D.nivel_contratos', 'D.nivel_otros_contratos')) as Array<{
    netsuite_id: string;
    entityid: string | null;
    nivel_contratos: string | null;
    nivel_otros_contratos: string | null;
  }>;
  return rows
    .map((r) => ({ netsuite_id: r.netsuite_id, nombre: personName(r.entityid), nivel_contratos: r.nivel_contratos, nivel_otros_contratos: r.nivel_otros_contratos }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function getVentaObjetivos(db: Knex, vendedorId: string): Promise<VentaObjetivos> {
  const [details, tiers] = await Promise.all([
    db('employee_details').where('employee_netsuite_id', vendedorId).select('nivel_contratos', 'nivel_otros_contratos').first() as Promise<
      { nivel_contratos: string | null; nivel_otros_contratos: string | null } | undefined
    >,
    getAllLevelTiers(db),
  ]);
  const firstTier = (nivel: string | null): number | null => {
    if (!nivel) return null;
    const mins = tiers.filter((t) => t.nivel === nivel).map((t) => t.min_amount);
    return mins.length > 0 ? Math.round(Math.min(...mins) * IVA_RATE * 100) / 100 : null;
  };
  const nivelContratos = details?.nivel_contratos ?? null;
  const nivelOtros = details?.nivel_otros_contratos ?? null;
  return { nivel_contratos: nivelContratos, nivel_otros_contratos: nivelOtros, core: firstTier(nivelContratos), genetica: firstTier(nivelOtros) };
}

// fecha is selected separately (see activitiesQuery).
const ACTIVITY_COLUMNS = [
  'A.id',
  'A.hora',
  'A.tipo',
  'A.medico_netsuite_id',
  'A.medico_nombre',
  'A.hospital_netsuite_id',
  'A.hospital_nombre',
  'A.especialidad',
  'A.motivo',
  'A.evento_nombre',
  'A.sede',
  'A.asistentes',
  'A.requerimientos',
  'A.notas',
];

type ActivityRow = Omit<WorkPlanActivity, 'requerimientos' | 'fecha'> & { fecha: string | Date; requerimientos: string | null };

function toActivity(row: ActivityRow): WorkPlanActivity {
  const fecha = row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : String(row.fecha).slice(0, 10);
  return { ...row, fecha, asistentes: row.asistentes === null ? null : Number(row.asistentes), requerimientos: parseJsonList(row.requerimientos) };
}

function activitiesQuery(db: Knex, planId: number): Knex.QueryBuilder {
  return db(`${ACTIVITIES} as A`)
    .where('A.plan_id', planId)
    .select(ACTIVITY_COLUMNS)
    // SQL Server's date would come back as a JS Date at local midnight - formatted in SQL instead so
    // the day never shifts with the API's timezone.
    .select(db.raw('CONVERT(varchar(10), A.fecha, 23) as fecha'))
    .orderBy('A.fecha')
    .orderByRaw("COALESCE(A.hora, '99')")
    .orderBy('A.id');
}

async function findPlan(db: Knex, vendedorId: string, year: number, month: number): Promise<{ id: number; puesto: string | null; objetivos: string | null } | undefined> {
  return db(PLANS).where({ vendedor_id: vendedorId, year, month }).select('id', 'puesto', 'objetivos').first();
}

export async function getWorkPlan(db: Knex, vendedorId: string, year: number, month: number): Promise<WorkPlan> {
  const [employee, plan, venta] = await Promise.all([
    db('netsuite_employees').where('netsuite_id', vendedorId).select('entityid').first() as Promise<{ entityid: string | null } | undefined>,
    findPlan(db, vendedorId, year, month),
    getVentaObjetivos(db, vendedorId),
  ]);
  // A month without its own plan yet keeps the puesto from the vendedor's latest earlier plan.
  const puesto =
    plan?.puesto ??
    ((await db(PLANS)
      .where('vendedor_id', vendedorId)
      .whereNotNull('puesto')
      .andWhereRaw('year * 100 + month < ?', [year * 100 + month])
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .select('puesto')
      .first()) as { puesto: string } | undefined)?.puesto ??
    null;
  const activities = plan ? ((await activitiesQuery(db, plan.id)) as ActivityRow[]).map(toActivity) : [];

  return {
    vendedor_id: vendedorId,
    vendedor_nombre: personName(employee?.entityid ?? null) || vendedorId,
    year,
    month,
    puesto,
    objetivos: parseJsonList(plan?.objetivos ?? null),
    venta,
    activities,
  };
}

async function ensurePlan(db: Knex, vendedorId: string, year: number, month: number): Promise<number> {
  const existing = await findPlan(db, vendedorId, year, month);
  if (existing) return existing.id;
  const [inserted] = await db(PLANS).insert({ vendedor_id: vendedorId, year, month }).returning('id');
  return typeof inserted === 'object' ? inserted.id : inserted;
}

export async function saveWorkPlanHeader(
  db: Knex,
  vendedorId: string,
  year: number,
  month: number,
  input: { puesto: string | null; objetivos: string[] },
): Promise<void> {
  const planId = await ensurePlan(db, vendedorId, year, month);
  await db(PLANS).where('id', planId).update({ puesto: input.puesto, objetivos: JSON.stringify(input.objetivos), updated_at: new Date() });
}

function activityValues(input: WorkPlanActivityInput) {
  return { ...input, requerimientos: JSON.stringify(input.requerimientos) };
}

export async function createActivity(db: Knex, vendedorId: string, year: number, month: number, input: WorkPlanActivityInput): Promise<number> {
  const planId = await ensurePlan(db, vendedorId, year, month);
  const [inserted] = await db(ACTIVITIES).insert({ plan_id: planId, ...activityValues(input) }).returning('id');
  return typeof inserted === 'object' ? inserted.id : inserted;
}

/** The plan an activity belongs to - for the controller to check the caller may edit it. */
export async function getActivityPlan(db: Knex, activityId: number): Promise<{ vendedor_id: string; year: number; month: number } | undefined> {
  return db(`${ACTIVITIES} as A`).join(`${PLANS} as P`, 'P.id', 'A.plan_id').where('A.id', activityId).select('P.vendedor_id', 'P.year', 'P.month').first();
}

export async function updateActivity(db: Knex, activityId: number, input: WorkPlanActivityInput): Promise<void> {
  await db(ACTIVITIES).where('id', activityId).update({ ...activityValues(input), updated_at: new Date() });
}

export async function deleteActivity(db: Knex, activityId: number): Promise<void> {
  await db(ACTIVITIES).where('id', activityId).delete();
}

/** Same weekday in the same week of the month (2nd Tuesday -> 2nd Tuesday), so a visit routine
 * keeps its rhythm. A 5th weekday the target month doesn't have lands on its last one instead. */
function mapToMonth(fecha: string, year: number, month: number): string {
  const [, , d] = fecha.split('-').map(Number);
  const weekday = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const nth = Math.ceil(d / 7);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
  let day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) day -= 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Copies another month's activities into this month, appended to whatever is already there, each
 * moved to the same weekday of the same week (see mapToMonth). Puesto/objetivos come along too when
 * this month has none.
 */
export async function cloneWorkPlan(
  db: Knex,
  vendedorId: string,
  from: { year: number; month: number },
  to: { year: number; month: number },
): Promise<{ copied: number }> {
  const source = await findPlan(db, vendedorId, from.year, from.month);
  if (!source) return { copied: 0 };
  const activities = ((await activitiesQuery(db, source.id)) as ActivityRow[]).map(toActivity);

  return db.transaction(async (trx) => {
    const targetId = await ensurePlan(trx, vendedorId, to.year, to.month);
    const target = (await trx(PLANS).where('id', targetId).select('puesto', 'objetivos').first()) as { puesto: string | null; objetivos: string | null };
    const header: Record<string, unknown> = {};
    if (!target.puesto && source.puesto) header.puesto = source.puesto;
    if (parseJsonList(target.objetivos).length === 0 && parseJsonList(source.objetivos).length > 0) header.objetivos = source.objetivos;
    if (Object.keys(header).length > 0) await trx(PLANS).where('id', targetId).update({ ...header, updated_at: new Date() });

    const rows = activities.map(({ id: _id, ...activity }) => ({
      plan_id: targetId,
      ...activityValues({ ...activity, fecha: mapToMonth(activity.fecha, to.year, to.month) }),
    }));
    // 16 columns per row - SQL Server caps a statement at 2100 parameters.
    for (let i = 0; i < rows.length; i += 100) await trx(ACTIVITIES).insert(rows.slice(i, i + 100));
    return { copied: rows.length };
  });
}

/** Subsidiarias the vendedor has sold in - scopes the médico/hospital catalogs to their territory.
 * Empty for a vendedor with no sales yet (the catalogs are then not scoped). */
export async function getVendedorSubsidiarias(db: Knex, vendedorId: string): Promise<Set<string>> {
  const rows = (await db('netsuite_contracts')
    .where('custrecord_cryo_vendedor', vendedorId)
    .whereNotNull('custrecord_cryo_subsidiariacontrato')
    .distinct('custrecord_cryo_subsidiariacontrato as sub')) as Array<{ sub: string }>;
  return new Set(rows.map((r) => r.sub));
}

export interface CatalogOption {
  netsuite_id: string;
  nombre: string;
}

const CATALOG_LIMIT = 20;

function catalogSearch(db: Knex, table: string, subsidiaryColumn: string, q: string, subsidiarias: Set<string>): Knex.QueryBuilder {
  const qb = db(table).where('isinactive', 'F').whereNotNull('name').select('netsuite_id', 'name as nombre').orderBy('name').limit(CATALOG_LIMIT);
  for (const word of q.split(/\s+/).filter(Boolean)) qb.where('name', 'like', `%${word}%`);
  if (subsidiarias.size > 0) applySubsidiaryRestriction(qb, subsidiaryColumn, subsidiarias);
  return qb;
}

/** NetSuite médicos (customrecord médicos, synced to netsuite_medicos) matching every word of q. */
export async function searchMedicos(db: Knex, q: string, subsidiarias: Set<string>): Promise<CatalogOption[]> {
  return catalogSearch(db, 'netsuite_medicos', 'custrecord_cryo_subsidiariamedico', q, subsidiarias);
}

/** NetSuite hospitales (customrecord_cryo_arg_hospitales, synced to netsuite_hospitals). */
export async function searchHospitales(db: Knex, q: string, subsidiarias: Set<string>): Promise<CatalogOption[]> {
  return catalogSearch(db, 'netsuite_hospitals', 'custrecord_hospitales_subsidiria', q, subsidiarias);
}
