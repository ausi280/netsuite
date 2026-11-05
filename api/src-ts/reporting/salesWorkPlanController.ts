import type { Request, Response } from 'express';
import knex from '../db/connection';
import { paramString } from './controller';
import { isCommissionsFullAccessAllowed } from './contractReportsController';
import {
  ACTIVITY_TYPES,
  VISIT_TYPE,
  cloneWorkPlan,
  createActivity,
  deleteActivity,
  getActivityPlan,
  getVendedorSubsidiarias,
  getWorkPlan,
  listPlanVendedores,
  resolveSelfPlanVendedorId,
  saveWorkPlanHeader,
  searchHospitales,
  searchMedicos,
  updateActivity,
  type WorkPlanActivityInput,
} from './salesWorkPlanRepository';
import { generateWorkPlanPdf, workPlanFilename } from './salesWorkPlanPdf';

/**
 * Plan de trabajo (see salesWorkPlanRepository.ts). Same two ways in as the commissions report: a
 * gerente with full commissions access (isCommissionsFullAccessAllowed) sees and edits any
 * vendedor's plan and is the only one who sets its puesto/objetivos; a vendedor (see
 * resolveSelfPlanVendedorId) captures only their own.
 */

interface PlanAccess {
  ok: true;
  /** The vendedor whose plan this request is about. */
  vendedorId: string;
  isGerente: boolean;
}

interface PlanAccessError {
  ok: false;
  status: number;
  message: string;
}

/** A gerente picks the vendedor (`requested`); a vendedor is always themselves, whatever was asked. */
async function resolvePlanAccess(req: Request, requested: unknown): Promise<PlanAccess | PlanAccessError> {
  if (isCommissionsFullAccessAllowed(req.permissions)) {
    const vendedorId = typeof requested === 'string' ? requested.trim() : '';
    if (!vendedorId) return { ok: false, status: 400, message: 'Elige un vendedor.' };
    return { ok: true, vendedorId, isGerente: true };
  }
  const selfId = await resolveSelfPlanVendedorId(knex, req.auditUser?.username ?? null);
  if (!selfId) return { ok: false, status: 403, message: 'No tienes permiso para ver planes de trabajo.' };
  return { ok: true, vendedorId: selfId, isGerente: false };
}

function parseMonthYear(source: Record<string, unknown>, prefix = ''): { year: number; month: number } | null {
  const month = Number(source[`${prefix}month`]);
  const year = Number(source[`${prefix}year`]);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return { year, month };
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message });
}

function optionalString(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/** Validates an activity body for the given month - returns the clean input or an error message. */
function parseActivity(body: Record<string, unknown>, year: number, month: number): WorkPlanActivityInput | string {
  const fecha = typeof body.fecha === 'string' ? body.fecha : '';
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !fecha.startsWith(prefix) || Number.isNaN(Date.parse(fecha))) {
    return 'La fecha debe ser un día del mes del plan.';
  }
  const hora = optionalString(body.hora, 5);
  if (hora !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return 'Hora inválida (HH:MM).';
  const tipo = typeof body.tipo === 'string' ? body.tipo : '';
  if (!(ACTIVITY_TYPES as readonly string[]).includes(tipo)) return 'Tipo de actividad inválido.';

  const isVisit = tipo === VISIT_TYPE;
  const activity: WorkPlanActivityInput = {
    fecha,
    hora,
    tipo,
    medico_netsuite_id: isVisit ? optionalString(body.medico_netsuite_id) : null,
    medico_nombre: isVisit ? optionalString(body.medico_nombre) : null,
    hospital_netsuite_id: isVisit ? optionalString(body.hospital_netsuite_id) : null,
    hospital_nombre: isVisit ? optionalString(body.hospital_nombre) : null,
    especialidad: isVisit ? optionalString(body.especialidad) : null,
    motivo: isVisit ? optionalString(body.motivo) : null,
    evento_nombre: isVisit ? null : optionalString(body.evento_nombre),
    sede: isVisit ? null : optionalString(body.sede),
    asistentes: !isVisit && Number.isInteger(Number(body.asistentes)) && Number(body.asistentes) > 0 ? Number(body.asistentes) : null,
    requerimientos: Array.isArray(body.requerimientos)
      ? body.requerimientos.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim().slice(0, 100))
      : [],
    notas: optionalString(body.notas, 2000),
  };
  if (isVisit && !activity.medico_nombre && !activity.hospital_nombre) return 'Escribe el médico o el hospital.';
  if (!isVisit && !activity.evento_nombre) return 'Escribe el nombre del evento o actividad.';
  return activity;
}

/** GET /api/reports/work-plans?month&year[&vendedor] — the plan, plus (for a gerente) the vendedores to pick from. */
export async function getWorkPlanRoute(req: Request, res: Response): Promise<void> {
  const period = parseMonthYear(req.query as Record<string, unknown>);
  if (!period) return fail(res, 400, 'Provide a valid ?month=1-12 and ?year=YYYY.');

  const isGerente = isCommissionsFullAccessAllowed(req.permissions);
  const vendedores = isGerente ? await listPlanVendedores(knex) : [];
  // A gerente who hasn't picked anyone yet still gets the vendedor list, just no plan.
  if (isGerente && !req.query.vendedor) {
    res.status(200).json({ success: true, data: null, isGerente, vendedores });
    return;
  }

  const access = await resolvePlanAccess(req, req.query.vendedor);
  if (!access.ok) return fail(res, access.status, access.message);
  const data = await getWorkPlan(knex, access.vendedorId, period.year, period.month);
  res.status(200).json({ success: true, data, isGerente, vendedores });
}

