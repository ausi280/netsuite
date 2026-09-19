import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { VendedorCommissionGroup } from './commissionsRepository';
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

function money(value: number): string {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/** Draws a table header row (only once, at the top of each new page a table's rows spill onto). */
function drawTableHeader(doc: PDFKit.PDFDocument, y: number, columns: TableColumn[]): number {
  const rowHeight = 20;
  let x = PAGE_MARGIN;
  doc.rect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, rowHeight).fill(BRAND.ink);
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

function drawTableRow(doc: PDFKit.PDFDocument, y: number, columns: TableColumn[], values: string[], striped: boolean): number {
  const rowHeight = 18;
  if (striped) {
    doc.rect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, rowHeight).fill(BRAND.rowAlt);
  }
  let x = PAGE_MARGIN;
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
  { label: 'BONO PLACENTA', width: 65, align: 'right' },
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
 */
export async function generateCommissionsPdf(groups: VendedorCommissionGroup[], month: number, year: number): Promise<Buffer> {
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

    const contractsBonusTotal = group.contracts.reduce((sum, c) => sum + c.placenta_bonus + c.anualidad_bonus_total, 0);
    y = drawStatsBlock(
      doc,
      y,
      [
        ['No. de Contratos', String(group.contracts_count)],
        ['Nivel Contratos', group.nivel_contratos ?? 'Sin asignar'],
        ['Comisión Contratos', money(group.contracts_commission)],
        ['Bonos (Placenta + Anualidad)', money(contractsBonusTotal)],
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
            money(contract.placenta_bonus),
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
        money(group.contracts.reduce((sum, c) => sum + c.total_servicios, 0)),
        money(group.contracts.reduce((sum, c) => sum + c.tier_commission, 0)),
        money(group.contracts.reduce((sum, c) => sum + c.placenta_bonus, 0)),
        money(group.contracts.reduce((sum, c) => sum + c.anualidad_bonus_total, 0)),
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
        money(group.otros_contratos.reduce((sum, o) => sum + o.monto, 0)),
        money(group.otros_contratos_commission),
      ]);
    }
  });

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
