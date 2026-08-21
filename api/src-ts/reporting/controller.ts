import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getEntityConfig, listEntityConfigs } from './entityRegistry';
import { getEntitySummaries, getPagedRows, getRowById, getSubsidiaryOptions } from './reportingRepository';
import type { UserPermissions } from './permissionsRepository';
import type { EntityConfig } from './types';

/** Express 5's ParamsDictionary types named params as `string | string[]` to account for wildcard segments; our routes only ever use simple `:name` segments, which are always plain strings at runtime. */
function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? '' : value;
}

/** null = unrestricted (admin); otherwise the caller's exact allow-list, enforced everywhere a subsidiaryColumn exists. */
function subsidiaryRestrictionFor(permissions: UserPermissions): Set<string> | null {
  return permissions.isAdmin ? null : permissions.allowedSubsidiaries;
}

function isEntityAllowed(permissions: UserPermissions, config: EntityConfig): boolean {
  return permissions.isAdmin || permissions.allowedEntities.has(config.key);
}

/** GET /api/reports/entities — one summary row per entity the caller may see, in registry order. */
export async function listEntitySummaries(req: Request, res: Response): Promise<void> {
  // req.permissions is always set by buildPermissionsMiddleware for any request reaching this
  // handler; the empty-everything fallback only matters if that invariant is ever broken.
  const permissions: UserPermissions = req.permissions ?? { isAdmin: false, allowedEntities: new Set(), allowedSubsidiaries: new Set() };
  const configs = listEntityConfigs().filter((c) => isEntityAllowed(permissions, c));

  const data = await getEntitySummaries(knex, configs, subsidiaryRestrictionFor(permissions));
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/:entity?page=&pageSize=&search=&sortBy=&sortDir=&subsidiary= */
export async function listEntityRows(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { page, pageSize, search, sortBy, sortDir, subsidiary } = req.query;
  const result = await getPagedRows(
    knex,
    config,
    { page, pageSize, search, sortBy, sortDir, subsidiary },
    subsidiaryRestrictionFor(permissions),
  );

  res.status(200).json({ success: true, ...result });
}

/** GET /api/reports/:entity/:id — full row (raw_data parsed to an object) looked up by idColumn. */
export async function getEntityRowDetail(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const id = paramString(req.params.id);
  const row = await getRowById(knex, config, id, subsidiaryRestrictionFor(permissions));
  if (!row) {
    res.status(404).json({ success: false, message: `${config.label} record not found for id ${id}` });
    return;
  }

  res.status(200).json({ success: true, data: row });
}

/** GET /api/reports/:entity/subsidiaries — distinct subsidiary ids the caller may filter by for this entity (empty array if the entity has no subsidiary column synced, or the caller isn't allowed to see any). */
export async function listSubsidiaryOptions(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getSubsidiaryOptions(knex, config, subsidiaryRestrictionFor(permissions));
  res.status(200).json({ success: true, data });
}
