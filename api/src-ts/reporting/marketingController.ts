import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getLegacyDb } from '../db/legacyDbConnection';
import {
  filterLeadDetails,
  getLeadDetails,
  getProspectoQualification,
  getSalesByMonth,
  type LeadDetailFilters,
  type LeadDetailRow,
  type ProspectoQualificationCategory,
} from './marketingRepository';
import {
  ARGENTINA_MARCA_IDS,
  getArgentinaLeadDetails,
  getArgentinaLeadQualification,
  getArgentinaSalesByMonth,
  type ArgentinaMarca,
} from './argentinaMarketingRepository';
import { clampPage, clampPageSize } from './prospectosRepository';
import { csvRow, formatExportValue } from './csvExport';
import {
  getMarketingInputsBetween,
  getMarketingInputsForYear,
  MARKETING_INPUT_FIELDS,
  MARKETING_PAISES,
  saveMarketingInputs,
  type MarketingMonthlyInputs,
  type MarketingPais,
} from './marketingInputsRepository';
import { isProspectosAllowed } from './prospectosController';
import {
  getPostventaByAsunto,
  getPostventaByMonth,
  getPostventaByOwner,
  getPostventaResueltosByMonth,
  getPostventaSummary,
  type PostventaFilters,
} from './postventaRepository';
import type { UserPermissions } from './permissionsRepository';

/** Whether this caller may capture the monthly inversión digital / funnel metas - its own grant,
 * 'marketing_inputs', on top of seeing the report ('prospectos'). */
function isMarketingInputsEditAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('marketing_inputs'));
}

function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** ?pais=MX|AR (body.pais on save) - defaults to México, the report's original (and only) scope. */
function parsePais(value: unknown): MarketingPais | null {
  if (value === undefined || value === null || value === '') return 'MX';
  return MARKETING_PAISES.includes(value as MarketingPais) ? (value as MarketingPais) : null;
}

function parseDateRange(req: Request): { dateFrom: string; dateTo: string } | null {
  const { dateFrom, dateTo } = req.query;
  if (!isDateOnly(dateFrom) || !isDateOnly(dateTo) || dateFrom > dateTo) return null;
  return { dateFrom, dateTo };
}

/** GET /api/reports/marketing?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&pais=MX|AR - gated the same as
 * /prospectos (same underlying data), since this is a set of charts built on top of it. México
 * reads the legacy Cryo.dbo CRM (marketingRepository.ts); Argentina reads NetSuite leads and
 * contracts (argentinaMarketingRepository.ts) - same response shape either way.
 * `funnelInputs` are the captured months (inversión digital + metas) the range touches - see
 * marketingInputsRepository.ts. */
