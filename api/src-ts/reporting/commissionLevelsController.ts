import type { Request, Response } from 'express';
import knex from '../db/connection';
import { paramString } from './controller';
import { isContractsAllowed } from './contractReportsController';
import { getEmployeesWithLevels, setEmployeeLevel } from './employeeDetailsRepository';
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

/** PATCH /api/reports/commission-levels/employees/:id — body { nivel: string | null }. */
export async function updateEmployeeLevelRoute(req: Request, res: Response): Promise<void> {
  if (!isContractsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const employeeId = paramString(req.params.id);
  const { nivel } = req.body ?? {};
  if (nivel !== null && typeof nivel !== 'string') {
    res.status(400).json({ success: false, message: 'nivel debe ser un string o null.' });
    return;
  }

  await setEmployeeLevel(knex, employeeId, nivel === null ? null : nivel.trim() || null);
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
