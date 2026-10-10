import type { Request, Response } from 'express';
import knex from '../db/connection';
import {
  getCobranzaCommissionsReport,
  resolveSelfCobradorDuenoId,
  resolveSelfCobradorDuenoSubsidiarias,
} from './cobranzaCommissionsRepository';
import type { CobranzaCommissionContractGroup } from './cobranzaCommissionsRepository';
import { parseSubsidiaryFilter } from './reportingRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';

/** Whether this caller sees EVERY contract's cobranza data (as opposed to only the ones where
 * they're the resolved Dueño or Cobrador, via the separate self-cobrador/dueño path below). Its own
 * standalone grant, not an additional gate on top of 'partidas' - unlike Cuentas (reached from the
 * same Partidas report but gated by that same 'partidas' permission), this report surfaces
 * cobrador-identifying collections data that not every Partidas viewer should see. */
export function isCobranzaCommissionsFullAccessAllowed(permissions?: UserPermissions): boolean {
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

interface CobranzaCommissionsDataResult {
  ok: true;
  data: CobranzaCommissionContractGroup[];
  month: number;
  year: number;
}

interface CobranzaCommissionsDataError {
  ok: false;
  status: number;
  message: string;
}

/**
 * Shared auth + query-parsing + fetch behind getCobranzaCommissionsRoute and
 * exportCobranzaCommissionsRoute - every caller is gated one of two ways: full access
 * (isCobranzaCommissionsFullAccessAllowed - sees every contract, subsidiary-restricted as usual),
 * or a "self cobrador/dueño" - a caller without the explicit grant who's nonetheless the resolved
 * Dueño or Cobrador on at least one invoice/contract (resolveSelfCobradorDuenoId). Per explicit
 * instruction, a self cobrador/dueño sees the SAME full report as anyone else - every cobrador and
 * dueño, not narrowed down to just their own assignments - capped only to the subsidiaria(s) where
 * they themselves have contracts (resolveSelfCobradorDuenoSubsidiarias), same "no grant needed to
 * see your own [scope]" pattern contractReportsController.ts's loadCommissionsData established for
 * the regular Commissions report, just scoped by subsidiaria here instead of by vendedor.
 */
async function loadCobranzaCommissionsData(req: Request): Promise<CobranzaCommissionsDataResult | CobranzaCommissionsDataError> {
  const permissions = req.permissions;
  const fullAccess = isCobranzaCommissionsFullAccessAllowed(permissions);
  const selfEmployeeId = fullAccess ? null : await resolveSelfCobradorDuenoId(knex, req.auditUser?.username ?? null);

  if (!fullAccess && !selfEmployeeId) {
    return { ok: false, status: 403, message: 'No tienes permiso para ver este reporte.' };
  }

  const { month, year } = resolveMonthYear(req);
  const subsidiary = parseSubsidiaryFilter(req.query.subsidiary);
  let restrictSubsidiaries: Set<string> | null;
  if (fullAccess) {
    restrictSubsidiaries = subsidiaryRestrictionFor(permissions!);
  } else {
    const selfSubsidiarias = await resolveSelfCobradorDuenoSubsidiarias(knex, selfEmployeeId!);
    // Empty only means "no partida yet carries this employee's subsidiaria" (e.g. they're already
    // the resolved cobrador on a brand-new invoice that hasn't got a partida linked yet - see
    // resolveSelfCobradorDuenoId, which doesn't require a partida to exist at all), NOT "they
    // belong to zero subsidiarias" - applySubsidiaryRestriction would otherwise zero out someone
    // who legitimately passed the self-access check above, so this falls back to unrestricted
    // rather than wrongly locking them out.
    restrictSubsidiaries = selfSubsidiarias.size > 0 ? selfSubsidiarias : null;
  }
  const data = await getCobranzaCommissionsReport(knex, month, year, subsidiary, restrictSubsidiaries);

  return { ok: true, data, month, year };
}

/** GET /api/reports/cobranza-comisiones?month=&year=&subsidiary= */
export async function getCobranzaCommissionsRoute(req: Request, res: Response): Promise<void> {
  const result = await loadCobranzaCommissionsData(req);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, data: result.data, month: result.month, year: result.year });
}

const ASIGNACION_TIPO_LABELS: Record<string, string> = {
  dueno: 'Dueño',
  cobrador: 'Cobrador',
  bolsa: 'Bolsa',
  paquete_inicial: 'Paquete Inicial',
};

// Mexico's IVA rate - the invoice's own total (the partida's `importe_pagado`) includes tax, per
// explicit instruction to show the net-of-tax figure instead. Confirmed live only for Mexico-
// subsidiary records (65 USD partida -> 75.4 invoice total, exactly ×1.16); NOT verified for other
// subsidiaries/currencies, which may use a different VAT rate (e.g. Argentina's IVA is 21%, not
// 16%) - applied uniformly here regardless, since no confirmed per-subsidiary rate exists yet.
const IVA_RATE = 0.16;

function importePagadoNeto(importePagado: string | number | null): number | null {
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
  const result = await loadCobranzaCommissionsData(req);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return;
  }
  const { data: groups, month, year } = result;

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
