import type { Request, Response } from 'express';
import knex from '../db/connection';
import {
  ESTADO_RESUMEN_LABELS,
  getPostventaByAsunto,
  getPostventaByMonth,
  getPostventaOwnerOptions,
  getPostventaResueltosByMonth,
  getPostventaSummary,
  getPostventaTicketsForExport,
  getPostventaTicketsPaged,
} from './postventaRepository';
import type { PostventaFilters, PostventaTicketRow } from './postventaRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';

/** Standalone grant, same shape as 'tareas_vencidas'/'cobranza_commissions' - NOT an additional
 * gate on top of 'zammad-tickets' (the separate, generic Zammad Tickets table view). */
export function isPostventaAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('postventa'));
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseFilters(req: Request): PostventaFilters {
  const { dateFrom, dateTo, ownerId } = req.query;
  return {
    dateFrom: isDateOnly(dateFrom) ? dateFrom : undefined,
    dateTo: isDateOnly(dateTo) ? dateTo : undefined,
    ownerId: typeof ownerId === 'string' && ownerId.trim() !== '' ? ownerId.trim() : undefined,
  };
}

/** GET /api/reports/postventa/summary?dateFrom=&dateTo=&ownerId= - the four status-tile counts
 * (nuevos/enProceso/cerrados/resueltos), see postventaRepository.ts for exactly how each is
 * defined. */
export async function getPostventaSummaryRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getPostventaSummary(knex, parseFilters(req));
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/owners - distinct real owners (never the unassigned sentinel) for
 * the owner filter dropdown. */
export async function listPostventaOwnersRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getPostventaOwnerOptions(knex);
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/by-month?dateFrom=&dateTo=&ownerId= - the four counts per (año, mes)
 * of created_at_zammad, for the status-by-month chart. */
export async function getPostventaByMonthRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getPostventaByMonth(knex, parseFilters(req));
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/by-asunto?dateFrom=&dateTo=&ownerId= - ticket counts per normalized
 * asunto across the whole filtered range, for the by-asunto breakdown chart. */
export async function getPostventaByAsuntoRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getPostventaByAsunto(knex, parseFilters(req));
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/resueltos-by-month?dateFrom=&dateTo=&ownerId= - Resuelto-state ticket
 * counts per (año, mes) of their own close_at_zammad ("fecha resuelto"), for the resolution-volume
 * chart - see getPostventaResueltosByMonth for why this is a different question than by-month's
 * creation-volume view. */
export async function getPostventaResueltosByMonthRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getPostventaResueltosByMonth(knex, parseFilters(req));
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/tickets?dateFrom=&dateTo=&ownerId=&page=&pageSize= - the paginated
 * detail table. */
export async function listPostventaTicketsRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const result = await getPostventaTicketsPaged(knex, parseFilters(req), req.query.page, req.query.pageSize);
  res.status(200).json({ success: true, ...result });
}

const EXPORT_COLUMNS: Array<{ key: keyof PostventaTicketRow; header: string }> = [
  { key: 'number', header: 'Número' },
  { key: 'title', header: 'Título' },
  { key: 'asunto', header: 'Asunto' },
  { key: 'estado_resumen', header: 'Estatus' },
  { key: 'state_name', header: 'Estado Zammad' },
  { key: 'priority_name', header: 'Prioridad' },
  { key: 'owner_name', header: 'Dueño' },
  { key: 'customer_email', header: 'Cliente' },
  { key: 'foliocontrato', header: 'Folio Contrato' },
  { key: 'telefono', header: 'Teléfono' },
  { key: 'empresa', header: 'Empresa' },
  { key: 'created_at_zammad', header: 'Fecha de Creación' },
  { key: 'first_response_at_zammad', header: 'Fecha de Primera Atención' },
  { key: 'close_at_zammad', header: 'Fecha de Cierre' },
  { key: 'updated_at_zammad', header: 'Actualizado' },
];

function formatPostventaValue(key: keyof PostventaTicketRow, value: unknown): string {
  if (key === 'estado_resumen') return ESTADO_RESUMEN_LABELS[value as keyof typeof ESTADO_RESUMEN_LABELS] ?? String(value);
  return formatExportValue(key, value);
}

/** GET /api/reports/postventa/export?dateFrom=&dateTo=&ownerId= - the same filtered rows
 * listPostventaTicketsRoute would page through, streamed out as one CSV file (same convention as
 * exportTareasVencidasRoute). */
export async function exportPostventaRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const rows = await getPostventaTicketsForExport(knex, parseFilters(req));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="postventa.csv"');
  res.write('﻿');
  res.write(csvRow(EXPORT_COLUMNS.map((c) => c.header)));
  for (const row of rows) {
    res.write(csvRow(EXPORT_COLUMNS.map((c) => formatPostventaValue(c.key, row[c.key]))));
  }
  res.end();
}
