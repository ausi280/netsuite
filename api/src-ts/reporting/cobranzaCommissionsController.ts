import type { Request, Response } from 'express';
import knex from '../db/connection';
import {
  getCobranzaCommissionsReport,
  resolveSelfCobradorDuenoId,
  resolveSelfCobradorDuenoSubsidiarias,
} from './cobranzaCommissionsRepository';
import type { CobranzaCommissionContractGroup } from './cobranzaCommissionsRepository';
import { parseSubsidiaryFilter } from './reportingRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';
import { getCobranzaGoals, setCobranzaGoalDefault, setCobranzaGoalExclusion, setCobranzaGoalOverride } from './cobranzaGoalsRepository';
import { paramString } from './controller';
import {
  getCobranzaIncentives,
  INCENTIVE_RATE_KEYS,
  isIncentiveScheme,
  saveCobranzaIncentives,
  setAgentIncentiveScheme,
  type CobranzaIncentiveTier,
  type CobranzaProyectoIncentiveTier,
} from './cobranzaIncentivesRepository';

/** Whether this caller sees EVERY contract's cobranza data (as opposed to only the ones where
 * they're the resolved Dueño or Cobrador, via the separate self-cobrador/dueño path below). Its own
 * standalone grant, not an additional gate on top of 'partidas' - unlike Cuentas (reached from the
 * same Partidas report but gated by that same 'partidas' permission), this report surfaces
 * cobrador-identifying collections data that not every Partidas viewer should see. */
export function isCobranzaCommissionsFullAccessAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('cobranza_commissions'));
}

/** Whether this caller may capture (edit) the monthly Dueño/Cobrador goals - its own grant,
 * 'cobranza_goals', separate from seeing the report; without it, goals are view-only. */
export function isCobranzaGoalsEditAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('cobranza_goals'));
}

function subsidiaryRestrictionFor(permissions: UserPermissions): Set<string> | null {
  return permissions.isAdmin ? null : permissions.allowedSubsidiaries;
}

function parsePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function resolveMonthYear(req: Request): { month: number; year: number } {
  const now = new Date();
  const month = parsePositiveInt(req.query.month) ?? now.getMonth() + 1;
  const year = parsePositiveInt(req.query.year) ?? now.getFullYear();
  return { month, year };
}

interface CobranzaCommissionsDataResult {
  ok: true;
  data: CobranzaCommissionContractGroup[];
  month: number;
  year: number;
}

interface CobranzaCommissionsDataError {
  ok: false;
  status: number;
  message: string;
}

/**
 * Shared auth + query-parsing + fetch behind getCobranzaCommissionsRoute and
 * exportCobranzaCommissionsRoute - every caller is gated one of two ways: full access
 * (isCobranzaCommissionsFullAccessAllowed - sees every contract, subsidiary-restricted as usual),
 * or a "self cobrador/dueño" - a caller without the explicit grant who's nonetheless the resolved
 * Dueño or Cobrador on at least one invoice/contract (resolveSelfCobradorDuenoId). Per explicit
 * instruction, a self cobrador/dueño sees the SAME full report as anyone else - every cobrador and
 * dueño, not narrowed down to just their own assignments - capped only to the subsidiaria(s) where
 * they themselves have contracts (resolveSelfCobradorDuenoSubsidiarias), same "no grant needed to
 * see your own [scope]" pattern contractReportsController.ts's loadCommissionsData established for
 * the regular Commissions report, just scoped by subsidiaria here instead of by vendedor.
 */
async function loadCobranzaCommissionsData(req: Request): Promise<CobranzaCommissionsDataResult | CobranzaCommissionsDataError> {
  const permissions = req.permissions;
  const fullAccess = isCobranzaCommissionsFullAccessAllowed(permissions);
  const selfEmployeeId = fullAccess ? null : await resolveSelfCobradorDuenoId(knex, req.auditUser?.username ?? null);

  if (!fullAccess && !selfEmployeeId) {
    return { ok: false, status: 403, message: 'No tienes permiso para ver este reporte.' };
  }

  const { month, year } = resolveMonthYear(req);
  const subsidiary = parseSubsidiaryFilter(req.query.subsidiary);
  let restrictSubsidiaries: Set<string> | null;
  if (fullAccess) {
    restrictSubsidiaries = subsidiaryRestrictionFor(permissions!);
  } else {
    const selfSubsidiarias = await resolveSelfCobradorDuenoSubsidiarias(knex, selfEmployeeId!);
    // Empty only means "no partida yet carries this employee's subsidiaria" (e.g. they're already
    // the resolved cobrador on a brand-new invoice that hasn't got a partida linked yet - see
    // resolveSelfCobradorDuenoId, which doesn't require a partida to exist at all), NOT "they
    // belong to zero subsidiarias" - applySubsidiaryRestriction would otherwise zero out someone
    // who legitimately passed the self-access check above, so this falls back to unrestricted
    // rather than wrongly locking them out.
    restrictSubsidiaries = selfSubsidiarias.size > 0 ? selfSubsidiarias : null;
  }
  const data = await getCobranzaCommissionsReport(knex, month, year, subsidiary, restrictSubsidiaries);

  return { ok: true, data, month, year };
}

