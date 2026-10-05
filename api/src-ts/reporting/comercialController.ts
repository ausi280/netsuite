import type { Request, Response } from 'express';
import { getLegacyDb } from '../db/legacyDbConnection';
import { getProspectosPorTareas } from './comercialRepository';
import { isProspectosAllowed } from './prospectosController';

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateRange(req: Request): { dateFrom: string; dateTo: string } | null {
  const { dateFrom, dateTo } = req.query;
  if (!isDateOnly(dateFrom) || !isDateOnly(dateTo) || dateFrom > dateTo) return null;
  return { dateFrom, dateTo };
}

/** GET /api/reports/comercial?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD - gated the same as
 * /prospectos (same underlying Cryo.dbo.Prospecto/Lead/Vendedor data). */
export async function getComercialReportRoute(req: Request, res: Response): Promise<void> {
  if (!isProspectosAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const result = await getProspectosPorTareas(getLegacyDb(), range.dateFrom, range.dateTo);
  res.status(200).json({ success: true, ...result });
}
