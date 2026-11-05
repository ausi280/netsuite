import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getChurnReport, getStorageReport, monthCutoff } from './administracionRepository';
import type { UserPermissions } from './permissionsRepository';

/** Standalone grant, same shape as 'postventa'/'hr'. */
export function isAdministracionAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('administracion'));
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** GET /api/reports/administracion?month=&year=&churnFrom=&churnTo= - storage counts as of the
 * month's last day, plus abandonment over [churnFrom, churnTo] (default: January 1st of `year`
 * through that same last day). */
export async function getAdministracionReportRoute(req: Request, res: Response): Promise<void> {
  if (!isAdministracionAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const now = new Date();
  const month = Number(req.query.month) || now.getMonth() + 1;
  const year = Number(req.query.year) || now.getFullYear();
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    res.status(400).json({ success: false, message: 'Mes o año inválido.' });
    return;
  }

  const cutoff = monthCutoff(month, year);
  const churnFrom = isDateOnly(req.query.churnFrom) ? req.query.churnFrom : `${year}-01-01`;
  const churnTo = isDateOnly(req.query.churnTo) ? req.query.churnTo : cutoff;
  if (churnFrom > churnTo) {
    res.status(400).json({ success: false, message: 'La fecha inicial debe ser anterior a la final.' });
    return;
  }

  const [storage, churn] = await Promise.all([getStorageReport(knex, cutoff), getChurnReport(knex, churnFrom, churnTo)]);
  res.status(200).json({ success: true, data: { month, year, storage, churn: { from: churnFrom, to: churnTo, rows: churn } } });
}
