import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { VendedorCommissionGroup } from './commissionsRepository';
import type { CommissionLevelTierRow } from './commissionTiersRepository';
import { CURRENCY_LABELS } from './csvExport';

const ASSETS_DIR = path.join(__dirname, '../../assets');
const LOGO_PATH = path.join(ASSETS_DIR, 'cryoholdco-logo.png');
// Real aspect ratio of cryoholdco-logo.png (1440x305) - used to scale it without distortion
// regardless of what size it's re-exported at later (same convention as the legacy
// sampleReportService.js's HEADER_IMAGE_ASPECT).
const LOGO_ASPECT = 1440 / 305;

// Matches the app's own brand tokens (web/src/styles/tokens.css) rather than the legacy report's
// palette, since this is a NEW "Estado de cuenta" document for the current tiered-commission
// model, styled consistently with the rest of this app.
const BRAND = {
  ink: '#212529',
  accent: '#3F8CFF',
  muted: '#6D7387',
  rule: '#CCCCCC',
  rowAlt: '#F2F2F2',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const PAGE_MARGIN = 50;
const FOOTER_HEIGHT = 40;

/** 'Oculto' (not blank/'0.00') for a redacted amount (see redactCommissionAmounts) - explicit about
 * WHY the cell is empty, so it never reads as "this contract pays nothing". */
function money(value: number | null): string {
  return value === null ? 'Oculto' : value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sums a list of possibly-redacted amounts, returning null (not 0) the instant any item is null -
 * `null + 5` evaluates to 5 in JS (null coerces to 0), so a naive reduce would silently turn a
 * fully-redacted group's total into a real-looking "0.00" instead of "Oculto". */
function sumOrNull(values: Array<number | null>): number | null {
  return values.some((v) => v === null) ? null : (values as number[]).reduce((sum, v) => sum + v, 0);
}

function currencyLabel(id: string | null): string {
  if (!id) return '';
  return CURRENCY_LABELS[id] ?? id;
}

/** Returns the rendered height so callers know where content can safely start below it. */
function drawLogo(doc: PDFKit.PDFDocument): number {
  const width = 140;
  const height = width / LOGO_ASPECT;
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, doc.page.width - PAGE_MARGIN - width, PAGE_MARGIN - 10, { width });
  }
  return height;
}

function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number, pageCount: number): void {
  const width = doc.page.width;
  const bottom = doc.page.height;

  doc.moveTo(PAGE_MARGIN, bottom - FOOTER_HEIGHT).lineTo(width - PAGE_MARGIN, bottom - FOOTER_HEIGHT).lineWidth(0.5).strokeColor(BRAND.rule).stroke();
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(BRAND.muted)
    .text('Cryoholdco - Estado de cuenta de comisiones', PAGE_MARGIN, bottom - FOOTER_HEIGHT + 10, { width: width - PAGE_MARGIN * 2 - 100 })
    .text(`Página ${pageNumber} de ${pageCount}`, width - PAGE_MARGIN - 100, bottom - FOOTER_HEIGHT + 10, { width: 100, align: 'right' });
}

/** Two-column "label: value" block, matching the reference "Estado de cuenta" layout's summary
 * stats area - left column fields, then right column fields, sharing one row cursor. */
function drawStatsBlock(
  doc: PDFKit.PDFDocument,
  y: number,
  leftFields: Array<[string, string]>,
  rightFields: Array<[string, string]>,
): number {
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidth = contentWidth / 2;
  const rowHeight = 18;
  const rows = Math.max(leftFields.length, rightFields.length);

  for (let i = 0; i < rows; i += 1) {
    const rowY = y + i * rowHeight;
    if (leftFields[i]) {
      const [label, value] = leftFields[i];
      doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted).text(`${label}:`, PAGE_MARGIN, rowY, { width: colWidth * 0.55 });
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(BRAND.ink)
        .text(value, PAGE_MARGIN + colWidth * 0.55, rowY, { width: colWidth * 0.45, align: 'right' });
    }
    if (rightFields[i]) {
      const [label, value] = rightFields[i];
      const rightColX = PAGE_MARGIN + colWidth + 20;
      const rightColWidth = colWidth - 20;
      doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted).text(`${label}:`, rightColX, rowY, { width: rightColWidth * 0.55 });
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(BRAND.ink)
        .text(value, rightColX + rightColWidth * 0.55, rowY, { width: rightColWidth * 0.45, align: 'right' });
    }
  }

  return y + rows * rowHeight;
}

