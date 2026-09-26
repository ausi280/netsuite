import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getContratosReportForExport, getContratosReportPaged, UNAVAILABLE_COLUMNS } from './contratosReportRepository';
import type { ContratoReportRow } from './contratosReportRepository';
import { csvRow, formatExportValue } from './csvExport';
import type { UserPermissions } from './permissionsRepository';
import { isContractsAllowed, subsidiaryRestrictionFor } from './contractReportsController';

/** GET /api/reports/contratos-report?page=&pageSize=&search=&subsidiary= */
export async function listContratosReportRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { page, pageSize, search, subsidiary } = req.query;
  const result = await getContratosReportPaged(knex, { page, pageSize, search, subsidiary }, subsidiaryRestrictionFor(permissions as UserPermissions));
  res.status(200).json({ success: true, ...result, unavailableColumns: UNAVAILABLE_COLUMNS });
}

const EXPORT_COLUMNS: Array<{ key: keyof ContratoReportRow; header: string }> = [
  { key: 'contrato', header: 'N° contrato' },
  { key: 'folio_sistema_anterior', header: 'N° contrato sistema anterior' },
  { key: 'fecha_alta', header: 'Fecha de alta' },
  { key: 'estado_contrato', header: 'Estado contrato' },
  { key: 'titular_contrato', header: 'Titular contrato' },
  { key: 'especimen', header: 'Espécimen' },
  { key: 'titular2', header: 'Titular 2' },
  { key: 'fecha_nacimiento', header: 'Fecha de nacimiento' },
  { key: 'fecha_procesamiento', header: 'Fecha de procesamiento' },
  { key: 'vendedor', header: 'Vendedor' },
  { key: 'cobrador_dueno', header: 'Cobrador dueño' },
  { key: 'scu', header: 'SCU' },
  { key: 'estado_sangre', header: 'ESTADO SANGRE' },
  { key: 'costo_anualidad_sangre', header: 'COSTO ANUALIDAD SANGRE' },
  { key: 'pagado_hasta_sangre', header: 'PAGADO HASTA (SANGRE)' },
  { key: 'tcu', header: 'TCU' },
  { key: 'estado_tejido', header: 'ESTADO TEJIDO' },
  { key: 'costo_anualidad_tejido', header: 'COSTO ANUALIDAD TEJIDO' },
  { key: 'pagado_hasta_tejido', header: 'PAGADO HASTA (TEJIDO)' },
  { key: 'medico', header: 'Médico' },
  { key: 'telefono_titular', header: 'Telefono titular' },
  { key: 'correo_titular', header: 'Correo electronico titular' },
  { key: 'zona', header: 'Zona' },
  { key: 'subsidiaria', header: 'SUBSIDIARIA' },
  { key: 'costo_dx', header: 'Costo DX' },
  { key: 'costo_adn', header: 'Costo ADN' },
  { key: 'costo_placenta', header: 'Costo Placenta' },
  { key: 'mes_nacimiento', header: 'Mes Nacimiento' },
  { key: 'telefono_1', header: 'Teléfono 1' },
  { key: 'telefono_2', header: 'Teléfono 2' },
  { key: 'telefono_3', header: 'Teléfono 3' },
  { key: 'telefono_4', header: 'Teléfono 4' },
  { key: 'telefono_5', header: 'Teléfono 5' },
  { key: 'telefono_6', header: 'Teléfono 6' },
  { key: 'telefono_7', header: 'Teléfono 7' },
  { key: 'telefono_8', header: 'Teléfono 8' },
  { key: 'telefono_9', header: 'Teléfono 9' },
  { key: 'telefono_10', header: 'Teléfono 10' },
  { key: 'correo_titular2', header: 'Correo electronico titular 2' },
  { key: 'zona_franquicia', header: 'Zona - Franquicia' },
  { key: 'tipo', header: 'Tipo' },
  { key: 'razon_social', header: 'RazonSocial' },
  { key: 'rfc_fac', header: 'RFCFac' },
  { key: 'dir_fac', header: 'DirFac' },
  { key: 'col_fac', header: 'ColFac' },
  { key: 'cp_fac', header: 'CPFac' },
  { key: 'pais_fac', header: 'PaisFac' },
  { key: 'estado_fac', header: 'EstadoFac' },
  { key: 'ciudades_fac', header: 'CiudadesFac' },
  { key: 'usocfdi', header: 'usocfdi' },
  { key: 'regimen_fiscal', header: 'RegimenFiscal' },
  { key: 'referencia_cie', header: 'Referencia CIE NUEVA' },
  { key: 'referencia_sap', header: 'Referencia SAP' },
  { key: 'zona_franquicia_asociado', header: 'Zona( FRANQUICIA/ASOCIADO)' },
  { key: 'token', header: 'Token' },
  { key: 'fecha_venta', header: 'Fecha Venta' },
  { key: 'estatus_cliente', header: 'EstatusCliente' },
  { key: 'estatus_cobranza', header: 'EstatusCobranza' },
  { key: 'metal', header: 'METAL' },
  { key: 'pago_automatico', header: 'Pago Automático' },
];

function formatContratoValue(key: keyof ContratoReportRow, value: unknown): string {
  if (key === 'scu' || key === 'tcu') {
    return value ? 'SI' : '';
  }
  if (key === 'pago_automatico') {
    return value === null || value === undefined ? '' : value ? 'Sí' : 'No';
  }
  return formatExportValue(key, value);
}

/** GET /api/reports/contratos-report/export?search=&subsidiary= - same filtered rows
 * listContratosReportRoute would page through, streamed out as one CSV file. */
export async function exportContratosReportRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { search, subsidiary } = req.query;
  const rows = await getContratosReportForExport(knex, { search, subsidiary }, subsidiaryRestrictionFor(permissions as UserPermissions));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-contratos.csv"');
  res.write('﻿');
  res.write(csvRow(EXPORT_COLUMNS.map((c) => c.header)));
  for (const row of rows) {
    res.write(csvRow(EXPORT_COLUMNS.map((c) => formatContratoValue(c.key, row[c.key]))));
  }
  res.end();
}