export async function getMarketingReportRoute(req: Request, res: Response): Promise<void> {
  if (!isProspectosAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const pais = parsePais(req.query.pais);
  if (!pais) {
    res.status(400).json({ success: false, message: 'Provide a valid ?pais=MX|AR.' });
    return;
  }

  // ?marca= (Argentina only): one brand id, or absent for all of them.
  const rawMarca = req.query.marca;
  const marca = rawMarca === undefined || rawMarca === '' ? null : (rawMarca as ArgentinaMarca);
  if (marca !== null && (pais !== 'AR' || !ARGENTINA_MARCA_IDS.includes(marca))) {
    res.status(400).json({ success: false, message: `Provide a valid ?marca= (${ARGENTINA_MARCA_IDS.join('|')}), Argentina only.` });
    return;
  }

  const [salesByMonth, qualification, funnelInputs] = await Promise.all(
    pais === 'AR'
      ? ([
          getArgentinaSalesByMonth(knex, range.dateFrom, range.dateTo, marca),
          getArgentinaLeadQualification(knex, range.dateFrom, range.dateTo, marca),
          getMarketingInputsBetween(knex, pais, range.dateFrom, range.dateTo),
        ] as const)
      : ([
          getSalesByMonth(getLegacyDb(), range.dateFrom, range.dateTo),
          getProspectoQualification(getLegacyDb(), range.dateFrom, range.dateTo),
          getMarketingInputsBetween(knex, pais, range.dateFrom, range.dateTo),
        ] as const),
  );

  res.status(200).json({
    success: true,
    salesByMonth,
    qualification,
    funnelInputs,
    canEditInputs: isMarketingInputsEditAllowed(req.permissions),
  });
}

const LEAD_CATEGORIES: ProspectoQualificationCategory[] = [
  'Prospecto',
  'Contactado: datos incompletos',
  'En intento',
  'No contactado',
  'No calificado',
  'Lead inválido',
];

/** The lead grid's rows for this request, classified and filtered - shared by the page and the CSV.
 * Answers the request itself and returns null when it's not allowed or not valid. */
async function loadLeadDetails(req: Request, res: Response): Promise<LeadDetailRow[] | null> {
  if (!isProspectosAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return null;
  }

  const range = parseDateRange(req);
  const pais = parsePais(req.query.pais);
  if (!range || !pais) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD, ?dateTo=YYYY-MM-DD (dateFrom <= dateTo) and ?pais=MX|AR.' });
    return null;
  }

  const rawMarca = req.query.marca;
  const marca = rawMarca === undefined || rawMarca === '' ? null : (rawMarca as ArgentinaMarca);
  if (marca !== null && (pais !== 'AR' || !ARGENTINA_MARCA_IDS.includes(marca))) {
    res.status(400).json({ success: false, message: `Provide a valid ?marca= (${ARGENTINA_MARCA_IDS.join('|')}), Argentina only.` });
    return null;
  }

  const { categoria, canal } = req.query;
  if ((categoria && !LEAD_CATEGORIES.includes(categoria as ProspectoQualificationCategory)) || (canal && canal !== 'online' && canal !== 'offline')) {
    res.status(400).json({ success: false, message: 'Provide a valid ?categoria= and ?canal=online|offline.' });
    return null;
  }
  const filters: LeadDetailFilters = {
    categoria: categoria ? (categoria as ProspectoQualificationCategory) : null,
    canal: canal ? (canal as 'online' | 'offline') : null,
  };

  const rows =
    pais === 'AR'
      ? await getArgentinaLeadDetails(knex, range.dateFrom, range.dateTo, marca)
      : await getLeadDetails(getLegacyDb(), range.dateFrom, range.dateTo);
  return filterLeadDetails(rows, filters);
}

/** GET /api/reports/marketing/leads?dateFrom=&dateTo=&pais=&marca=&categoria=&canal=&page=&pageSize= -
 * one row per lead with its category and why, same classification as the charts. */
export async function listMarketingLeadsRoute(req: Request, res: Response): Promise<void> {
  const rows = await loadLeadDetails(req, res);
  if (!rows) return;

  const page = clampPage(req.query.page);
  const pageSize = clampPageSize(req.query.pageSize);
  res.status(200).json({
    success: true,
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
  });
}

const LEAD_EXPORT_COLUMNS: Array<{ key: keyof LeadDetailRow; header: string }> = [
  { key: 'id', header: 'ID' },
  { key: 'fecha_captura', header: 'Fecha Captura' },
  { key: 'lead', header: 'Lead' },
  { key: 'empresa', header: 'Empresa / Marca' },
  { key: 'canal', header: 'Online / Offline' },
  { key: 'canal_nombre', header: 'Canal' },
  { key: 'categoria', header: 'Clasificación' },
  { key: 'razon', header: 'Razón' },
  { key: 'motivo', header: 'Motivo de cierre' },
  { key: 'etapa', header: 'Etapa' },
  { key: 'intentos', header: 'Intentos' },
  { key: 'fecha_probable', header: 'FPP' },
  { key: 'ciudad', header: 'Ciudad' },
  { key: 'vendedor', header: 'Vendedor' },
];

/** GET /api/reports/marketing/leads/export - the same filtered rows as listMarketingLeadsRoute, as
 * one CSV file (same convention as exportProspectosRoute). */