interface TableColumn {
  label: string;
  width: number;
  align?: 'left' | 'right';
}

/** Draws a table header row (only once, at the top of each new page a table's rows spill onto).
 * `startX` defaults to the page's left margin - overridden for a narrower table placed in one
 * column of a multi-column layout (see the Niveles anexo). */
function drawTableHeader(doc: PDFKit.PDFDocument, y: number, columns: TableColumn[], startX: number = PAGE_MARGIN): number {
  const rowHeight = 20;
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  let x = startX;
  doc.rect(startX, y, totalWidth, rowHeight).fill(BRAND.ink);
  for (const col of columns) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#FFFFFF')
      .text(col.label, x + 6, y + 6, { width: col.width - 12, align: col.align ?? 'left' });
    x += col.width;
  }
  return y + rowHeight;
}

function drawTableRow(doc: PDFKit.PDFDocument, y: number, columns: TableColumn[], values: string[], striped: boolean, startX: number = PAGE_MARGIN): number {
  const rowHeight = 18;
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  if (striped) {
    doc.rect(startX, y, totalWidth, rowHeight).fill(BRAND.rowAlt);
  }
  let x = startX;
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(BRAND.ink)
      .text(values[i] ?? '', x + 6, y + 5, { width: col.width - 12, align: col.align ?? 'left' });
    x += col.width;
  }
  return y + rowHeight;
}

function drawTableTotalRow(doc: PDFKit.PDFDocument, y: number, columns: TableColumn[], values: string[]): number {
  const rowHeight = 20;
  doc.moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).lineWidth(0.75).strokeColor(BRAND.ink).stroke();
  let x = PAGE_MARGIN;
  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(BRAND.ink)
      .text(values[i] ?? '', x + 6, y + 5, { width: col.width - 12, align: col.align ?? 'left' });
    x += col.width;
  }
  return y + rowHeight;
}

const CONTRACTS_COLUMNS: TableColumn[] = [
  { label: 'FECHA', width: 60 },
  { label: 'CONTRATO', width: 110 },
  { label: 'TOTAL SERVICIOS', width: 70, align: 'right' },
  { label: 'COMISIÓN NIVEL', width: 70, align: 'right' },
  { label: 'BONO 3%', width: 65, align: 'right' },
  { label: 'BONO ANUALIDAD', width: 65, align: 'right' },
  { label: 'TOTAL', width: 72, align: 'right' },
];

const OTROS_COLUMNS: TableColumn[] = [
  { label: 'FECHA', width: 70 },
  { label: 'NOMBRE', width: 120 },
  { label: 'SERVICIO', width: 140, align: 'left' },
  { label: 'MONTO', width: 90, align: 'right' },
  { label: 'COMISIÓN NIVEL', width: 92, align: 'right' },
];

/**
 * Renders one "Estado de cuenta de Comisiones" page per vendedor - styled after the legacy
 * Estado de Cuenta report (logo top-right, title, Vendedor/Periodo, a two-column summary stats
 * block, a flat total, then a line-item table with a totals row), adapted to this app's own
 * tiered-commission model (Contratos/Otros Contratos are two independent breakdowns, each with
 * its own nivel/tier) instead of the legacy report's fixed Extras/Visitas/Gasolina categories.
 * Returns a Promise<Buffer> - pdfkit streams, so the buffer only resolves once doc.end() fires
 * the 'end' event with every chunk collected.
 *
 * `tiers` is printed as a final "Anexo - Niveles de Comisión" page - one small table per nivel
 * (not one big combined table), laid out two per row, since commission_level_tiers has no
 * Contratos/Otros Contratos split (a nivel name like "A" resolves against the same rows for both).
 * The caller (contractReportsController.ts) is responsible for
 * scoping this list down to only the niveles relevant to a self-vendedor's own
 * nivel_contratos/nivel_otros_contratos before calling this - a full-access caller passes every
 * tier instead, per explicit instruction ("a vendedor can only see what is assigned to him, for a
 * user that can see everyone I want to see all the related niveles").
 */