/** GET /api/reports/cobranza-comisiones?month=&year=&subsidiary= */
export async function getCobranzaCommissionsRoute(req: Request, res: Response): Promise<void> {
  const result = await loadCobranzaCommissionsData(req);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, data: result.data, month: result.month, year: result.year });
}

const ASIGNACION_TIPO_LABELS: Record<string, string> = {
  dueno: 'Dueño',
  cobrador: 'Cobrador',
  bolsa: 'Bolsa',
  bolsa_domiciliado: 'Bolsa Domiciliado',
  paquete_inicial: 'Paquete Inicial',
};

// Mexico's IVA rate - the invoice's own total (the partida's `importe_pagado`) includes tax, per
// explicit instruction to show the net-of-tax figure instead. Confirmed live only for Mexico-
// subsidiary records (65 USD partida -> 75.4 invoice total, exactly ×1.16); NOT verified for other
// subsidiaries/currencies, which may use a different VAT rate (e.g. Argentina's IVA is 21%, not
// 16%) - applied uniformly here regardless, since no confirmed per-subsidiary rate exists yet.
const IVA_RATE = 0.16;

function importePagadoNeto(importePagado: string | number | null): number | null {
  if (importePagado === null || importePagado === '') return null;
  const raw = Number(importePagado);
  return Number.isFinite(raw) ? raw / (1 + IVA_RATE) : null;
}

// custrecord_cryo_importepagado's own currency never matches the partida's catalog `moneda` - per
// explicit instruction ("we are receiving the payments in MXN"), labeled fixed MXN rather than
// whatever `moneda` the partida's nominal catalog price happens to carry.
const IMPORTE_PAGADO_CURRENCY_LABEL = 'MXN';

const EXPORT_HEADERS = [
  'Contrato',
  'No. Contrato Sistema Anterior',
  'Dueño',
  'Cobrador',
  'Asignado a',
  'Tipo de Asignación',
  'Subsidiaria',
  'Año',
  'Concepto',
  'Tipo de Servicio',
  'Estatus',
  'Fecha Límite de Pago',
  'Importe',
  'Moneda',
  'Importe Pagado (neto de IVA)',
  'Moneda Pagado',
  'Factura',
  'Paquete Inicial de Anualidades',
];

/** GET /api/reports/cobranza-comisiones/export?month=&year=&subsidiary= - same filtered/grouped
 * rows getCobranzaCommissionsRoute returns, flattened to one CSV row per partida. */
