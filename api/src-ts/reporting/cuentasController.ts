import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getEntityConfig } from './entityRegistry';
import { getCuentasForExport, getCuentasPaged, UNAVAILABLE_COLUMNS } from './cuentasRepository';
import type { CuentaRow } from './cuentasRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';

const PARTIDAS_CONFIG = getEntityConfig('partidas')!;

/** Cuentas is reached from the Partidas report (see the "Ver cuentas" button on ReportPage.tsx)
 * and gated by that same permission - no separate grant to manage for something the user always
 * reaches by clicking through from a report they already have. */
function isCuentasAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has(PARTIDAS_CONFIG.key));
}

function subsidiaryRestrictionFor(permissions: UserPermissions): Set<string> | null {
  return permissions.isAdmin ? null : permissions.allowedSubsidiaries;
}

/** GET /api/reports/cuentas?page=&pageSize=&search=&subsidiary= */
export async function listCuentasRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isCuentasAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { page, pageSize, search, subsidiary } = req.query;
  const result = await getCuentasPaged(knex, { page, pageSize, search, subsidiary }, subsidiaryRestrictionFor(permissions!));
  res.status(200).json({ success: true, ...result, unavailableColumns: UNAVAILABLE_COLUMNS });
}

const EXPORT_COLUMNS: Array<{ key: keyof CuentaRow; header: string }> = [
  { key: 'contrato', header: 'Contrato' },
  { key: 'folio_sistema_anterior', header: 'N° contrato sistema anterior' },
  { key: 'titular_nombre', header: 'Titular contrato' },
  { key: 'fecha_nacimiento_confirmada', header: 'Fecha nacimiento confirmada' },
  { key: 'titular_email', header: 'Correo electrónico' },
  { key: 'titular_telefono', header: 'Teléfono' },
  { key: 'titular2_nombre', header: 'Titular 2' },
  { key: 'titular2_email', header: 'Correo Electrónico (Titular 2)' },
  { key: 'titular2_telefono', header: 'Teléfono celular (Titular 2)' },
  { key: 'numero_anos', header: 'Numero de años' },
  { key: 'adeudo_total', header: 'Adeudo total' },
  { key: 'interes', header: 'Interés' },
  { key: 'costo_anualidad', header: 'Costo de anualidad' },
  { key: 'nombre_hijo', header: 'Nombre Hijo' },
  { key: 'referencia_cie', header: 'Referencia CIE NUEVA' },
  { key: 'referencia_sap', header: 'Referencia SAP' },
  { key: 'zona', header: 'Zona (Franquicia/Asociado)' },
  { key: 'mes_nacimiento', header: 'Mes Nacimiento' },
  { key: 'fp_scu', header: 'FP SCU' },
  { key: 'fp_tcu', header: 'FP TCU' },
  { key: 'fp_dx', header: 'FP DX' },
  { key: 'fp_adn', header: 'FP ADN' },
  { key: 'pago_automatico', header: 'Pago Automático' },
  { key: 'estatus_cliente', header: 'Estatus Cliente' },
  { key: 'estatus_cobranza', header: 'Estatus Cobranza' },
  { key: 'metal', header: 'Metal' },
  { key: 'tel_casa1', header: 'Tel Casa 1' },
  { key: 'tel_casa2', header: 'Tel Casa 2' },
  { key: 'cel_mama', header: 'Cel Mamá' },
  { key: 'cel_papa', header: 'Cel Papá' },
  { key: 'tel_oficina_madre', header: 'Tel Oficina Madre' },
  { key: 'tel_oficina_padre', header: 'Tel Oficina Padre' },
  { key: 'tel_pariente1', header: 'Tel Pariente 1' },
  { key: 'tel_pariente2', header: 'Tel Pariente 2' },
  { key: 'super_promo', header: 'SuperPromo' },
  { key: 'link_pago', header: 'Link Pago' },
  { key: 'token_sat', header: 'TokenSAT' },
  { key: 'pagado_hasta_scu', header: 'Pagado Hasta SCU' },
  { key: 'pagado_hasta_tcu', header: 'Pagado Hasta TCU' },
  { key: 'pagado_hasta_dx', header: 'Pagado Hasta DX' },
  { key: 'pagado_hasta_adn', header: 'Pagado Hasta ADN' },
  { key: 'dueno', header: 'Dueño' },
  { key: 'no_molestar', header: 'No Molestar' },
];

function formatCuentaValue(key: keyof CuentaRow, value: unknown): string {
  if (key === 'pago_automatico' || key === 'no_molestar') {
    return value === null || value === undefined ? '' : value ? 'Sí' : 'No';
  }
  return formatExportValue(key, value);
}

/** GET /api/reports/cuentas/export?search=&subsidiary= - same filtered rows listCuentasRoute
 * would page through, streamed out as one CSV file instead of JSON pages. */
export async function exportCuentasRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isCuentasAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { search, subsidiary } = req.query;
  const rows = await getCuentasForExport(knex, { search, subsidiary }, subsidiaryRestrictionFor(permissions!));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cuentas.csv"');
  res.write('﻿');
  res.write(csvRow(EXPORT_COLUMNS.map((c) => c.header)));
  for (const row of rows) {
    res.write(csvRow(EXPORT_COLUMNS.map((c) => formatCuentaValue(c.key, row[c.key]))));
  }
  res.end();
}
