import type { MarketingMonthlyInputs, MarketingSalesByMonthRow, QualificationByMonthRow } from '../api/types';

/** One side of the funnel - the real figures (from the CRM) or the metas (captured by hand). A
 * null means "no data" (e.g. inversión never captured for any month of the period), never zero. */
export interface FunnelFigures {
  leadsDigital: number | null;
  leadsOffline: number | null;
  /** "Prospecto" stage - the CRM's Calificados (reached and a real opportunity). */
  prospectos: number | null;
  /** Prospectos split by lead channel. On the meta side only Digital has one (70% of meta leads digital). */
  prospectosDigital: number | null;
  prospectosOffline: number | null;
  ventasDigital: number | null;
  ventasTotal: number | null;
  inversion: number | null;
}

export interface FunnelRatios {
  /** inversión ÷ ventas digitales */
  cac: number | null;
  /** inversión ÷ leads digitales */
  cpl: number | null;
  /** ventas digitales ÷ leads digitales */
  crDigital: number | null;
  /** (ventas totales − ventas digitales) ÷ leads offline */
  crOffline: number | null;
  /** ventas totales ÷ leads totales */
  leadToCliente: number | null;
}

export interface MarketingFunnel {
  real: FunnelFigures;
  meta: FunnelFigures;
  realRatios: FunnelRatios;
  metaRatios: FunnelRatios;
  /** Months of the period with any captured inversión / metas, out of the months it spans. */
  capturedMonths: number;
  totalMonths: number;
}

/** Meta prospectos isn't captured - it's defined as 70% of that month's meta leads digital, rounded
 * to a whole prospecto (the column is an integer). Shared with the capture page, which shows it
 * read-only and saves this same value. */
export const META_PROSPECTOS_RATE = 0.7;

export function metaProspectosFor(metaLeadsDigital: number | null): number | null {
  return metaLeadsDigital === null ? null : Math.round(metaLeadsDigital * META_PROSPECTOS_RATE);
}

const div = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : a / b);
const add = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);

/** Sum of a field across months - null when no month has it captured, so "not captured" never
 * reads as a real zero. */
function sumField(inputs: MarketingMonthlyInputs[], field: keyof Omit<MarketingMonthlyInputs, 'year' | 'month'>): number | null {
  const values = inputs.map((row) => row[field]).filter((v): v is number => v !== null);
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0);
}

function ratios(f: FunnelFigures): FunnelRatios {
  const ventasOffline = f.ventasTotal !== null && f.ventasDigital !== null ? f.ventasTotal - f.ventasDigital : null;
  return {
    cac: div(f.inversion, f.ventasDigital),
    cpl: div(f.inversion, f.leadsDigital),
    crDigital: div(f.ventasDigital, f.leadsDigital),
    crOffline: div(ventasOffline, f.leadsOffline),
    leadToCliente: div(f.ventasTotal, add(f.leadsDigital, f.leadsOffline)),
  };
}

function monthsSpanned(dateFrom: string, dateTo: string): number {
  const from = Number(dateFrom.slice(0, 4)) * 12 + Number(dateFrom.slice(5, 7));
  const to = Number(dateTo.slice(0, 4)) * 12 + Number(dateTo.slice(5, 7));
  return Math.max(0, to - from + 1);
}

/** Builds the México funnel for the report's date range: leads and prospectos from the CRM's
 * Prospecto rows (by capture date), sales from Contrato (by sale date), inversión and every meta
 * from the hand-captured monthly inputs (whole months - a partial month in the range still counts
 * its full monthly meta). Same definitions as the CMO Scorecard: CR Offline = (ventas totales −
 * ventas digitales) ÷ leads offline; CAC/CPL are ratios of period totals, not averages of months. */
export function buildMarketingFunnel(
  qualificationByMonth: QualificationByMonthRow[],
  salesByMonth: MarketingSalesByMonthRow[],
  inputs: MarketingMonthlyInputs[],
  dateFrom: string,
  dateTo: string,
): MarketingFunnel {
  let leadsDigital = 0;
  let leadsOffline = 0;
  let prospectosDigital = 0;
  let prospectosOffline = 0;
  for (const row of qualificationByMonth) {
    if (row.canal === 'online') {
      leadsDigital += row.total;
      prospectosDigital += row.calificados;
    } else {
      leadsOffline += row.total;
      prospectosOffline += row.calificados;
    }
  }
  const ventasDigital = salesByMonth.reduce((s, r) => s + r.online, 0);
  const ventasTotal = salesByMonth.reduce((s, r) => s + r.total, 0);

  const real: FunnelFigures = {
    leadsDigital,
    leadsOffline,
    prospectos: prospectosDigital + prospectosOffline,
    prospectosDigital,
    prospectosOffline,
    ventasDigital,
    ventasTotal,
    inversion: sumField(inputs, 'inversion_digital'),
  };
  // Derived per month from meta leads digital, never the stored meta_prospectos (which may predate
  // the rule) - so a month with leads digital captured always has its prospectos meta. Being a
  // share of the digital leads meta, it is also the Digital funnel's prospectos meta.
  const metaProspectos = sumField(
    inputs.map((row) => ({ ...row, meta_prospectos: metaProspectosFor(row.meta_leads_digital) })),
    'meta_prospectos',
  );
  const meta: FunnelFigures = {
    leadsDigital: sumField(inputs, 'meta_leads_digital'),
    leadsOffline: sumField(inputs, 'meta_leads_offline'),
    prospectos: metaProspectos,
    prospectosDigital: metaProspectos,
    prospectosOffline: null,
    ventasDigital: sumField(inputs, 'meta_ventas_digital'),
    ventasTotal: sumField(inputs, 'meta_ventas_total'),
    inversion: sumField(inputs, 'meta_inversion_digital'),
  };

  return {
    real,
    meta,
    realRatios: ratios(real),
    metaRatios: ratios(meta),
    capturedMonths: inputs.length,
    totalMonths: monthsSpanned(dateFrom, dateTo),
  };
}

export type ComplianceLevel = 'good' | 'warning' | 'critical' | 'none';

/** Cumplimiento vs meta - real ÷ meta, or meta ÷ real when lower is better (CAC, CPL). ≥100% good,
 * 85–99% warning, <85% critical - same thresholds as the CMO Scorecard. */
export function compliance(real: number | null, meta: number | null, lowerIsBetter = false): { ratio: number | null; level: ComplianceLevel } {
  const ratio = lowerIsBetter ? div(meta, real) : div(real, meta);
  if (ratio === null || !Number.isFinite(ratio)) return { ratio: null, level: 'none' };
  return { ratio, level: ratio >= 1 ? 'good' : ratio >= 0.85 ? 'warning' : 'critical' };
}
