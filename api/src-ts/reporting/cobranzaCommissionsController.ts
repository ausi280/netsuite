import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getCobranzaCommissionsReport } from './cobranzaCommissionsRepository';
import { parseSubsidiaryFilter } from './reportingRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';

/** Its own standalone grant, not an additional gate on top of 'partidas' - unlike Cuentas (reached
 * from the same Partidas report but gated by that same 'partidas' permission), this report surfaces
 * cobrador-identifying collections data that not every Partidas viewer should see. */
export function isCobranzaCommissionsAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has('cobranza_commissions'));
}

function subsidiaryRestrictionFor(permissions: UserPermissions): Set<string> | null {
  return permissions.isAdmin ? null : permissions.allowedSubsidiaries;
}

function parsePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function resolveMonthYear(req: Request): { month: number; year: number } {
  const now = new Date();
  const month = parsePositiveInt(req.query.month) ?? now.getMonth() + 1;
  const year = parsePositiveInt(req.query.year) ?? now.getFullYear();
  return { month, year };
}

/** GET /api/reports/cobranza-comisiones?month=&year=&subsidiary= */
export async function getCobranzaCommissionsRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isCobranzaCommissionsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { month, year } = resolveMonthYear(req);
  const subsidiary = parseSubsidiaryFilter(req.query.subsidiary);
  const data = await getCobranzaCommissionsReport(knex, month, year, subsidiary, subsidiaryRestrictionFor(permissions!));
  res.status(200).json({ success: true, data, month, year });
}

const ASIGNACION_TIPO_LABELS: Record<string, string> = {
  dueno: 'Dueño',
  cobrador: 'Cobrador',
  bolsa: 'Bolsa',
  paquete_inicial: 'Paquete Inicial',
};

// Mexico's IVA rate - custrecord_cryo_importepagado (the invoice total this partida was billed
// on) includes tax, per explicit instruction to show the net-of-tax figure instead. Confirmed live
// only for Mexico-subsidiary records (65 USD partida -> 75.4 importepagado, exactly ×1.16); NOT
// verified for other subsidiaries/currencies, which may use a different VAT rate (e.g. Argentina's
// IVA is 21%, not 16%) - applied uniformly here regardless, since no confirmed per-subsidiary rate
// exists yet.
const IVA_RATE = 0.16;

function importePagadoNeto(importePagado: string | null): number | null {
  if (importePagado === null || importePagado === '') return null;
  const raw = Number(importePagado);
  return Number.isFinite(raw) ? raw / (1 + IVA_RATE) : null;
}

// custrecord_cryo_importepagado's own currency never matches the partida's catalog `moneda` - per
// explicit instruction ("we are receiving the payments in MXN"), labeled fixed MXN rather than
// whatever `moneda` the partida's nominal catalog price happens to carry.
const IMPORTE_PAGADO_CURRENCY_LABEL = 'MXN';

const EXPORT_HEADERS = [
  'Contrato',
  'No. Contrato Sistema Anterior',
  'Dueño',
  'Cobrador',
  'Asignado a',
  'Tipo de Asignación',
  'Subsidiaria',
  'Año',
  'Concepto',
  'Tipo de Servicio',
  'Estatus',
  'Fecha Límite de Pago',
  'Importe',
  'Moneda',
  'Importe Pagado (neto de IVA)',
  'Moneda Pagado',
  'Factura',
  'Paquete Inicial de Anualidades',
];

/** GET /api/reports/cobranza-comisiones/export?month=&year=&subsidiary= - same filtered/grouped
 * rows getCobranzaCommissionsRoute returns, flattened to one CSV row per partida. */
export async function exportCobranzaCommissionsRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isCobranzaCommissionsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { month, year } = resolveMonthYear(req);
  const subsidiary = parseSubsidiaryFilter(req.query.subsidiary);
  const groups = await getCobranzaCommissionsReport(knex, month, year, subsidiary, subsidiaryRestrictionFor(permissions!));

  const filename = `cobranza-comisiones-${year}-${String(month).padStart(2, '0')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('﻿');
  res.write(csvRow(EXPORT_HEADERS));

  for (const group of groups) {
    for (const yearGroup of group.years) {
      for (const partida of yearGroup.partidas) {
        res.write(
          csvRow([
            group.contract_name ?? group.contract_id,
            group.folio_sistema_anterior ?? '',
            group.dueno_nombre ?? '',
            group.cobrador_nombre ?? '',
            group.asignado_a,
            ASIGNACION_TIPO_LABELS[group.asignado_tipo] ?? group.asignado_tipo,
            formatExportValue('custrecord_cryo_subsidiariacontrato', group.subsidiaria_id),
            yearGroup.anio === 'sin-anio' ? '' : yearGroup.anio,
            partida.concepto ?? '',
            partida.servtipo ?? '',
            formatExportValue('custrecord_cryo_estatuspartida', partida.estatus),
            partida.fecha_limite_pago ?? '',
            partida.importe ?? '',
            formatExportValue('custrecord_cryo_monedapartida', partida.moneda),
            importePagadoNeto(partida.importe_pagado)?.toFixed(2) ?? '',
            importePagadoNeto(partida.importe_pagado) !== null ? IMPORTE_PAGADO_CURRENCY_LABEL : '',
            partida.invoice_tranid ?? '',
            partida.es_paquete_inicial ? 'Sí' : '',
          ]),
        );
      }
    }
  }
  res.end();
}
