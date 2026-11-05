import PDFDocument from 'pdfkit';
import { ACTIVITY_TYPES, VISIT_TYPE, type WorkPlan, type WorkPlanActivity } from './salesWorkPlanRepository';

// Same layout and palette as the plan.html page the gerencia used before this existed, so the PDF a
// gerente receives looks the same as always: a month calendar on page 1, then every activity's
// detail by day (shrunk until it fits a single page).

const BRAND = '#0F766E';
const BRAND_SOFT = '#E6F4F2';
const INK = '#1E1E1E';
const MUTED = '#646464';
const RULE = '#D2D2D2';
const HEAD_BG = '#F1F5F9';

export const ACTIVITY_COLORS: Record<string, string> = {
  'Visita médica': '#2563EB',
  Evento: '#D97706',
  'Curso psicoprofiláctico': '#7C3AED',
  'Plática doulas': '#DB2777',
  'Capacitación enfermería': '#059669',
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEK_HEADER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const W = 792; // letter, landscape
const H = 612;
const M = 28;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthLabel(year: number, month: number): string {
  return `${capitalize(MONTHS[month - 1])} ${year}`;
}

function h12(hora: string | null): string {
  if (!hora) return '';
  const [hRaw, m] = hora.split(':').map(Number);
  return `${hRaw % 12 || 12}:${String(m).padStart(2, '0')}${hRaw >= 12 ? 'pm' : 'am'}`;
}

function money(n: number): string {
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
}

function colorFor(tipo: string): string {
  return ACTIVITY_COLORS[tipo] ?? ACTIVITY_COLORS[VISIT_TYPE];
}

function title(a: WorkPlanActivity): string {
  return a.tipo === VISIT_TYPE ? a.medico_nombre || a.hospital_nombre || 'Visita' : a.evento_nombre || a.tipo;
}

function dateOf(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`);
}

/** Trims `text` with an ellipsis until it fits `width` at the current font. */
function fit(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let s = text;
  while (s.length > 1 && doc.widthOfString(`${s}…`) > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Objetivos as printed: the gerencia's free-text ones, then the venta goals from the niveles. */
export function planObjetivos(plan: WorkPlan): string[] {
  const venta = [
    plan.venta.core !== null ? `Venta CORE: ${money(plan.venta.core)}` : null,
    plan.venta.genetica !== null ? `Venta Genética: ${money(plan.venta.genetica)}` : null,
  ].filter((s): s is string => s !== null);
  return [...plan.objetivos, ...(venta.length > 0 ? [venta.join('  |  ')] : [])];
}

function headerBar(doc: PDFKit.PDFDocument, text: string, right: string | null, height: number): void {
  doc.rect(0, 0, W, height).fill(BRAND);
  doc.font('Helvetica-Bold').fontSize(height > 40 ? 15 : 12).fillColor('#FFFFFF');
  doc.text(text, M, height / 2 - 7, { width: W - 2 * M - 120, lineBreak: false });
  if (right) doc.fontSize(12).text(right, W - M - 150, height / 2 - 6, { width: 150, align: 'right', lineBreak: false });
}

function drawCalendarPage(doc: PDFKit.PDFDocument, plan: WorkPlan, planTitle: string): void {
  const { year, month, activities } = plan;
  headerBar(doc, planTitle, monthLabel(year, month), 45);

  // Objetivos, wrapping onto extra lines as needed.
  let y = 58;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('Objetivos del mes:', M, y, { lineBreak: false });
  const objX = M + 82;
  let x = objX;
  doc.font('Helvetica');
  const objetivos = planObjetivos(plan);
  if (objetivos.length === 0) doc.fillColor(MUTED).text('Sin objetivos asignados.', x, y, { lineBreak: false });
  objetivos.forEach((o, i) => {
    const t = `${i + 1}. ${o}`;
    const w = doc.widthOfString(t) + 16;
    if (x > objX && x + w > W - M) {
      x = objX;
      y += 12;
    }
    doc.fillColor(INK).text(fit(doc, t, W - M - x), x, y, { lineBreak: false });
    x += w;
  });

  // Totals per type.
  y += 16;
  x = M;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
  const total = `Total: ${activities.length}`;
  doc.text(total, x, y, { lineBreak: false });
  x += doc.widthOfString(total) + 16;
  doc.font('Helvetica');
  for (const tipo of ACTIVITY_TYPES) {
    const label = `${tipo}: ${activities.filter((a) => a.tipo === tipo).length}`;
    doc.circle(x + 3, y + 3, 3).fill(colorFor(tipo));
    doc.fillColor(INK).text(label, x + 9, y, { lineBreak: false });
    x += doc.widthOfString(label) + 24;
  }

  // Month grid, Monday first.
  const top = y + 14;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const cw = (W - 2 * M) / 7;
  const hh = 14;
  const ch = (H - M - top - hh) / rows;
  doc.rect(M, top, W - 2 * M, hh).fill(HEAD_BG);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#505050');
  WEEK_HEADER.forEach((d, i) => doc.text(d, M + i * cw, top + 4, { width: cw, align: 'center', lineBreak: false }));

  const byDay = new Map<string, WorkPlanActivity[]>();
  for (const a of activities) byDay.set(a.fecha, [...(byDay.get(a.fecha) ?? []), a]);

  const lineH = 7.8;
  const maxLines = Math.floor((ch - 13) / lineH);
  doc.lineWidth(0.5).strokeColor(RULE);
  for (let c = 0; c < rows * 7; c += 1) {
    const cx = M + (c % 7) * cw;
    const cy = top + hh + Math.floor(c / 7) * ch;
    doc.rect(cx, cy, cw, ch).stroke();
    const day = c - offset + 1;
    if (day < 1 || day > daysInMonth) continue;

    const fecha = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const list = byDay.get(fecha) ?? [];
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#3C3C3C').text(String(day), cx + 4, cy + 4, { lineBreak: false });
    if (list.length > 0) {
      doc.fontSize(6.5).fillColor(BRAND).text(`${list.length} act.`, cx + cw - 44, cy + 4.5, { width: 40, align: 'right', lineBreak: false });
    }
    doc.font('Helvetica').fontSize(6.3);
    const shown = list.length > maxLines ? maxLines - 1 : maxLines;
    list.slice(0, shown).forEach((a, k) => {
      const ty = cy + 14 + k * lineH;
      doc.circle(cx + 6, ty + 2.2, 2.2).fill(colorFor(a.tipo));
      doc.fillColor(INK).text(fit(doc, `${h12(a.hora)} ${title(a)}`.trim(), cw - 15), cx + 11, ty, { lineBreak: false });
    });
    if (list.length > shown) {
      doc.fillColor('#787878').text(`+${list.length - shown} más (ver detalle)`, cx + 11, cy + 14 + shown * lineH, { lineBreak: false });
    }
  }
}

interface DetailBlock {
  activity: WorkPlanActivity;
  line1: string;
  line2: string;
  h1: number;
  h2: number;
}

function drawDetailPages(doc: PDFKit.PDFDocument, plan: WorkPlan): void {
  const cols = 4;
  const gap = 14;
  const colW = (W - 2 * M - gap * (cols - 1)) / cols;
  const y0 = 50;
  const yMax = H - 22;
  const fechas = [...new Set(plan.activities.map((a) => a.fecha))];

  // Lays every day out at scale k; returns where each piece goes and how many pages that takes.
  function layout(k: number) {
    const fDay = 7.6 * k;
    const f1 = 6.8 * k;
    const f2 = 6.1 * k;
    const hdr = fDay * 1.55;
    const textW = colW - 8;
    const ops: Array<{ page: number; col: number; y: number; day?: string; block?: DetailBlock }> = [];
    let page = 0;
    let col = 0;
    let y = y0;
    const room = (need: number) => {
      if (y + need <= yMax) return;
      col += 1;
      y = y0;
      if (col >= cols) {
        page += 1;
        col = 0;
      }
    };
    for (const fecha of fechas) {
      const blocks: DetailBlock[] = plan.activities
        .filter((a) => a.fecha === fecha)
        .map((a) => {
          const v = a.tipo === VISIT_TYPE;
          const line1 = `${a.hora ? `${h12(a.hora)}  ` : ''}${v ? '' : `${a.tipo}: `}${title(a)}`;
          const line2 = [
            v ? a.hospital_nombre : a.sede,
            v ? a.especialidad : '',
            v ? a.motivo : '',
            !v && a.asistentes ? `${a.asistentes} asist.` : '',
            a.requerimientos.length > 0 ? `Req: ${a.requerimientos.join(', ')}` : '',
            a.notas,
          ]
            .filter(Boolean)
            .join(' · ');
          doc.font('Helvetica-Bold').fontSize(f1);
          const h1 = doc.heightOfString(line1, { width: textW, lineGap: 0 });
          doc.font('Helvetica').fontSize(f2);
          const h2 = line2 ? doc.heightOfString(line2, { width: textW, lineGap: 0 }) : 0;
          return { activity: a, line1, line2, h1, h2 };
        });
      const d = dateOf(fecha);
      room(hdr + 3 + (blocks[0] ? blocks[0].h1 + blocks[0].h2 : 0));
      ops.push({ page, col, y, day: `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}` });
      y += hdr + 3;
      for (const block of blocks) {
        const need = block.h1 + block.h2 + 3 * k;
        room(need);
        ops.push({ page, col, y, block });
        y += need;
      }
      y += 3.5 * k;
    }
    return { ops, pages: page + 1, fDay, f1, f2, hdr, textW };
  }

  let L = layout(1);
  for (const k of [0.92, 0.85, 0.78, 0.72, 0.66, 0.6]) {
    if (L.pages === 1) break;
    L = layout(k);
  }

  let current = -1;
  for (const op of L.ops) {
    while (current < op.page) {
      doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 0 });
      headerBar(doc, `Detalle de actividades · ${plan.vendedor_nombre} · ${monthLabel(plan.year, plan.month)}`, null, 34);
      current += 1;
    }
    const cx = M + op.col * (colW + gap);
    if (op.day) {
      doc.rect(cx, op.y, colW, L.hdr).fill(BRAND_SOFT);
      doc.font('Helvetica-Bold').fontSize(L.fDay).fillColor(BRAND).text(op.day, cx + 4, op.y + (L.hdr - L.fDay) / 2 + 0.5, { lineBreak: false });
    } else if (op.block) {
      const { activity, line1, line2, h1 } = op.block;
      doc.circle(cx + 3.5, op.y + L.f1 * 0.45, 2).fill(colorFor(activity.tipo));
      doc.font('Helvetica-Bold').fontSize(L.f1).fillColor(INK).text(line1, cx + 8, op.y, { width: L.textW, lineGap: 0 });
      if (line2) doc.font('Helvetica').fontSize(L.f2).fillColor(MUTED).text(line2, cx + 8, op.y + h1, { width: L.textW, lineGap: 0 });
    }
  }
}

export function workPlanTitle(plan: WorkPlan): string {
  return `Plan de trabajo ${plan.vendedor_nombre}${plan.puesto ? ` - ${plan.puesto}` : ''}`;
}

export function workPlanFilename(plan: WorkPlan): string {
  return `${workPlanTitle(plan)} - ${monthLabel(plan.year, plan.month)}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]/g, '') + '.pdf';
}

export function generateWorkPlanPdf(plan: WorkPlan): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawCalendarPage(doc, plan, workPlanTitle(plan));
    if (plan.activities.length > 0) drawDetailPages(doc, plan);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(6.5).fillColor('#8C8C8C').text(`Página ${i + 1} de ${range.count}`, W - M - 100, H - 14, { width: 100, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