export async function generateCommissionsPdf(
  groups: VendedorCommissionGroup[],
  month: number,
  year: number,
  tiers: CommissionLevelTierRow[],
): Promise<Buffer> {
  // margin: 0, not PAGE_MARGIN - every position below is placed by hand using PAGE_MARGIN
  // offsets; leaving pdfkit's own margin set would make it auto-insert a page break as soon as
  // anything (including the footer, drawn last, after the page count is known) is placed inside
  // that margin band, which is exactly where the footer lives.
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const periodo = `${MONTH_NAMES[month - 1] ?? month} ${year}`.toUpperCase();
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const pageBottom = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;

  groups.forEach((group, index) => {
    if (index > 0) doc.addPage();

    const logoHeight = drawLogo(doc);
    let y = PAGE_MARGIN + Math.max(logoHeight, 0);

    doc.font('Helvetica-Bold').fontSize(18).fillColor(BRAND.ink).text('Estado de cuenta de Comisiones', PAGE_MARGIN, PAGE_MARGIN, { width: contentWidth - 160 });
    y = Math.max(y, doc.y + 8);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(`Vendedor: ${group.vendedor_nombre ?? group.vendedor_id}`, PAGE_MARGIN, y);
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted).text(`Periodo: ${periodo}`, PAGE_MARGIN, y);
    y = doc.y + 14;

    doc.moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).lineWidth(0.75).strokeColor(BRAND.rule).stroke();
    y += 18;

    const contractsBonusTotal = sumOrNull(group.contracts.flatMap((c) => [c.placenta_adn_bonus, c.anualidad_bonus_total]));
    y = drawStatsBlock(
      doc,
      y,
      [
        ['No. de Contratos', String(group.contracts_count)],
        ['Nivel Contratos', group.nivel_contratos ?? 'Sin asignar'],
        ['Comisión Contratos', money(group.contracts_commission)],
        ['Bonos (Placenta/ADN + Anualidad)', money(contractsBonusTotal)],
      ],
      [
        ['No. de Otros Contratos', String(group.otros_contratos_count)],
        ['Nivel Otros Contratos', group.nivel_otros_contratos ?? 'Sin asignar'],
        ['Comisión Otros Contratos', money(group.otros_contratos_commission)],
      ],
    );
    y += 10;

    doc.moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).lineWidth(0.75).strokeColor(BRAND.rule).stroke();
    y += 12;

    doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND.accent).text('Total Comisión:', PAGE_MARGIN, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(BRAND.accent)
      .text(money(group.total_commission), PAGE_MARGIN, y, { width: contentWidth, align: 'right' });
    y += 28;

    function ensureSpace(needed: number): void {
      if (y + needed > pageBottom) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
    }

    if (group.contracts.length > 0) {
      ensureSpace(40);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink).text('Desglose de Contratos', PAGE_MARGIN, y);
      y += 18;
      y = drawTableHeader(doc, y, CONTRACTS_COLUMNS);

      group.contracts.forEach((contract, rowIndex) => {
        ensureSpace(18);
        if (y === PAGE_MARGIN) y = drawTableHeader(doc, y, CONTRACTS_COLUMNS);
        y = drawTableRow(
          doc,
          y,
          CONTRACTS_COLUMNS,
          [
            contract.fecha_inicio ?? '',
            contract.name ?? '',
            money(contract.total_servicios),
            money(contract.tier_commission),
            money(contract.placenta_adn_bonus),
            money(contract.anualidad_bonus_total),
            money(contract.total_commission),
          ],
          rowIndex % 2 === 1,
        );
      });

      ensureSpace(20);
      y = drawTableTotalRow(doc, y, CONTRACTS_COLUMNS, [
        '',
        'Total',
        money(sumOrNull(group.contracts.map((c) => c.total_servicios))),
        money(sumOrNull(group.contracts.map((c) => c.tier_commission))),
        money(sumOrNull(group.contracts.map((c) => c.placenta_adn_bonus))),
        money(sumOrNull(group.contracts.map((c) => c.anualidad_bonus_total))),
        money(group.contracts_commission),
      ]);
      y += 24;
    }

    if (group.otros_contratos.length > 0) {
      ensureSpace(40);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink).text('Desglose de Otros Contratos', PAGE_MARGIN, y);
      y += 18;
      y = drawTableHeader(doc, y, OTROS_COLUMNS);

      group.otros_contratos.forEach((otros, rowIndex) => {
        ensureSpace(18);
        if (y === PAGE_MARGIN) y = drawTableHeader(doc, y, OTROS_COLUMNS);
        y = drawTableRow(
          doc,
          y,
          OTROS_COLUMNS,
          [
            otros.fecha ?? '',
            otros.name ?? '',
            `${otros.servicio_nombre ?? ''}${otros.moneda ? ` (${currencyLabel(otros.moneda)})` : ''}`,
            money(otros.monto),
            money(otros.tier_commission),
          ],
          rowIndex % 2 === 1,
        );
      });

      ensureSpace(20);
      drawTableTotalRow(doc, y, OTROS_COLUMNS, [
        '',
        'Total',
        '',
        money(sumOrNull(group.otros_contratos.map((o) => o.monto))),
        money(group.otros_contratos_commission),
      ]);
    }
  });

  if (tiers.length > 0) {
    doc.addPage();
    let y = PAGE_MARGIN + drawLogo(doc);

    doc.font('Helvetica-Bold').fontSize(18).fillColor(BRAND.ink).text('Anexo - Niveles de Comisión', PAGE_MARGIN, PAGE_MARGIN, { width: contentWidth - 160 });
    y = Math.max(y, doc.y + 8);
    doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted).text(`Periodo: ${periodo}`, PAGE_MARGIN, y);
    y = doc.y + 18;

    // One small table per nivel (not one big combined table), two per row - a nivel name like "A"
    // is shared between Contratos and Otros Contratos (see the file-level comment), so this is
    // still a single flat grouping by tier.nivel, not a Contratos/Otros split.
    const tiersByNivel = new Map<string, CommissionLevelTierRow[]>();
    for (const tier of tiers) {
      const list = tiersByNivel.get(tier.nivel) ?? [];
      list.push(tier);
      tiersByNivel.set(tier.nivel, list);
    }

    const cardGap = 20;
    const cardWidth = (contentWidth - cardGap) / 2;
    const rightX = PAGE_MARGIN + cardWidth + cardGap;
    const miniColumns: TableColumn[] = [
      { label: 'MONTO MÍNIMO', width: cardWidth * 0.6, align: 'right' },
      { label: 'PORCENTAJE', width: cardWidth * 0.4, align: 'right' },
    ];

    let yLeft = y;
    let yRight = y;

    Array.from(tiersByNivel.entries()).forEach(([nivel, nivelTiers], index) => {
      const isLeft = index % 2 === 0;
      const startX = isLeft ? PAGE_MARGIN : rightX;
      const neededHeight = 18 + 20 + nivelTiers.length * 18 + 16;

      // A new page resets BOTH columns, not just the one that overflowed - two columns are one
      // physical page, so they can't be on different pages independently.
      if ((isLeft ? yLeft : yRight) + neededHeight > pageBottom) {
        doc.addPage();
        yLeft = PAGE_MARGIN;
        yRight = PAGE_MARGIN;
      }

      let colY = isLeft ? yLeft : yRight;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink).text(`Nivel ${nivel}`, startX, colY, { width: cardWidth });
      colY += 18;
      colY = drawTableHeader(doc, colY, miniColumns, startX);
      nivelTiers.forEach((tier, rowIndex) => {
        colY = drawTableRow(doc, colY, miniColumns, [money(tier.min_amount), `${tier.percentage}%`], rowIndex % 2 === 1, startX);
      });
      colY += 16;

      if (isLeft) yLeft = colY;
      else yRight = colY;
    });
  }

  // Footer drawn last, once per page, via bufferPages - can't draw it inline above since a
  // table's ensureSpace() may add pages after the footer would have already been written.
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    drawFooter(doc, i + 1, pageCount);
  }

  doc.end();
  return done;
}
