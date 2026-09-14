import type { HrDimension } from '../api/types';

export type ChartKind = 'trend' | 'bar';

export interface HrDimensionConfig {
  key: HrDimension;
  label: string;
  chartType: ChartKind;
  keyLabel: (key: string) => string;
  /** Per-bar color. Undefined = every bar uses the single brand hue (nominal categories, one series). */
  keyColor?: (key: string) => string;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric' });

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = MONTH_FORMATTER.format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// 'status' is the one dimension where color carries real good/bad meaning (active vs. inactive),
// same convention as partidas' status dimension - every other dimension uses the single brand hue.
const STATUS_LABELS: Record<string, string> = { active: 'Activos', inactive: 'Inactivos' };
const STATUS_COLORS: Record<string, string> = { active: 'var(--status-good)', inactive: 'var(--status-critical)' };

export const hrDimensions: HrDimensionConfig[] = [
  {
    key: 'status',
    label: 'Activos / Inactivos',
    chartType: 'bar',
    keyLabel: (key) => STATUS_LABELS[key] ?? key,
    keyColor: (key) => STATUS_COLORS[key] ?? 'var(--color-primary)',
  },
  {
    key: 'brand',
    label: 'Por Marca',
    chartType: 'bar',
    keyLabel: (key) => key,
  },
  {
    key: 'department',
    label: 'Por Departamento',
    chartType: 'bar',
    keyLabel: (key) => key,
  },
  {
    key: 'gender',
    label: 'Por Género',
    chartType: 'bar',
    keyLabel: (key) => key,
  },
  {
    key: 'country',
    label: 'Por País',
    chartType: 'bar',
    keyLabel: (key) => key,
  },
  {
    key: 'age',
    label: 'Por Edad',
    chartType: 'bar',
    keyLabel: (key) => key,
  },
  {
    key: 'seniority',
    label: 'Por Antigüedad',
    chartType: 'bar',
    keyLabel: (key) => key,
  },
  {
    key: 'hiremonth',
    label: 'Contrataciones por Mes',
    chartType: 'trend',
    keyLabel: monthLabel,
  },
];

export function getHrDimensionConfig(key: HrDimension): HrDimensionConfig {
  return hrDimensions.find((d) => d.key === key) ?? hrDimensions[0];
}
