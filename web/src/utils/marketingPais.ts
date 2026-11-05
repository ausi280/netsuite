import type { MarketingPais } from '../api/types';

/** Per-country settings of the Reporte de Marketing - México reads the legacy CRM, Argentina reads
 * NetSuite leads (see api/src-ts/reporting/argentinaMarketingRepository.ts). */
export interface MarketingPaisConfig {
  label: string;
  currency: 'MXN' | 'ARS';
  /** Brands covered, for subtitles. */
  marcas: string;
  /** What "Online" / Digital means for this country's channel field. */
  onlineNote: string;
  /** Source of the prospectos, for subtitles. */
  fuente: string;
}

export const MARKETING_PAISES: Record<MarketingPais, MarketingPaisConfig> = {
  MX: {
    label: 'México',
    currency: 'MXN',
    marcas: 'CRYO-CELL DE MEXICO, BCU y BSCU',
    onlineNote: '"Online" = canal Internet de cada empresa.',
    fuente: 'CRM',
  },
  AR: {
    label: 'Argentina',
    currency: 'ARS',
    marcas: 'Biocells y Cryolab',
    onlineNote:
      '"Online" = canal de ingreso Redes sociales, Instagram, Web o WhatsApp del lead. Contratos cuyo titular nunca fue lead en NetSuite cuentan como offline.',
    fuente: 'NetSuite',
  },
};

/** Argentina's brand filter (?marca=) - NetSuite brand list ids, shared by leads and contracts
 * (see api/src-ts/reporting/argentinaMarketingRepository.ts). '' = all brands. */
export const ARGENTINA_MARCAS: Array<{ id: string; label: string }> = [
  { id: '', label: 'Todas' },
  { id: '4', label: 'Biocells' },
  { id: '9', label: 'Cryolab' },
];

export function parseArgentinaMarca(value: string | null): string {
  return ARGENTINA_MARCAS.some((m) => m.id !== '' && m.id === value) ? (value as string) : '';
}

export function parseMarketingPais(value: string | null): MarketingPais {
  return value === 'AR' ? 'AR' : 'MX';
}