export async function exportMarketingLeadsRoute(req: Request, res: Response): Promise<void> {
  const rows = await loadLeadDetails(req, res);
  if (!rows) return;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="clasificacion-leads.csv"');
  // UTF-8 BOM so Excel renders accented characters/ñ correctly, same as exportEntityRows.
  res.write('﻿');
  res.write(csvRow(LEAD_EXPORT_COLUMNS.map((c) => c.header)));
  for (const row of rows) {
    res.write(
      csvRow(
        LEAD_EXPORT_COLUMNS.map((c) => {
          const value = row[c.key];
          return value instanceof Date ? value.toISOString().slice(0, 10) : formatExportValue(c.key, value);
        }),
      ),
    );
  }
  res.end();
}

/** GET /api/reports/marketing/inputs?year=YYYY&pais=MX|AR - all 12 months of that year for the capture page. */
export async function getMarketingInputsRoute(req: Request, res: Response): Promise<void> {
  if (!isProspectosAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ success: false, message: 'Provide a valid ?year=YYYY.' });
    return;
  }

  const pais = parsePais(req.query.pais);
  if (!pais) {
    res.status(400).json({ success: false, message: 'Provide a valid ?pais=MX|AR.' });
    return;
  }

  const data = await getMarketingInputsForYear(knex, pais, year);
  res.status(200).json({ success: true, data, canEdit: isMarketingInputsEditAllowed(req.permissions) });
}

/** PUT /api/reports/marketing/inputs - body { pais?, year, month, ...fields }, each field a non-negative
 * number or null. Replaces that month's values. */
export async function saveMarketingInputsRoute(req: Request, res: Response): Promise<void> {
  if (!isMarketingInputsEditAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta configuración.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ success: false, message: 'Provide year and month (1-12).' });
    return;
  }
  const pais = parsePais(body.pais);
  if (!pais) {
    res.status(400).json({ success: false, message: 'Provide a valid pais (MX|AR).' });
    return;
  }

  const input = { year, month } as MarketingMonthlyInputs;
  for (const field of MARKETING_INPUT_FIELDS) {
    const raw = body[field];
    if (raw === null || raw === undefined || raw === '') {
      input[field] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      res.status(400).json({ success: false, message: `${field} must be a non-negative number or null.` });
      return;
    }
    input[field] = n;
  }

  await saveMarketingInputs(knex, pais, input);
  res.status(200).json({ success: true });
}

/** Zammad group of the marketing team's requests (diseño, branding, contenido...). */
const MARKETING_TICKETS_GROUP = 'Marketing';

/** GET /api/reports/marketing/tickets?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD - the Marketing group's
 * Zammad tickets, with exactly the same status buckets and breakdowns as the Postventa report
 * (postventaRepository.ts, run with group = "Marketing"), filtered by creation date. Differences:
 * asuntos are grouped by their top-level category, and Cerrado + Resuelto are reported as one
 * combined "closed" bucket (also in "closed per month"). Every empresa - these are corporate marketing requests, not
 * only México's. Gated like the rest of the Marketing report. */
export async function getMarketingTicketsRoute(req: Request, res: Response): Promise<void> {
  if (!isProspectosAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const range = parseDateRange(req);
  if (!range) {
    res.status(400).json({ success: false, message: 'Provide a valid ?dateFrom=YYYY-MM-DD and ?dateTo=YYYY-MM-DD (dateFrom <= dateTo).' });
    return;
  }

  const filters: PostventaFilters = { group: MARKETING_TICKETS_GROUP, asuntoTopLevel: true, dateFrom: range.dateFrom, dateTo: range.dateTo };
  const [summary, byMonth, byOwner, byAsunto, cerradosByMonth] = await Promise.all([
    getPostventaSummary(knex, filters),
    getPostventaByMonth(knex, filters),
    getPostventaByOwner(knex, filters),
    getPostventaByAsunto(knex, filters),
    getPostventaResueltosByMonth(knex, filters, ['Cerrado', 'Resuelto']),
  ]);

  res.status(200).json({ success: true, summary, byMonth, byOwner, byAsunto, cerradosByMonth });
}