/** PUT /api/reports/work-plans/header — body { vendedor, month, year, puesto, objetivos: string[] }. Gerente only. */
export async function saveWorkPlanHeaderRoute(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const access = await resolvePlanAccess(req, body.vendedor);
  if (!access.ok) return fail(res, access.status, access.message);
  if (!access.isGerente) return fail(res, 403, 'Solo la gerencia define los objetivos del plan.');
  const period = parseMonthYear(body);
  if (!period) return fail(res, 400, 'Provide a valid month (1-12) and year.');

  const objetivos = Array.isArray(body.objetivos)
    ? body.objetivos.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map((o) => o.trim().slice(0, 300))
    : [];
  await saveWorkPlanHeader(knex, access.vendedorId, period.year, period.month, { puesto: optionalString(body.puesto, 100), objetivos });
  res.status(200).json({ success: true });
}

/** POST /api/reports/work-plans/activities — body { vendedor, month, year, ...activity }. */
export async function createWorkPlanActivityRoute(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const access = await resolvePlanAccess(req, body.vendedor);
  if (!access.ok) return fail(res, access.status, access.message);
  const period = parseMonthYear(body);
  if (!period) return fail(res, 400, 'Provide a valid month (1-12) and year.');

  const activity = parseActivity(body, period.year, period.month);
  if (typeof activity === 'string') return fail(res, 400, activity);
  const id = await createActivity(knex, access.vendedorId, period.year, period.month, activity);
  res.status(201).json({ success: true, data: { id } });
}

/** Loads the activity's plan and checks the caller may edit it (a vendedor only their own). */
async function resolveActivityAccess(req: Request, res: Response): Promise<{ id: number; year: number; month: number } | null> {
  const id = Number(paramString(req.params.id));
  if (!Number.isInteger(id) || id <= 0) {
    fail(res, 400, 'Invalid activity id.');
    return null;
  }
  const plan = await getActivityPlan(knex, id);
  if (!plan) {
    fail(res, 404, 'La actividad ya no existe.');
    return null;
  }
  const access = await resolvePlanAccess(req, plan.vendedor_id);
  if (!access.ok || access.vendedorId !== plan.vendedor_id) {
    fail(res, access.ok ? 403 : access.status, access.ok ? 'No puedes modificar el plan de otro vendedor.' : access.message);
    return null;
  }
  return { id, year: plan.year, month: plan.month };
}

/** PUT /api/reports/work-plans/activities/:id — body = activity (stays in its plan's month). */
export async function updateWorkPlanActivityRoute(req: Request, res: Response): Promise<void> {
  const target = await resolveActivityAccess(req, res);
  if (!target) return;
  const activity = parseActivity((req.body ?? {}) as Record<string, unknown>, target.year, target.month);
  if (typeof activity === 'string') return fail(res, 400, activity);
  await updateActivity(knex, target.id, activity);
  res.status(200).json({ success: true });
}

/** DELETE /api/reports/work-plans/activities/:id */
export async function deleteWorkPlanActivityRoute(req: Request, res: Response): Promise<void> {
  const target = await resolveActivityAccess(req, res);
  if (!target) return;
  await deleteActivity(knex, target.id);
  res.status(200).json({ success: true });
}

/** POST /api/reports/work-plans/clone — body { vendedor, month, year, from_month, from_year }:
 * copies that month's activities into this one (see cloneWorkPlan). */
export async function cloneWorkPlanRoute(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const access = await resolvePlanAccess(req, body.vendedor);
  if (!access.ok) return fail(res, access.status, access.message);
  const to = parseMonthYear(body);
  const from = parseMonthYear(body, 'from_');
  if (!to || !from) return fail(res, 400, 'Provide valid month/year and from_month/from_year.');
  if (to.year === from.year && to.month === from.month) return fail(res, 400, 'Elige un mes distinto al del plan.');

  const result = await cloneWorkPlan(knex, access.vendedorId, from, to);
  res.status(200).json({ success: true, data: result });
}

/** GET /api/reports/work-plans/pdf?month&year[&vendedor] */
export async function getWorkPlanPdfRoute(req: Request, res: Response): Promise<void> {
  const period = parseMonthYear(req.query as Record<string, unknown>);
  if (!period) return fail(res, 400, 'Provide a valid ?month=1-12 and ?year=YYYY.');
  const access = await resolvePlanAccess(req, req.query.vendedor);
  if (!access.ok) return fail(res, access.status, access.message);

  const plan = await getWorkPlan(knex, access.vendedorId, period.year, period.month);
  const pdf = await generateWorkPlanPdf(plan);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${workPlanFilename(plan)}"`);
  res.status(200).send(pdf);
}

/** GET /api/reports/work-plans/catalog/:catalog?q=&vendedor= — NetSuite médicos or hospitales for
 * the activity form's autocomplete, scoped to the subsidiarias the vendedor sells in. */
export async function searchWorkPlanCatalogRoute(req: Request, res: Response): Promise<void> {
  const catalog = paramString(req.params.catalog);
  if (catalog !== 'medicos' && catalog !== 'hospitales') return fail(res, 404, 'Catálogo desconocido.');
  const access = await resolvePlanAccess(req, req.query.vendedor);
  if (!access.ok) return fail(res, access.status, access.message);

  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q.length < 2) {
    res.status(200).json({ success: true, data: [] });
    return;
  }
  const subsidiarias = await getVendedorSubsidiarias(knex, access.vendedorId);
  const data = catalog === 'medicos' ? await searchMedicos(knex, q, subsidiarias) : await searchHospitales(knex, q, subsidiarias);
  res.status(200).json({ success: true, data });
}
