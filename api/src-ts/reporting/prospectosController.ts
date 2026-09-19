import type { Request, Response } from 'express';
import { getLegacyDb } from '../db/legacyDbConnection';
import { getProspectosForExport, getProspectosPaged } from './prospectosRepository';
import type { ProspectoRow } from './prospectosRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';

const DATE_ONLY_COLUMNS = new Set<keyof ProspectoRow>(['fecha_captura', 'fecha_probable', 'fecha_cierre_tarea', 'fecha_venta']);

/** formatExportValue's generic Date handling renders a full ISO timestamp (e.g.
 * "2024-12-31T00:00:00.000Z") - these columns are all really date-only (CAST(... as date) on the
 * SQL Server side, or a date-typed Contrato column), so trim to just the date part for the CSV. */
function formatProspectoValue(key: keyof ProspectoRow, value: unknown): string {
  if (DATE_ONLY_COLUMNS.has(key) && value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (key === 'activo') {
    return value === null || value === undefined ? '' : value ? 'Sí' : 'No';
  }
  return formatExportValue(key, value);
}

/** Gated like HR Report - isAdmin, or 'prospectos' in allowedEntities - granted per-user from the
 * admin "manage users" screen. Has no ENTITY_REGISTRY entry (see PermissionKey in types.ts). */
export function isProspectosAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('prospectos'));
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateRange(req: Request): { dateFrom: string; dateTo: string } | null {
  const { dateFrom, dateTo } = req.query;
  if (!isDateOnly(dateFrom) || !isDateOnly(dateTo) || dateFrom > dateTo) return null;
  return { dateFrom, dateTo };
}

/** GET /api/reports/prospectos?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&page=&pageSize= */
export async function listProspectosRoute(req: Request, res: Response): Promise<void> {
  if (!isProspectosAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const result = await getProspectosPaged(getLegacyDb(), range.dateFrom, range.dateTo, req.query.page, req.query.pageSize);
  res.status(200).json({ success: true, ...result });
}

const EXPORT_COLUMNS: Array<{ key: keyof ProspectoRow; header: string }> = [
  { key: 'id_prospecto', header: 'ID Prospecto' },
  { key: 'fecha_captura', header: 'Fecha Captura' },
  { key: 'mes', header: 'Mes' },
  { key: 'madre_completo', header: 'Madre' },
  { key: 'padre_completo', header: 'Padre' },
  { key: 'telefonos', header: 'Teléfonos' },
  { key: 'ciudad', header: 'Ciudad' },
  { key: 'tipo_canal', header: 'Tipo Canal' },
  { key: 'canal', header: 'Canal' },
  { key: 'vendedor', header: 'Vendedor' },
  { key: 'etapa', header: 'Etapa' },
  { key: 'estatus', header: 'Estatus' },
  { key: 'activo', header: 'Activo' },
  { key: 'motivo', header: 'Motivo (No Venta)' },
  { key: 'fecha_probable', header: 'Fecha Probable' },
  { key: 'tareas', header: 'Tareas' },
  { key: 'fecha_cierre_tarea', header: 'Fecha Cierre Última Tarea' },
  { key: 'nota_tarea', header: 'Nota Última Tarea' },
  { key: 'contrato', header: 'Contrato' },
  { key: 'folio_contrato', header: 'Folio Contrato' },
  { key: 'fecha_venta', header: 'Fecha Venta' },
  { key: 'mes_cancelacion', header: 'Mes Cancelación' },
  { key: 'id_empresa', header: 'ID Empresa' },
];

/** GET /api/reports/prospectos/export?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD - the same filtered
 * rows listProspectosRoute would page through, streamed out as one CSV file instead of JSON pages
 * (same convention as exportEntityRows in controller.ts). */
export async function exportProspectosRoute(req: Request, res: Response): Promise<void> {
  if (!isProspectosAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const rows = await getProspectosForExport(getLegacyDb(), range.dateFrom, range.dateTo);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="prospectos-${range.dateFrom}-a-${range.dateTo}.csv"`);
  // UTF-8 BOM so Excel renders accented characters/ñ correctly, same as exportEntityRows.
  res.write('﻿');
  res.write(csvRow(EXPORT_COLUMNS.map((c) => c.header)));
  for (const row of rows) {
    res.write(csvRow(EXPORT_COLUMNS.map((c) => formatProspectoValue(c.key, row[c.key]))));
  }
  res.end();
}
