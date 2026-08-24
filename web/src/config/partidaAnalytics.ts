import type { PartidaDimension } from '../api/types';
import { subsidiaryLabel } from './subsidiaries';
import { PARTIDA_STATUS_LABELS, SERVICE_TYPE_LABELS } from './labels';

export type ChartKind = 'trend' | 'bar';

export interface DimensionConfig {
  key: PartidaDimension;
  label: string;
  chartType: ChartKind;
  /** Resolves a raw breakdown key ("YYYY-MM", a NetSuite list-value id) to a human label. */
  keyLabel: (key: string) => string;
  /** Per-bar color. Undefined = every bar uses the single brand hue (nominal categories, one series). */
  keyColor?: (key: string) => string;
  /** Status glyph shown beside the label - only set for the status dimension, where color carries real good/bad meaning. */
  keyIcon?: (key: string) => string | undefined;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric' });

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = MONTH_FORMATTER.format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Status is a fixed, reserved palette (never themed) - it means good/bad here, so each bar
// wears its real status color rather than the single nominal-category hue used elsewhere.
const STATUS_COLORS: Record<string, string> = {
  '1': 'var(--status-good)',
  '2': 'var(--status-serious)',
  '3': 'var(--status-warning)',
  '4': 'var(--status-critical)',
};

const STATUS_ICONS: Record<string, string> = {
  '1': '✓',
  '2': '◐',
  '3': '●',
  '4': '!',
};

export const partidaDimensions: DimensionConfig[] = [
  {
    key: 'month',
    label: 'Por Mes',
    chartType: 'trend',
    keyLabel: monthLabel,
  },
  {
    key: 'status',
    label: 'Por Estatus',
    chartType: 'bar',
    keyLabel: (key) => PARTIDA_STATUS_LABELS[key] ?? `Estatus ${key}`,
    keyColor: (key) => STATUS_COLORS[key] ?? 'var(--color-primary)',
    keyIcon: (key) => STATUS_ICONS[key],
  },
  {
    key: 'subsidiary',
    label: 'Por Subsidiaria',
    chartType: 'bar',
    keyLabel: (key) => subsidiaryLabel(key),
  },
  {
    key: 'servicetype',
    label: 'Por Tipo de Servicio',
    chartType: 'bar',
    keyLabel: (key) => SERVICE_TYPE_LABELS[key] ?? `Tipo ${key}`,
  },
];

export function getDimensionConfig(key: PartidaDimension): DimensionConfig {
  return partidaDimensions.find((d) => d.key === key) ?? partidaDimensions[0];
}
