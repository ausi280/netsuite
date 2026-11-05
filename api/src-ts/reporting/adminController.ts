import type { Request, Response } from 'express';
import knex from '../db/connection';
import { paramString } from './controller';
import { listEntityConfigs } from './entityRegistry';
import { PermissionsRepository } from './permissionsRepository';
import type { PermissionKey } from './types';

const permissionsRepository = new PermissionsRepository(knex);
// 'hr' and 'prospectos' are grantable like any other entity but have no ENTITY_REGISTRY entry of
// their own (see hrController.ts/prospectosController.ts / PermissionKey) - added on top of the
// generic table-backed keys. 'commissions' is likewise not an ENTITY_REGISTRY entity - it's an
// additional gate on top of 'contracts' (see PermissionKey in types.ts). 'tareas_vencidas',
// 'cobranza_commissions', and 'postventa' are their own standalone grants, same shape as
// 'hr'/'prospectos' (see tareasVencidasController.ts / cobranzaCommissionsController.ts /
// postventaController.ts).
const VALID_ENTITY_KEYS = new Set<string>([
  ...listEntityConfigs().map((c) => c.key),
  'hr',
  'prospectos',
  'commissions',
  'commissions_amounts',
  'tareas_vencidas',
  'cobranza_commissions',
  'cobranza_goals',
  'marketing_inputs',
  'postventa',
  'administracion',
]);

/** Every admin route here requires isAdmin; a 403 is the correct response for everyone else - these endpoints manage OTHER people's access. */
function requireAdmin(req: Request, res: Response): boolean {
  if (!req.permissions?.isAdmin) {
    res.status(403).json({ success: false, message: 'Solo un administrador puede gestionar usuarios.' });
    return false;
  }
  return true;
}

/** GET /api/reports/admin/users — every registered user (auto-provisioned on first login) and their current access. */
export async function listUsers(req: Request, res: Response): Promise<void> {
  if (!requireAdmin(req, res)) return;

  const data = await permissionsRepository.listUsers();
  res.status(200).json({ success: true, data });
}

/** PATCH /api/reports/admin/users/:oid — body: { isAdmin, allowedEntities: string[], allowedSubsidiaries: string[] }. Unknown entity keys are silently dropped, never trusted as-is. */
export async function updateUserPermissions(req: Request, res: Response): Promise<void> {
  if (!requireAdmin(req, res)) return;

  const oid = paramString(req.params.oid);
  const body = (req.body ?? {}) as {
    isAdmin?: unknown;
    allowedEntities?: unknown;
    allowedSubsidiaries?: unknown;
  };

  const isAdmin = Boolean(body.isAdmin);

  const allowedEntities = (Array.isArray(body.allowedEntities) ? body.allowedEntities : []).filter(
    (value): value is PermissionKey => typeof value === 'string' && VALID_ENTITY_KEYS.has(value),
  );

  const allowedSubsidiaries = (Array.isArray(body.allowedSubsidiaries) ? body.allowedSubsidiaries : []).filter(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );

  const updated = await permissionsRepository.updateUserPermissions(oid, { isAdmin, allowedEntities, allowedSubsidiaries });
  if (!updated) {
    res.status(404).json({ success: false, message: `No user registered for oid ${oid}.` });
    return;
  }

  res.status(200).json({ success: true });
}

const MAX_PRICING_DISCOUNT = 50;
const MAX_PRICING_NOTAS_LENGTH = 1000;

/** GET /api/reports/admin/pricing — app_pricing rows, only what the screen shows (years, discount %, notas). */
export async function listPricing(req: Request, res: Response): Promise<void> {
  if (!requireAdmin(req, res)) return;

  const rows: Array<{ id: number; years: number; discount: string | number | null; notas: string | null }> = await knex('app_pricing')
    .select('id', 'years', 'discount', 'notas')
    .orderBy('years', 'asc');
  const data = rows.map((r) => ({ id: r.id, years: r.years, discount: r.discount === null ? null : Number(r.discount), notas: r.notas }));
  res.status(200).json({ success: true, data });
}

/** PATCH /api/reports/admin/pricing/:id — body: { discount, notas }. The only editable columns: discount (percentage 0-50) and notas (free text, empty = null). */
export async function updatePricingDiscount(req: Request, res: Response): Promise<void> {
  if (!requireAdmin(req, res)) return;

  const id = Number(paramString(req.params.id));
  const body = (req.body ?? {}) as { discount?: unknown; notas?: unknown };
  const discount = Number(body.discount);
  const notas = typeof body.notas === 'string' && body.notas.trim() !== '' ? body.notas.trim() : null;
  if (notas !== null && notas.length > MAX_PRICING_NOTAS_LENGTH) {
    res.status(400).json({ success: false, message: `Las notas no pueden pasar de ${MAX_PRICING_NOTAS_LENGTH} caracteres.` });
    return;
  }
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'Id inválido.' });
    return;
  }
  if (!Number.isFinite(discount) || discount < 0 || discount > MAX_PRICING_DISCOUNT) {
    res.status(400).json({ success: false, message: `El descuento debe estar entre 0 y ${MAX_PRICING_DISCOUNT}%.` });
    return;
  }

  // decimal(5,2) column - keep at most two decimals.
  const updated = await knex('app_pricing')
    .where({ id })
    .update({ discount: Math.round(discount * 100) / 100, notas, updated_at: knex.fn.now() });
  if (!updated) {
    res.status(404).json({ success: false, message: `No existe el precio ${id}.` });
    return;
  }

  res.status(200).json({ success: true });
}
