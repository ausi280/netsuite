import type { Request, Response } from 'express';
import { bootstrap } from '../bootstrap';
import knex from '../db/connection';
import { getLegacyDb } from '../db/legacyDbConnection';
import { getCombinedNotesReport } from './notesReportRepository';
import type { NotesReportRow } from './notesReportRepository';
import { csvRow } from './csvExport';
import { isContractsAllowed } from './contractReportsController';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface ParsedDateRange {
  ok: true;
  dateFrom: string;
  dateTo: string;
}

interface DateRangeError {
  ok: false;
  message: string;
}

function parseDateRange(query: Request['query']): ParsedDateRange | DateRangeError {
  const dateFrom = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
  const dateTo = typeof query.dateTo === 'string' ? query.dateTo.trim() : '';

  if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo)) {
    return { ok: false, message: 'Provide ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD.' };
  }
  if (dateFrom > dateTo) {
    return { ok: false, message: 'dateFrom must not be after dateTo.' };
  }

  return { ok: true, dateFrom, dateTo };
}

/** GET /api/reports/notas?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD */
export async function listNotesReportRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req.query);
  if (!range.ok) {
    res.status(400).json({ success: false, message: range.message });
    return;
  }

  try {
    const result = await getCombinedNotesReport(bootstrap().http, knex, getLegacyDb(), range.dateFrom, range.dateTo);
    res.status(200).json({ success: true, data: result.data, truncated: result.truncated });
  } catch (error) {
    console.error('Error fetching notes report:', error);
    res.status(502).json({ success: false, message: 'No se pudieron cargar las notas.' });
  }
}

const EXPORT_COLUMNS: Array<{ key: keyof NotesReportRow; header: string }> = [
  { key: 'contrato', header: 'Contrato' },
  { key: 'folio_sistema_anterior', header: 'Folio sistema anterior' },
  { key: 'sistema', header: 'Sistema' },
  { key: 'fecha_creacion', header: 'Fecha de creación' },
  { key: 'usuario', header: 'Usuario' },
  { key: 'titulo', header: 'Título' },
  { key: 'nota', header: 'Nota' },
];

/** GET /api/reports/notas/export?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD */
export async function exportNotesReportRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req.query);
  if (!range.ok) {
    res.status(400).json({ success: false, message: range.message });
    return;
  }

  try {
    const result = await getCombinedNotesReport(bootstrap().http, knex, getLegacyDb(), range.dateFrom, range.dateTo);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="notas.csv"');
    res.write('﻿');
    res.write(csvRow(EXPORT_COLUMNS.map((c) => c.header)));
    for (const row of result.data) {
      res.write(csvRow(EXPORT_COLUMNS.map((c) => row[c.key] ?? '')));
    }
    res.end();
  } catch (error) {
    console.error('Error exporting notes report:', error);
    res.status(502).json({ success: false, message: 'No se pudieron cargar las notas.' });
  }
}
