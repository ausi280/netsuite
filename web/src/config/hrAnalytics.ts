import type { HrDimension } from '../api/types';

export type ChartKind = 'trend' | 'bar';

export interface HrDimensionConfig {
  key: HrDimension;
  label: string;
  chartType: ChartKind;
  keyLabel: (key: string) => string;
  /** Per-bar color, given the row's key and index. Undefined = every bar uses the single brand hue
   * (ordinal dimensions like age/seniority, where color carries no meaning). */
  keyColor?: (key: string, index: number) => string;
  /** Shows a swatch legend under the chart - only for the small, meaningful fixed palettes
   * (status, gender). Multi-hue "many nominal categories" dimensions (brand/department/country)
   * still get colored bars via keyColor, but skip the legend - with 10+ bars it would just repeat
   * the x-axis labels. */
  showLegend?: boolean;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric' });

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const label = MONTH_FORMATTER.format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Same 9-hue brand-tint cycle Cryoholdco's own Headcount/HHRR reference dashboard uses for "many
// nominal categories, no inherent color meaning" bar charts (brand, department, country) - keeps
// this report visually consistent with that dashboard instead of every bar being flat brand blue.
const CATEGORY_PALETTE = [
  'var(--color-primary)',
  'var(--color-neutral-800)',
  'var(--color-secondary)',
  'var(--color-neutral-300)',
  'var(--color-primary-tint1)',
  'var(--color-secondary-tint1)',
  'var(--color-primary-tint2)',
  'var(--color-secondary-tint2)',
  'var(--color-primary-tint3)',
];

function categoryColor(_key: string, index: number): string {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

// 'status' (active vs. inactive) and 'gender' both use the same blue/dark two-tone the reference
// dashboard uses for its own binary splits (e.g. Female/Male) - NOT red/green. In that dashboard
// red/green are reserved for month-over-month deltas (an increase/decrease), never for a static
// category's own bar color.
const STATUS_LABELS: Record<string, string> = { active: 'Activos', inactive: 'Inactivos' };
const STATUS_COLORS: Record<string, string> = { active: 'var(--color-primary)', inactive: 'var(--color-neutral-800)' };

const GENDER_COLORS: Record<string, string> = { Female: 'var(--color-primary)', Male: 'var(--color-neutral-800)' };
function genderColor(key: string): string {
  return GENDER_COLORS[key] ?? 'var(--color-neutral-300)';
}

export const hrDimensions: HrDimensionConfig[] = [
  {
    key: 'status',
    label: 'Activos / Inactivos',
    chartType: 'bar',
    keyLabel: (key) => STATUS_LABELS[key] ?? key,
    keyColor: (key) => STATUS_COLORS[key] ?? 'var(--color-primary)',
    showLegend: true,
  },
  {
    key: 'brand',
    label: 'Por Marca',
    chartType: 'bar',
    keyLabel: (key) => key,
    keyColor: categoryColor,
  },
  {
    key: 'department',
    label: 'Por Departamento',
    chartType: 'bar',
    keyLabel: (key) => key,
    keyColor: categoryColor,
  },
  {
    key: 'gender',
    label: 'Por Género',
    chartType: 'bar',
    keyLabel: (key) => key,
    keyColor: (key) => genderColor(key),
    showLegend: true,
  },
  {
    key: 'country',
    label: 'Por País',
    chartType: 'bar',
    keyLabel: (key) => key,
    keyColor: categoryColor,
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