export async function exportCobranzaCommissionsRoute(req: Request, res: Response): Promise<void> {
  const result = await loadCobranzaCommissionsData(req);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return;
  }
  const { data: groups, month, year } = result;

  const filename = `cobranza-comisiones-${year}-${String(month).padStart(2, '0')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('﻿');
  res.write(csvRow(EXPORT_HEADERS));

  for (const group of groups) {
    for (const yearGroup of group.years) {
      for (const partida of yearGroup.partidas) {
        res.write(
          csvRow([
            group.contract_name ?? group.contract_id,
            group.folio_sistema_anterior ?? '',
            group.dueno_nombre ?? '',
            group.cobrador_nombre ?? '',
            group.asignado_a,
            ASIGNACION_TIPO_LABELS[group.asignado_tipo] ?? group.asignado_tipo,
            formatExportValue('custrecord_cryo_subsidiariacontrato', group.subsidiaria_id),
            yearGroup.anio === 'sin-anio' ? '' : yearGroup.anio,
            partida.concepto ?? '',
            partida.servtipo ?? '',
            formatExportValue('custrecord_cryo_estatuspartida', partida.estatus),
            partida.fecha_limite_pago ?? '',
            partida.importe ?? '',
            formatExportValue('custrecord_cryo_monedapartida', partida.moneda),
            importePagadoNeto(partida.importe_pagado)?.toFixed(2) ?? '',
            importePagadoNeto(partida.importe_pagado) !== null ? IMPORTE_PAGADO_CURRENCY_LABEL : '',
            partida.invoice_tranid ?? '',
            partida.es_paquete_inicial ? 'Sí' : '',
          ]),
        );
      }
    }
  }
  res.end();
}

/** Same two-way gate as loadCobranzaCommissionsData (full access, or a self cobrador/dueño) -
 * goals are visible to anyone who can see the report itself. */
async function canViewCobranzaGoals(req: Request): Promise<boolean> {
  if (isCobranzaCommissionsFullAccessAllowed(req.permissions)) return true;
  return (await resolveSelfCobradorDuenoId(knex, req.auditUser?.username ?? null)) !== null;
}

/** Parses an optional goal amount from a request body - null/'' clears it, otherwise a
 * non-negative finite number. Returns undefined when the value is invalid. */
function parseGoalAmount(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseMonthYearBody(body: Record<string, unknown>): { month: number; year: number } | null {
  const month = parsePositiveInt(body.month);
  const year = parsePositiveInt(body.year);
  if (!month || month > 12 || !year) return null;
  return { month, year };
}

/** GET /api/reports/cobranza-comisiones/metas?month=&year= - the month's default goal plus every
 * Dueño/Cobrador's effective goal. `can_edit` (the 'cobranza_goals' grant) tells the UI whether to
 * show the editing controls; `can_view_all` (full cobranza access) whether to list every person, or
 * only those present in the caller's own subsidiary-capped report (a self cobrador/dueño). */
export async function getCobranzaGoalsRoute(req: Request, res: Response): Promise<void> {
  if (!(await canViewCobranzaGoals(req))) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { month, year } = resolveMonthYear(req);
  const data = await getCobranzaGoals(knex, year, month);
  res.status(200).json({
    success: true,
    data,
    can_edit: isCobranzaGoalsEditAllowed(req.permissions),
    can_view_all: isCobranzaCommissionsFullAccessAllowed(req.permissions),
  });
}

/** PUT /api/reports/cobranza-comisiones/metas/default - body { month, year, amount: number | null,
 * clear_overrides?: boolean }. clear_overrides=true applies `amount` to everyone, dropping every
 * individual override for that month. */
export async function setCobranzaGoalDefaultRoute(req: Request, res: Response): Promise<void> {
  if (!isCobranzaGoalsEditAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const period = parseMonthYearBody(body);
  const amount = parseGoalAmount(body.amount);
  if (!period || amount === undefined) {
    res.status(400).json({ success: false, message: 'Provide month (1-12), year and amount (>= 0 or null).' });
    return;
  }

  await setCobranzaGoalDefault(knex, period.year, period.month, amount, body.clear_overrides === true);
  res.status(200).json({ success: true });
}

/** PUT /api/reports/cobranza-comisiones/metas/employees/:id - body { month, year, amount: number |
 * null }. null removes the override, so the employee inherits the month's default again. */
export async function setCobranzaGoalOverrideRoute(req: Request, res: Response): Promise<void> {
  if (!isCobranzaGoalsEditAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const employeeId = paramString(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const period = parseMonthYearBody(body);
  const amount = parseGoalAmount(body.amount);
  if (!employeeId || !period || amount === undefined) {
    res.status(400).json({ success: false, message: 'Provide month (1-12), year and amount (>= 0 or null).' });
    return;
  }

  await setCobranzaGoalOverride(knex, employeeId, period.year, period.month, amount);
  res.status(200).json({ success: true });
}

/** PUT /api/reports/cobranza-comisiones/metas/employees/:id/exclusion - body { month, year,
 * excluded: boolean }. Removes a person from (or restores them to) the goals list for that month
 * only - see cobranzaGoalsRepository.ts's setCobranzaGoalExclusion for how months are kept separate. */
export async function setCobranzaGoalExclusionRoute(req: Request, res: Response): Promise<void> {
  if (!isCobranzaGoalsEditAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const employeeId = paramString(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const period = parseMonthYearBody(body);
  const excluded = body.excluded;
  if (!employeeId || !period || typeof excluded !== 'boolean') {
    res.status(400).json({ success: false, message: 'Provide month (1-12), year and excluded (boolean).' });
    return;
  }

  await setCobranzaGoalExclusion(knex, employeeId, period.year, period.month, excluded);
  res.status(200).json({ success: true });
}

/** PUT /api/reports/cobranza-comisiones/metas/employees/:id/esquema - body { month, year, scheme }.
 * Sets the agent's incentive esquema for that month only (null clears it) - see
 * cobranzaIncentivesRepository.ts's setAgentIncentiveScheme for how months are kept separate. */
export async function setCobranzaAgentSchemeRoute(req: Request, res: Response): Promise<void> {
  if (!isCobranzaGoalsEditAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const employeeId = paramString(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const period = parseMonthYearBody(body);
  const scheme = body.scheme === null || body.scheme === '' ? null : body.scheme;
  if (!employeeId || !period || (scheme !== null && !isIncentiveScheme(scheme))) {
    res.status(400).json({ success: false, message: 'Provide month (1-12), year and a valid scheme (or null).' });
    return;
  }

  await setAgentIncentiveScheme(knex, employeeId, period.year, period.month, scheme);
  res.status(200).json({ success: true });
}

/** GET /api/reports/cobranza-comisiones/incentivos?month=&year= - the month's incentive tables,
 * plus `copy_source` (the latest earlier configured month) when the month has none captured yet. */
export async function getCobranzaIncentivesRoute(req: Request, res: Response): Promise<void> {
  if (!(await canViewCobranzaGoals(req))) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { month, year } = resolveMonthYear(req);
  const { config, copy_source } = await getCobranzaIncentives(knex, year, month);
  res.status(200).json({ success: true, data: config, copy_source, can_edit: isCobranzaGoalsEditAllowed(req.permissions) });
}

/** A non-negative finite number, null for null/'' when `optional`, else undefined (invalid). */
function parseRate(value: unknown, optional: boolean): number | null | undefined {
  if (value === null || value === undefined || value === '') return optional ? null : undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseTiers(value: unknown): CobranzaIncentiveTier[] | null {
  if (!Array.isArray(value)) return null;
  const tiers: CobranzaIncentiveTier[] = [];
  for (const raw of value as Array<Record<string, unknown>>) {
    const minPct = parseRate(raw?.min_pct, false);
    const label = raw?.incentive_label;
    if (minPct === undefined || minPct === null) return null;
    if (label !== null && label !== undefined && (typeof label !== 'string' || label.length > 50)) return null;
    const tier = { min_pct: minPct, incentive_label: typeof label === 'string' && label.trim() ? label.trim() : null } as CobranzaIncentiveTier;
    for (const key of INCENTIVE_RATE_KEYS) {
      const rate = parseRate(raw[key], true);
      if (rate === undefined) return null;
      tier[key] = rate;
    }
    tiers.push(tier);
  }
  return new Set(tiers.map((t) => t.min_pct)).size === tiers.length ? tiers : null;
}

function parseProyectoTiers(value: unknown): CobranzaProyectoIncentiveTier[] | null {
  if (!Array.isArray(value)) return null;
  const tiers: CobranzaProyectoIncentiveTier[] = [];
  for (const raw of value as Array<Record<string, unknown>>) {
    const minAmount = parseRate(raw?.min_amount, false);
    const ratePct = parseRate(raw?.rate_pct, false);
    if (minAmount === undefined || minAmount === null || ratePct === undefined || ratePct === null) return null;
    tiers.push({ min_amount: minAmount, rate_pct: ratePct });
  }
  return new Set(tiers.map((t) => t.min_amount)).size === tiers.length ? tiers : null;
}

/** PUT /api/reports/cobranza-comisiones/incentivos - body { month, year, tiers, proyecto_tiers }.
 * Replaces the month's whole incentive configuration. */
export async function saveCobranzaIncentivesRoute(req: Request, res: Response): Promise<void> {
  if (!isCobranzaGoalsEditAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const period = parseMonthYearBody(body);
  const tiers = parseTiers(body.tiers);
  const proyectoTiers = parseProyectoTiers(body.proyecto_tiers);
  if (!period || !tiers || !proyectoTiers) {
    res.status(400).json({
      success: false,
      message: 'Provide month (1-12), year, tiers and proyecto_tiers - non-negative numbers, no repeated % recuperado / monto mínimo.',
    });
    return;
  }

  await saveCobranzaIncentives(knex, period.year, period.month, tiers, proyectoTiers);
  res.status(200).json({ success: true });
}
