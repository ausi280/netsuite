import type { Request, Response } from 'express';
import { getLegacyDb } from '../db/legacyDbConnection';
import {
  getReembolsoEmpresaOptions,
  getReembolsosByCausa,
  getReembolsosByMonth,
  getReembolsosCerradosByMonth,
  getReembolsosForExport,
  getReembolsosPaged,
  REEMBOLSO_BUCKET_LABELS,
} from './reembolsosRepository';
import type { ReembolsoFilters, ReembolsoRow } from './reembolsosRepository';
import { csvRow } from './csvExport';
import { isPostventaAllowed } from './postventaController';

function parseFilters(req: Request): ReembolsoFilters | null {
  const anio = Number(req.query.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return null;

  const empresaId = typeof req.query.empresaId === 'string' && req.query.empresaId.trim() !== '' ? req.query.empresaId.trim() : undefined;
  return { anio, empresaId };
}

/** GET /api/reports/postventa/reembolsos/empresas - every empresa with at least one Reembolso on
 * file, for the filter dropdown. Same 'postventa' grant as the rest of this report - Reembolsos
 * lives under the Postventa page, not a separate permission. */
export async function listReembolsoEmpresasRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await getReembolsoEmpresaOptions(getLegacyDb());
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/reembolsos/by-month?anio=&empresaId= - monto per (mes, bucket). */
export async function getReembolsosByMonthRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const filters = parseFilters(req);
  if (!filters) {
    res.status(400).json({ success: false, message: 'Provee un ?anio=YYYY válido.' });
    return;
  }

  const data = await getReembolsosByMonth(getLegacyDb(), filters);
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/reembolsos/by-causa?anio=&empresaId= - monto per causa de reembolso. */
export async function getReembolsosByCausaRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const filters = parseFilters(req);
  if (!filters) {
    res.status(400).json({ success: false, message: 'Provee un ?anio=YYYY válido.' });
    return;
  }

  const data = await getReembolsosByCausa(getLegacyDb(), filters);
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/reembolsos/cerrados-by-month?anio=&empresaId= - count + monto of
 * closed reembolsos per (mes, año) of their own fecha cierre (FechaActualizacion). */
export async function getReembolsosCerradosByMonthRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const filters = parseFilters(req);
  if (!filters) {
    res.status(400).json({ success: false, message: 'Provee un ?anio=YYYY válido.' });
    return;
  }

  const data = await getReembolsosCerradosByMonth(getLegacyDb(), filters);
  res.status(200).json({ success: true, data });
}

/** GET /api/reports/postventa/reembolsos?anio=&empresaId=&page=&pageSize= - the paginated detail table. */
export async function listReembolsosRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const filters = parseFilters(req);
  if (!filters) {
    res.status(400).json({ success: false, message: 'Provee un ?anio=YYYY válido.' });
    return;
  }

  const result = await getReembolsosPaged(getLegacyDb(), filters, req.query.page, req.query.pageSize);
  res.status(200).json({ success: true, ...result });
}

const EXPORT_COLUMNS: Array<{ key: keyof ReembolsoRow; header: string }> = [
  { key: 'folio', header: 'Folio' },
  { key: 'empresa', header: 'Empresa' },
  { key: 'producto', header: 'Producto' },
  { key: 'causa', header: 'Causa' },
  { key: 'bucket', header: 'Estatus' },
  { key: 'anio', header: 'Año' },
  { key: 'mes', header: 'Mes' },
  { key: 'monto', header: 'Monto' },
];

function formatReembolsoValue(key: keyof ReembolsoRow, value: unknown): string {
  if (key === 'bucket') return REEMBOLSO_BUCKET_LABELS[value as keyof typeof REEMBOLSO_BUCKET_LABELS] ?? String(value);
  if (value === null || value === undefined) return '';
  return String(value);
}

/** GET /api/reports/postventa/reembolsos/export?anio=&empresaId= - the same filtered rows
 * listReembolsosRoute would page through, streamed out as one CSV file. */
export async function exportReembolsosRoute(req: Request, res: Response): Promise<void> {
  if (!isPostventaAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const filters = parseFilters(req);
  if (!filters) {
    res.status(400).json({ success: false, message: 'Provee un ?anio=YYYY válido.' });
    return;
  }

  const rows = await getReembolsosForExport(getLegacyDb(), filters);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reembolsos-${filters.anio}.csv"`);
  res.write('﻿');
  res.write(csvRow(EXPORT_COLUMNS.map((c) => c.header)));
  for (const row of rows) {
    res.write(csvRow(EXPORT_COLUMNS.map((c) => formatReembolsoValue(c.key, row[c.key]))));
  }
  res.end();
}
