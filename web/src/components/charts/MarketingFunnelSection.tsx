import { useState } from 'react';
import { Link } from 'react-router-dom';
import { compliance, type ComplianceLevel, type MarketingFunnel } from '../../utils/marketingFunnel';
import { MARKETING_PAISES } from '../../utils/marketingPais';
import type { MarketingPais } from '../../api/types';
import chartStyles from './charts.module.css';
import styles from './MarketingFunnelSection.module.css';

const countFormatter = new Intl.NumberFormat('es-MX');
const currencyFormatters = {
  MXN: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }),
  ARS: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }),
};

const fmtCount = (v: number | null) => (v === null ? '—' : countFormatter.format(Math.round(v)));
const fmtPct = (v: number | null, digits = 1) => (v === null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`);

const LEVEL_LABEL: Record<ComplianceLevel, string> = {
  good: 'en meta',
  warning: 'cerca',
  critical: 'bajo meta',
  none: 'sin meta',
};

/** Cumplimiento badge - the status color is always paired with the % and a word, never alone. */
function ComplianceBadge({ ratio, level }: { ratio: number | null; level: ComplianceLevel }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${level}`]}`}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {ratio === null ? LEVEL_LABEL.none : `${Math.round(ratio * 100)}% · ${LEVEL_LABEL[level]}`}
    </span>
  );
}

interface Stage {
  key: 'lead' | 'prospecto' | 'cliente';
  label: string;
  /** Short name for the "avanza a ..." band above this stage. */
  shortLabel: string;
  value: number | null;
  meta: number | null;
  fill: string;
  /** Ink for a label drawn ON the bar - must contrast with `fill`. */
  ink: string;
}

// Sized for three funnels side by side (Todos / Digital / Offline) - a narrower viewBox keeps the
// text legible once each funnel only gets a third of the card.
const FUNNEL_WIDTH = 380;
const BAR_HEIGHT = 52;
const GAP = 42;
const CENTER = FUNNEL_WIDTH / 2;
// Below this width the label doesn't fit inside the bar - it's drawn beside it instead.
const INSIDE_LABEL_MIN = 170;

/** Lead → Prospecto → Cliente, each bar's width proportional to its share of leads, the band
 * between two stages labeled with the % that advances to the next one. One sequential hue family (darker = further
 * down the funnel), so stage order reads without a legend. */
function FunnelChart({ stages, ariaLabel }: { stages: Stage[]; ariaLabel: string }) {
  const [hover, setHover] = useState<{
    stage: Stage;
    x: number;
    y: number;
  } | null>(null);
  const lead = stages[0].value ?? 0;
  const widthOf = (v: number | null) => (v === null || lead === 0 ? FUNNEL_WIDTH : Math.max((v / lead) * FUNNEL_WIDTH, 4));
  const height = stages.length * BAR_HEIGHT + (stages.length - 1) * GAP;

  return (
    <div className={styles.funnelWrap} onMouseLeave={() => setHover(null)}>
      <svg className={styles.funnelSvg} viewBox={`0 0 ${FUNNEL_WIDTH} ${height}`} role="img" aria-label={ariaLabel}>
        {stages.slice(0, -1).map((stage, i) => {
          const next = stages[i + 1];
          const y1 = i * (BAR_HEIGHT + GAP) + BAR_HEIGHT;
          const y2 = y1 + GAP;
          const w1 = widthOf(stage.value);
          const w2 = widthOf(next.value);
          const advance = stage.value && next.value !== null ? next.value / stage.value : null;
          return (
            <g key={`gap-${stage.key}`}>
              <polygon
                points={`${CENTER - w1 / 2},${y1 + 2} ${CENTER + w1 / 2},${y1 + 2} ${CENTER + w2 / 2},${y2 - 2} ${CENTER - w2 / 2},${y2 - 2}`}
                fill="var(--color-primary-tint3)"
                opacity={0.6}
              />
              {advance !== null ? (
                <text x={CENTER} y={(y1 + y2) / 2 + 4} textAnchor="middle" className={styles.advanceText}>
                  ▼ {fmtPct(advance)} avanza a {next.shortLabel}
                </text>
              ) : null}
            </g>
          );
        })}
        {stages.map((stage, i) => {
          const y = i * (BAR_HEIGHT + GAP);
          const w = widthOf(stage.value);
          const share = stage.value === null || lead === 0 ? null : stage.value / lead;
          const inside = w >= INSIDE_LABEL_MIN;
          const labelX = inside ? CENTER : CENTER + w / 2 + 10;
          const anchor = inside ? 'middle' : 'start';
          return (
            <g
              key={stage.key}
              className={styles.stage}
              onMouseMove={(event) => {
                const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({
                  stage,
                  x: event.clientX - box.left,
                  y: event.clientY - box.top,
                });
              }}
            >
              {/* Invisible full-width hit target, so thin bars are still easy to hover. */}
              <rect x={0} y={y} width={FUNNEL_WIDTH} height={BAR_HEIGHT} fill="transparent" />
              <rect x={CENTER - w / 2} y={y} width={w} height={BAR_HEIGHT} rx={4} fill={stage.value === null ? 'var(--color-neutral-100)' : stage.fill} />
              <text x={labelX} y={y + 20} textAnchor={anchor} className={styles.stageLabel} fill={inside ? stage.ink : 'var(--color-secondary)'}>
                {i + 1}. {stage.shortLabel.toUpperCase()}
              </text>
              <text x={labelX} y={y + 42} textAnchor={anchor} className={styles.stageValue} fill={inside ? stage.ink : 'var(--color-neutral-900)'}>
                {stage.value === null ? 'sin datos' : fmtCount(stage.value)}
                {/* Only on Cliente - Prospecto's share of leads is already the "avanza a Prospecto" rate above it. */}
                {share !== null && i === stages.length - 1 ? (
                  <tspan className={styles.stageShare} fill={inside ? stage.ink : 'var(--color-secondary)'}>
                    {'  '}
                    {fmtPct(share)} de leads
                  </tspan>
                ) : null}
              </text>
            </g>
          );
        })}
      </svg>
      {hover ? (
        <div className={`${chartStyles.tooltip} ${styles.funnelTooltip}`} style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <p className={chartStyles.tooltipLabel}>{hover.stage.label}</p>
          <p className={styles.tooltipValue}>{fmtCount(hover.stage.value)}</p>
          {hover.stage.value !== null && lead > 0 ? <p className={chartStyles.tooltipMetric}>{fmtPct(hover.stage.value / lead)} de los leads</p> : null}
          <p className={chartStyles.tooltipMetric}>
            Meta {fmtCount(hover.stage.meta)}
            {hover.stage.meta !== null ? ` · ${fmtPct(compliance(hover.stage.value, hover.stage.meta).ratio, 0)} de cumplimiento` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function KpiTile({
  label,
  hint,
  value,
  meta,
  format,
  lowerIsBetter = false,
  budget = false,
}: {
  label: string;
  hint: string;
  value: number | null;
  meta: number | null;
  format: (v: number | null) => string;
  lowerIsBetter?: boolean;
  /** Spend vs budget - shows "% ejercido" with no good/bad judgement. */
  budget?: boolean;
}) {
  const c = compliance(value, meta, lowerIsBetter);
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiHead}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiHint}>{hint}</span>
      </div>
      <div className={styles.kpiValue}>{format(value)}</div>
      <div className={styles.kpiMeta}>
        {budget ? 'Presupuesto' : 'Meta'} {format(meta)}
        {budget ? (
          <span className={`${styles.badge} ${styles.badge_none}`}>
            {meta && value !== null ? `${Math.round((value / meta) * 100)}% ejercido` : 'sin presupuesto'}
          </span>
        ) : (
          <ComplianceBadge ratio={c.ratio} level={c.level} />
        )}
        {lowerIsBetter ? <span className={styles.kpiNote}>menor = mejor</span> : null}
      </div>
    </div>
  );
}

/** CR Digital vs CR Offline - one bar each with a tick at its meta. One shared scale,
 * so the two channels compare directly. */
function ConversionBars({ funnel }: { funnel: MarketingFunnel }) {
  const rows = [
    {
      key: 'digital',
      label: 'Digital',
      sub: 'ventas digitales ÷ leads digitales',
      value: funnel.realRatios.crDigital,
      meta: funnel.metaRatios.crDigital,
      fill: 'var(--color-primary)',
    },
    {
      key: 'offline',
      label: 'Offline',
      sub: '(ventas totales − digitales) ÷ leads offline',
      value: funnel.realRatios.crOffline,
      meta: funnel.metaRatios.crOffline,
      fill: 'var(--color-secondary-tint1)',
    },
  ];
  const max = Math.max(...rows.flatMap((r) => [r.value ?? 0, r.meta ?? 0]), 0.0001) * 1.1;

  return (
    <div className={styles.convRows}>
      {rows.map((row) => {
        const c = compliance(row.value, row.meta);
        return (
          <div key={row.key} className={styles.convRow} title={`CR ${row.label}: ${fmtPct(row.value, 2)} · meta ${fmtPct(row.meta, 2)}`}>
            <div className={styles.convLabel}>
              <span className={styles.convName}>CR {row.label}</span>
              <span className={styles.convSub}>{row.sub}</span>
            </div>
            <div className={styles.convTrack}>
              <div
                className={styles.convFill}
                style={{
                  width: `${((row.value ?? 0) / max) * 100}%`,
                  background: row.fill,
                }}
              />
              {row.meta !== null ? (
                <div className={styles.convTick} style={{ left: `${(row.meta / max) * 100}%` }} title={`Meta ${fmtPct(row.meta, 2)}`} />
              ) : null}
            </div>
            <div className={styles.convValue}>{fmtPct(row.value, 2)}</div>
            <div className={styles.convMeta}>
              meta {fmtPct(row.meta, 2)} <ComplianceBadge ratio={c.ratio} level={c.level} />
            </div>
          </div>
        );
      })}
      <p className={styles.convKey}>
        <span className={styles.convKeyTick} aria-hidden="true" /> Meta del periodo
      </p>
    </div>
  );
}

type FunnelCanal = 'todos' | 'digital' | 'offline';

const CANAL_LABEL: Record<FunnelCanal, string> = {
  todos: 'Todos los canales',
  digital: 'Digital',
  offline: 'Offline',
};
const CANALES: FunnelCanal[] = ['todos', 'digital', 'offline'];

const sub = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
const sum = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);

/** Lead / Prospecto / Cliente stages for one channel (or all). The prospectos meta is 70% of meta
 * leads digital, so it applies to Todos and Digital; Offline has none. Offline ventas = total − digital,
 * same as CR Offline. */
function buildStages(funnel: MarketingFunnel, canal: FunnelCanal): Stage[] {
  const { real, meta } = funnel;
  const figures =
    canal === 'digital'
      ? {
          leads: [real.leadsDigital, meta.leadsDigital],
          prospectos: [real.prospectosDigital, meta.prospectosDigital],
          clientes: [real.ventasDigital, meta.ventasDigital],
        }
      : canal === 'offline'
        ? {
            leads: [real.leadsOffline, meta.leadsOffline],
            prospectos: [real.prospectosOffline, null],
            clientes: [sub(real.ventasTotal, real.ventasDigital), sub(meta.ventasTotal, meta.ventasDigital)],
          }
        : {
            leads: [sum(real.leadsDigital, real.leadsOffline), sum(meta.leadsDigital, meta.leadsOffline)],
            prospectos: [real.prospectos, meta.prospectos],
            clientes: [real.ventasTotal, meta.ventasTotal],
          };

  return [
    {
      key: 'lead',
      label: 'Lead',
      shortLabel: 'Lead',
      value: figures.leads[0],
      meta: figures.leads[1],
      fill: 'var(--color-primary)',
      ink: 'var(--color-white)',
    },
    {
      key: 'prospecto',
      label: 'Prospecto (calificado)',
      shortLabel: 'Prospecto',
      value: figures.prospectos[0],
      meta: figures.prospectos[1],
      fill: 'var(--color-primary-tint1)',
      ink: 'var(--color-neutral-900)',
    },
    {
      key: 'cliente',
      label: 'Cliente',
      shortLabel: 'Cliente',
      value: figures.clientes[0],
      meta: figures.clientes[1],
      fill: 'var(--color-secondary)',
      ink: 'var(--color-white)',
    },
  ];
}

/** One channel's funnel plus its pass rates (the lowest one flagged as the bottleneck). */
function ChannelFunnel({ title, stages }: { title: string; stages: Stage[] }) {
  const passRates = stages.slice(0, -1).map((stage, i) => {
    const next = stages[i + 1];
    return { from: stage.shortLabel, to: next.shortLabel, rate: stage.value && next.value !== null ? next.value / stage.value : null };
  });
  const minRate = Math.min(...passRates.map((p) => p.rate ?? Infinity));
  const first = stages[0].value;
  const last = stages[stages.length - 1].value;
  const leadToCliente = first && last !== null ? last / first : null;

  return (
    <div className={styles.funnelCol}>
      <h3 className={styles.funnelTitle}>{title}</h3>
      <FunnelChart stages={stages} ariaLabel={`Funnel de marketing ${title}: leads, prospectos y clientes`} />
      <div className={styles.rates}>
        {passRates.map((p) => {
          const bottleneck = passRates.length > 1 && p.rate === minRate;
          return (
            <div key={p.from} className={styles.rate}>
              <span className={styles.rateLabel}>
                {p.from} → {p.to}
              </span>
              <span className={`${styles.rateValue} ${bottleneck ? styles.rateBottleneck : ''}`}>▼ {fmtPct(p.rate)}</span>
              {bottleneck ? <span className={styles.bottleneckTag}>Cuello de botella</span> : null}
            </div>
          );
        })}
        <div className={styles.rate}>
          <span className={styles.rateLabel}>Lead → Cliente</span>
          <span className={`${styles.rateValue} ${styles.rateDirect}`}>{fmtPct(leadToCliente, 2)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * One country's (México / Argentina) funnel for the report's date range, modeled on the CMO Scorecard LATAM funnel: Lead →
 * Prospecto → Cliente shown three times side by side (all channels, Digital, Offline) for direct comparison, with pass rates, CAC/CPL/inversión/ventas KPIs against their
 * metas, and CR Digital vs Offline. Real counts come from the CRM; inversión digital and every
 * meta are captured monthly on the "Capturar inversión y metas" page - see
 * utils/marketingFunnel.ts for every definition.
 */
export function MarketingFunnelSection({
  funnel,
  pais,
  canEditInputs,
  captureLink,
  scopeNote,
}: {
  funnel: MarketingFunnel;
  pais: MarketingPais;
  /** Replaces the missing-inputs notice - e.g. a single brand selected, whose funnel has no
   * inversión/metas of its own (they're captured per country). */
  scopeNote?: string;
  canEditInputs: boolean;
  captureLink: string;
}) {
  const { real, meta, realRatios, metaRatios } = funnel;
  const config = MARKETING_PAISES[pais];
  const fmtMoney = (v: number | null) => (v === null ? '—' : currencyFormatters[config.currency].format(v));
  const missingInputs = funnel.capturedMonths < funnel.totalMonths;

  return (
    <div className={chartStyles.chartCard}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Funnel de Marketing · {config.label}</h2>
          <p className={styles.subtitle}>
            Del lead a la venta en el periodo seleccionado, por canal - ancho de cada barra proporcional a los leads de su canal. Leads y prospectos
            (calificados) por fecha de captura, clientes por fecha de venta.
          </p>
        </div>
        {canEditInputs ? (
          <Link to={captureLink} className={styles.captureLink}>
            Capturar inversión y metas
          </Link>
        ) : null}
      </div>

      {scopeNote ? (
        <p className={styles.notice}>{scopeNote}</p>
      ) : missingInputs ? (
        <p className={styles.notice}>
          Inversión y metas capturadas en {funnel.capturedMonths} de {funnel.totalMonths} meses del periodo - CAC, CPL y cumplimientos solo cuentan los meses
          capturados.
        </p>
      ) : null}

      <div className={styles.funnels}>
        {CANALES.map((canal) => (
          <ChannelFunnel key={canal} title={CANAL_LABEL[canal]} stages={buildStages(funnel, canal)} />
        ))}
      </div>

      <div className={styles.kpis}>
        <KpiTile label="CAC" hint="inversión ÷ ventas digitales" value={realRatios.cac} meta={metaRatios.cac} format={fmtMoney} lowerIsBetter />
        <KpiTile label="CPL" hint="inversión ÷ leads digitales" value={realRatios.cpl} meta={metaRatios.cpl} format={fmtMoney} lowerIsBetter />
        <KpiTile label="Inversión digital" hint={`${config.currency} del periodo`} value={real.inversion} meta={meta.inversion} format={fmtMoney} budget />
        <KpiTile label="Ventas totales" hint="unidades del periodo" value={real.ventasTotal} meta={meta.ventasTotal} format={fmtCount} />
        <KpiTile
          label="Conversión Lead → Cliente"
          hint="todos los canales"
          value={realRatios.leadToCliente}
          meta={metaRatios.leadToCliente}
          format={(v) => fmtPct(v, 2)}
        />
      </div>

      <h3 className={styles.sectionTitle}>Conversión · Digital vs Offline</h3>
      <ConversionBars funnel={funnel} />
    </div>
  );
}
