import { csvRow, CURRENCY_LABELS, SUBSIDIARY_LABELS } from './csvExport';
import type { VendedorCommissionGroup } from './commissionsRepository';

const COLUMNS = [
  'Vendedor',
  'Nivel',
  'Tipo',
  'Nombre',
  'Titular / Servicio',
  'Fecha',
  'Subsidiaria',
  'Moneda',
  'Total Servicios / Monto',
  'Bono Placenta',
  'Comisión Nivel',
  'Bono Anualidad',
  'Docs Completos',
  'Total Comisión',
];

function money(value: number): string {
  return value.toFixed(2);
}

function subsidiaryLabel(id: string | null): string {
  if (!id) return '';
  return SUBSIDIARY_LABELS[id] ?? id;
}

function currencyLabel(id: string | null): string {
  if (!id) return '';
  return CURRENCY_LABELS[id] ?? id;
}

/**
 * Flattens the commissions grid into one CSV row per contract and per otros-contrato (Excel opens
 * CSV natively, so no separate .xlsx generation - see csvExport.ts's UTF-8 BOM convention for why
 * this renders accents/ñ correctly there). Same rows the on-screen VendedorGroupCard/
 * ContractCommissionCard/OtrosContratoCommissionCard breakdown shows, just flattened for a
 * spreadsheet instead of grouped cards.
 */
export function buildCommissionsCsv(groups: VendedorCommissionGroup[]): string {
  // UTF-8 BOM, same as exportEntityRows in controller.ts.
  let csv = '﻿' + csvRow(COLUMNS);

  for (const group of groups) {
    const vendedor = group.vendedor_nombre ?? group.vendedor_id;

    for (const contract of group.contracts) {
      csv += csvRow([
        vendedor,
        group.nivel_contratos ?? '',
        'Contrato',
        contract.name ?? '',
        contract.titular_nombre ?? '',
        contract.fecha_inicio ?? '',
        subsidiaryLabel(contract.subsidiaria_id),
        currencyLabel(contract.moneda),
        money(contract.total_servicios),
        money(contract.placenta_bonus),
        money(contract.tier_commission),
        money(contract.anualidad_bonus_total),
        contract.docs_completos ? 'Sí' : 'No',
        money(contract.total_commission),
      ]);
    }

    for (const otros of group.otros_contratos) {
      csv += csvRow([
        vendedor,
        group.nivel_otros_contratos ?? '',
        'Otros Contrato',
        otros.name ?? '',
        otros.servicio_nombre ?? '',
        otros.fecha ?? '',
        '',
        currencyLabel(otros.moneda),
        money(otros.monto),
        '',
        money(otros.tier_commission),
        '',
        '',
        money(otros.tier_commission),
      ]);
    }
  }

  return csv;
}
