import type { Request, Response } from 'express';
import { getLegacyDb } from '../db/legacyDbConnection';
import {
  getTareaVencidaVendedorOptions,
  getTareasVencidasByMonth,
  getTareasVencidasForExport,
  getTareasVencidasPaged,
} from './tareasVencidasRepository';
import type { TareaVencidaRow } from './tareasVencidasRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';

const DATE_ONLY_COLUMNS = new Set<keyof TareaVencidaRow>(['fecha_inicial', 'fecha_final', 'fecha_cierre']);

function formatTareaVencidaValue(key: keyof TareaVencidaRow, value: unknown): string {
  if (DATE_ONLY_COLUMNS.has(key) && value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (key === 'activo') {
    return value === null || value === undefined ? '' : value ? 'Sí' : 'No';
  }
  return formatExportValue(key, value);
}

/** Standalone grant, same shape as isProspectosAllowed/isHrAllowed - NOT an additional gate on top
 * of 'prospectos' (a user can have 'tareas_vencidas' without 'prospectos' and still see this one
 * sub-report, even though it's embedded in the Comercial page). See PermissionKey in types.ts. */
function isTareasVencidasAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('tareas_vencidas'));
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateRange(req: Request): { dateFrom: string; dateTo: string } | null {
  const { dateFrom, dateTo } = req.query;
  if (!isDateOnly(dateFrom) || !isDateOnly(dateTo) || dateFrom > dateTo) return null;
  return { dateFrom, dateTo };
}

/** `?vendedorIds=582,1772,1773` - the underlying raw Vendedor ids a merged dropdown entry maps to
 * (see web/src/utils/comercial.ts's normalizeVendedorName) - null when the filter isn't set, which
 * means "every vendedor". Malformed/non-numeric entries are dropped rather than rejected, same
 * permissive-parsing convention as every other optional list filter in this API. */
function parseVendedorIds(req: Request): number[] | null {
  const raw = req.query.vendedorIds;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? ids : null;
}

/** GET /api/reports/comercial/tareas-vencidas?dateFrom=&dateTo=&vendedorIds=&page=&pageSize= -
 * gated by its own standalone 'tareas_vencidas' permission (see isTareasVencidasAllowed above),
 * not the Comercial page's 'prospectos' gate, even though it's embedded in that page. */
export async function listTareasVencidasRoute(req: Request, res: Response): Promise<void> {
  if (!isTareasVencidasAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const vendedorIds = parseVendedorIds(req);
  const result = await getTareasVencidasPaged(getLegacyDb(), range.dateFrom, range.dateTo, vendedorIds, req.query.page, req.query.pageSize);
  res.status(200).json({ success: true, ...result });
}

/** GET /api/reports/comercial/tareas-vencidas/vendedores?dateFrom=&dateTo= - distinct (id_vendedor,
 * vendedor) pairs for the dropdown, deduped further client-side (see parseVendedorIds above). */
export async function listTareaVencidaVendedoresRoute(req: Request, res: Response): Promise<void> {
  if (!isTareasVencidasAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const data = await getTareaVencidaVendedorOptions(getLegacyDb(), range.dateFrom, range.dateTo);
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/comercial/tareas-vencidas/by-month?dateFrom=&dateTo= - counts grouped by
 * (año, mes) of FechaFinal, globally and per vendedor, for the global/por-vendedor charts.
 * Deliberately NOT filterable by vendedorIds (unlike the other two routes) - it always returns
 * every vendedor's breakdown in one response, and the frontend slices the selected vendedor's
 * rows out of `porVendedor` itself, same as every other per-vendedor chart on the Comercial page. */
export async function getTareasVencidasByMonthRoute(req: Request, res: Response): Promise<void> {
  if (!isTareasVencidasAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const result = await getTareasVencidasByMonth(getLegacyDb(), range.dateFrom, range.dateTo);
  res.status(200).json({ success: true, ...result });
}

const EXPORT_COLUMNS: Array<{ key: keyof TareaVencidaRow; header: string }> = [
  { key: 'id_tarea', header: 'ID Tarea' },
  { key: 'tipo_tarea', header: 'Tipo' },
  { key: 'fecha_inicial', header: 'Fecha Inicial' },
  { key: 'fecha_final', header: 'Fecha Final (vencida)' },
  { key: 'fecha_cierre', header: 'Fecha Cierre' },
  { key: 'activo', header: 'Activo' },
  { key: 'nota', header: 'Nota' },
  { key: 'vendedor', header: 'Vendedor' },
  { key: 'id_prospecto', header: 'ID Prospecto' },
  { key: 'madre_completo', header: 'Madre' },
  { key: 'padre_completo', header: 'Padre' },
  { key: 'telefonos', header: 'Teléfonos' },
];

/** GET /api/reports/comercial/tareas-vencidas/export?dateFrom=&dateTo=&vendedorIds= - the same
 * filtered rows listTareasVencidasRoute would page through, streamed out as one CSV file (same
 * convention as exportProspectosRoute). */
export async function exportTareasVencidasRoute(req: Request, res: Response): Promise<void> {
  if (!isTareasVencidasAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const vendedorIds = parseVendedorIds(req);
  const rows = await getTareasVencidasForExport(getLegacyDb(), range.dateFrom, range.dateTo, vendedorIds);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tareas-vencidas-${range.dateFrom}-a-${range.dateTo}.csv"`);
  res.write('﻿');
  res.write(csvRow(EXPORT_COLUMNS.map((c) => c.header)));
  for (const row of rows) {
    res.write(csvRow(EXPORT_COLUMNS.map((c) => formatTareaVencidaValue(c.key, row[c.key]))));
  }
  res.end();
}
