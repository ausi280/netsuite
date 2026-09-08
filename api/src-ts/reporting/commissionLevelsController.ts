import type { Request, Response } from 'express';
import knex from '../db/connection';
import { paramString } from './controller';
import { isContractsAllowed } from './contractReportsController';
import { getEmployeesWithLevels, setEmployeeLevels } from './employeeDetailsRepository';
import { deleteLevelTier, getAllLevelTiers, upsertLevelTier } from './commissionTiersRepository';

/** GET /api/reports/commission-levels/employees — every employee with their currently assigned nivel. */
export async function listEmployeeLevelsRoute(req: Request, res: Response): Promise<void> {
  if (!isContractsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getEmployeesWithLevels(knex);
  res.status(200).json({ success: true, data });
}

function parseNivelField(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  return { ok: true, value: value.trim() || null };
}

/** PATCH /api/reports/commission-levels/employees/:id — body { nivel_contratos: string | null,
 * nivel_otros_contratos: string | null }. Both niveles are always sent together and saved
 * together - Contratos and Otros Contratos sales use independent tiers (they don't sum together
 * for tier resolution), so each has its own nivel. */
export async function updateEmployeeLevelRoute(req: Request, res: Response): Promise<void> {
  if (!isContractsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const employeeId = paramString(req.params.id);
  const body = req.body ?? {};
  const nivelContratos = parseNivelField(body.nivel_contratos);
  const nivelOtrosContratos = parseNivelField(body.nivel_otros_contratos);
  if (!nivelContratos.ok || !nivelOtrosContratos.ok) {
    res.status(400).json({ success: false, message: 'nivel_contratos y nivel_otros_contratos deben ser un string o null.' });
    return;
  }

  await setEmployeeLevels(knex, employeeId, { nivel_contratos: nivelContratos.value, nivel_otros_contratos: nivelOtrosContratos.value });
  res.status(200).json({ success: true });
}

/** GET /api/reports/commission-levels/tiers — every nivel's commission-rate tiers. */
export async function listCommissionTiersRoute(req: Request, res: Response): Promise<void> {
  if (!isContractsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getAllLevelTiers(knex);
  res.status(200).json({ success: true, data });
}

function parseTierBody(body: unknown): { nivel: string; min_amount: number; percentage: number } | null {
  if (!body || typeof body !== 'object') return null;
  const { nivel, min_amount, percentage } = body as Record<string, unknown>;
  if (typeof nivel !== 'string' || !nivel.trim()) return null;

  const min = Number(min_amount);
  const pct = Number(percentage);
  if (!Number.isFinite(min) || min < 0 || !Number.isFinite(pct) || pct < 0) return null;

  return { nivel: nivel.trim(), min_amount: min, percentage: pct };
}

/** POST /api/reports/commission-levels/tiers — body { id?, nivel, min_amount, percentage }; id present = edit, absent = create. */
export async function upsertCommissionTierRoute(req: Request, res: Response): Promise<void> {
  if (!isContractsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const parsed = parseTierBody(req.body);
  if (!parsed) {
    res.status(400).json({ success: false, message: 'Provide nivel (string), min_amount (>= 0) and percentage (>= 0).' });
    return;
  }

  const id = Number(req.body?.id);
  try {
    await upsertLevelTier(knex, { ...parsed, id: Number.isInteger(id) && id > 0 ? id : undefined });
    res.status(200).json({ success: true });
  } catch (error: any) {
    // SQL Server unique-constraint violation on (nivel, min_amount) - two tiers for the same
    // nivel can't share a threshold, since resolveCommissionPercentage couldn't pick between them.
    if (error?.number === 2627) {
      res.status(409).json({ success: false, message: `Ya existe un tier para el nivel '${parsed.nivel}' con ese monto mínimo.` });
      return;
    }
    throw error;
  }
}

/** DELETE /api/reports/commission-levels/tiers/:id */
export async function deleteCommissionTierRoute(req: Request, res: Response): Promise<void> {
  if (!isContractsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const id = Number(paramString(req.params.id));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'Invalid tier id.' });
    return;
  }

  await deleteLevelTier(knex, id);
  res.status(200).json({ success: true });
}
