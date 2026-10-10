import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getZammadTicketsByMonth } from './zammadTicketsAnalyticsRepository';
import type { ZammadTicketsFilters } from './zammadTicketsAnalyticsRepository';
import type { UserPermissions } from './permissionsRepository';

/** Same grant as the generic Zammad Tickets grid/export ('zammad-tickets' is a real ReportEntityKey,
 * not a bespoke PermissionKey like 'postventa') - this is just another view of the same data. */
export function isZammadTicketsAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('zammad-tickets'));
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseFilters(req: Request): ZammadTicketsFilters {
  const { dateFrom, dateTo } = req.query;
  return {
    dateFrom: isDateOnly(dateFrom) ? dateFrom : undefined,
    dateTo: isDateOnly(dateTo) ? dateTo : undefined,
  };
}

/** GET /api/reports/zammad-tickets/by-month?dateFrom=&dateTo= - creados/primeraAtencion/cerrados
 * counts per (año, mes), for the Zammad Tickets by-month chart. */
export async function getZammadTicketsByMonthRoute(req: Request, res: Response): Promise<void> {
  if (!isZammadTicketsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getZammadTicketsByMonth(knex, parseFilters(req));
  res.status(200).json({ success: true, data });
}
