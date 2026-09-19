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
// additional gate on top of 'contracts' (see PermissionKey in types.ts).
const VALID_ENTITY_KEYS = new Set<string>([...listEntityConfigs().map((c) => c.key), 'hr', 'prospectos', 'commissions']);

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
