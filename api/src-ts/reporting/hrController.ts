import type { Request, Response } from 'express';
import { getHrDb } from '../db/hrDbConnection';
import { getHrBreakdown, getHrSummary, HR_DIMENSIONS } from './hrAnalyticsRepository';
import type { HrDimension } from './hrAnalyticsRepository';
import type { UserPermissions } from './permissionsRepository';

/**
 * HR Report is gated like every other report - isAdmin, or 'hr' in allowedEntities - granted
 * per-user from the admin "manage users" screen same as contracts/customers/etc. It has no
 * ENTITY_REGISTRY entry of its own (no generic per-row list/detail/CSV export - see
 * hrAnalyticsRepository.ts) since it's aggregate-only, but the permission key exists purely for
 * this gate (see PermissionKey in types.ts).
 */
export function isHrAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('hr'));
}

function isHrDimension(value: unknown): value is HrDimension {
  return typeof value === 'string' && (HR_DIMENSIONS as string[]).includes(value);
}

function parseActiveOnly(value: unknown): boolean {
  // Defaults to true (current org headcount) - explicit ?activeOnly=false shows everyone ever
  // synced from Peopleforce, including terminated staff.
  return value !== 'false';
}

/** GET /api/reports/hr/summary — total/active/inactive headcount. */
export async function getHrSummaryRoute(req: Request, res: Response): Promise<void> {
  if (!isHrAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getHrSummary(getHrDb());
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/hr/analytics?dimension=brand|department|gender|country|status|age|seniority|hiremonth&activeOnly=true|false */
export async function getHrAnalyticsRoute(req: Request, res: Response): Promise<void> {
  if (!isHrAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { dimension } = req.query;
  if (!isHrDimension(dimension)) {
    res.status(400).json({
      success: false,
      message: `Invalid dimension. Expected one of: ${HR_DIMENSIONS.join(', ')}.`,
    });
    return;
  }

  const activeOnly = parseActiveOnly(req.query.activeOnly);
  const data = await getHrBreakdown(getHrDb(), dimension, activeOnly);
  res.status(200).json({ success: true, dimension, activeOnly, data });
}
