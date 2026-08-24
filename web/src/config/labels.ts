// Real NetSuite list labels, all resolved via BUILTIN.DF against the live account (not guessed).
// Shared across the partidas graphs, the contract dossier, and the commissions report, since
// partidas/services/contracts reuse the same underlying NetSuite lists for these fields.

export const PARTIDA_STATUS_LABELS: Record<string, string> = {
  '1': 'Pagado',
  '2': 'Parcialmente pagado',
  '3': 'Pendiente',
  '4': 'Vencido',
};

// custrecord_cryo_servtipo (partidas) and custrecord_cryo_tipodeserv (services) both reference
// the same NetSuite list.
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  '1': 'Sangre',
  '2': 'Tejido',
  '3': 'ADN',
  '4': 'Diente',
  '7': 'Fibroblastos',
  '14': 'Pulpa Dental',
  '15': 'Placenta',
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  '1': 'Activo',
  '7': 'Cancelado',
  '8': 'Suspendido',
  '11': 'Disposición',
  '13': 'Retirado del Tanque',
};

export function contractStatusLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return CONTRACT_STATUS_LABELS[code] ?? `Estatus ${code}`;
}

export function partidaStatusLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return PARTIDA_STATUS_LABELS[code] ?? `Estatus ${code}`;
}

export function serviceTypeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return SERVICE_TYPE_LABELS[code] ?? `Tipo ${code}`;
}
