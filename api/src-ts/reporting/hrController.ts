import type { Request, Response } from 'express';
import { getHrDb } from '../db/hrDbConnection';
import { getHrBreakdown, getHrSummary, HR_DIMENSIONS } from './hrAnalyticsRepository';
import type { HrDimension } from './hrAnalyticsRepository';
import type { UserPermissions } from './permissionsRepository';

/**
 * HR Report is gated by isAdmin only, not the usual per-entity allowedEntities allow-list -
 * unlike every other report, this one is backed by a table containing employee PII (full names,
 * birthdays), and it isn't part of the generic entity registry (no per-row list/detail/CSV export
 * exists for it, on purpose - see hrAnalyticsRepository.ts). Defaulting a brand-new PII-touching
 * feature to "admins only" is the safe choice; if specific non-admin staff need it, extending
 * UserPermissions with a dedicated flag is the place to revisit this.
 */
export function isHrAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin);
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
