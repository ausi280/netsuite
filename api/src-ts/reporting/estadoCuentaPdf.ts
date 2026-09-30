import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { EstadoCuenta } from './estadoCuentaRepository';

const ASSETS_DIR = path.join(__dirname, '../../assets');
const HEADER_IMAGE_PATH = path.join(ASSETS_DIR, 'informe-header.png');
// Real aspect ratio of informe-header.png (650x102) - same convention sampleReportService.js's
// own HEADER_IMAGE_ASPECT uses, so it scales to page width without distortion.
const HEADER_IMAGE_ASPECT = 650 / 102;

const FONTS = {
  bodyRegular: path.join(ASSETS_DIR, 'fonts/MonaSans-Regular.ttf'),
  bodySemiBold: path.join(ASSETS_DIR, 'fonts/MonaSans-SemiBold.ttf'),
  bodyBold: path.join(ASSETS_DIR, 'fonts/MonaSans-Bold.ttf'),
  monoRegular: path.join(ASSETS_DIR, 'fonts/GeistMono-Regular.ttf'),
  monoBold: path.join(ASSETS_DIR, 'fonts/GeistMono-Bold.ttf'),
};

/**
 * Styled after the REAL "Informe de Buenas Condiciones" generator (sampleReportService.js, the
 * source shared directly) rather than an approximation of its rendered output - same header
 * image, same MonaSans/GeistMono fonts, same exact BRAND palette, same field-layout mechanics
 * (a shared label/value column computed from the widest label, one page-level rule under the
 * title, no rule under section headers, the same footer block). The "Total de Adeudo" summary
 * box and "Últimos cargos" table have no equivalent in that reference (a lab certificate, not a
 * billing statement) - designed in the same visual language (Mono labels, BRAND.accent section
 * color, BRAND.rule hairlines) rather than invented from scratch.
 */
const BRAND = {
  title: '#1A1A1A',
  ink: '#0D1D3C',
  accent: '#5B7BA8',
  muted: '#6B7A90',
  rule: '#E1E5EA',
};

const PAGE_MARGIN = 60;
const FOOTER_HEIGHT = 100;

function money(value: number): string {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "28 de septiembre de 2026" - matches sampleReportService.js's formatEmissionDate exactly. */
function fechaLarga(date: Date): string {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Contract date fields are raw NetSuite locale text (DD/MM/YYYY) - reformat to the same long
 * Spanish date style as fechaLarga, falling back to the raw text if it doesn't parse. */
function fechaLargaFromLocaleText(value: string | null): string {
  if (!value) return 'N/D';
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return value;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? value : fechaLarga(date);
}

function registerFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont('Body', FONTS.bodyRegular);
  doc.registerFont('Body-SemiBold', FONTS.bodySemiBold);
  doc.registerFont('Body-Bold', FONTS.bodyBold);
  doc.registerFont('Mono', FONTS.monoRegular);
  doc.registerFont('Mono-Bold', FONTS.monoBold);
}

/** Returns the rendered height so callers know where content can safely start - identical to
 * sampleReportService.js's own drawHeader. */
function drawHeader(doc: PDFKit.PDFDocument): number {
  const width = doc.page.width;
  const height = width / HEADER_IMAGE_ASPECT;
  if (fs.existsSync(HEADER_IMAGE_PATH)) {
    doc.image(HEADER_IMAGE_PATH, 0, 0, { width });
  }
  return height;
}

interface FieldRow {
  label: string;
  value: string;
}

/** Same "label at a fixed x, value at a shared valueX" column layout sampleReportService.js's
 * drawField/drawServicePage use - valueX is sized to the widest label across every field on the
 * page, computed once by the caller, so labels of different lengths still line up. */
function drawField(doc: PDFKit.PDFDocument, x: number, valueX: number, y: number, label: string, value: string): void {
  doc.font('Mono').fontSize(9).fillColor(BRAND.muted).text(`${label.toUpperCase()}:`, x, y);
  doc.font('Body-Bold').fontSize(10.5).fillColor(BRAND.ink).text(value, valueX, y - 1);
}

function drawSectionHeader(doc: PDFKit.PDFDocument, x: number, y: number, label: string): void {
  doc.font('Mono-Bold').fontSize(10).fillColor(BRAND.accent).text(label, x, y);
}

type CargoColumnKey = 'anio' | 'concepto' | 'estatus' | 'importe' | 'importeConIva' | 'moratorio' | 'pagado';
type ColumnAlign = 'left' | 'right' | 'center';

interface CargoColumn {
  key: CargoColumnKey;
  label: string;
  width: number;
  align: ColumnAlign;
  x: number;
}

function layoutCargoColumns(specs: Array<Omit<CargoColumn, 'x'>>): CargoColumn[] {
  let x = PAGE_MARGIN;
  return specs.map((spec) => {
    const col = { ...spec, x };
    x += spec.width;
    return col;
  });
}

/** Three mutually exclusive layouts, all summing to the same 492pt content width:
 *  - every cargo Pagado: AÑO/CONCEPTO/PAGADO (a checkmark, no dollar figures at all) - per
 *    explicit instruction.
 *  - at least one cargo carries a moratorio: adds an INTERÉS MORATORIO column, narrowing the
 *    others to fit.
 *  - otherwise: the original AÑO/CONCEPTO/ESTATUS/IMPORTE/IMPORTE CON IVA layout. */
function buildCargoColumns(allPagados: boolean, hasMoratorios: boolean): CargoColumn[] {
  if (allPagados) {
    return layoutCargoColumns([
      { key: 'anio', label: 'AÑO', width: 45, align: 'left' },
      { key: 'concepto', label: 'CONCEPTO', width: 367, align: 'left' },
      { key: 'pagado', label: 'PAGADO', width: 80, align: 'center' },
    ]);
  }
  if (hasMoratorios) {
    // Labels shortened from their default-layout wording ("IMPORTE CON IVA (USD)", "INTERÉS
    // MORATORIO (USD)") - at this layout's narrower column widths the full wording wraps to two
    // lines, which previously stranded the table header alone at the bottom of a page.
    return layoutCargoColumns([
      { key: 'anio', label: 'AÑO', width: 30, align: 'left' },
      { key: 'concepto', label: 'CONCEPTO', width: 140, align: 'left' },
      { key: 'estatus', label: 'ESTATUS', width: 55, align: 'right' },
      { key: 'importe', label: 'IMPORTE (USD)', width: 80, align: 'right' },
      { key: 'importeConIva', label: 'CON IVA (USD)', width: 87, align: 'right' },
      { key: 'moratorio', label: 'MORATORIO (USD)', width: 100, align: 'right' },
    ]);
  }
  return layoutCargoColumns([
    { key: 'anio', label: 'AÑO', width: 35, align: 'left' },
    { key: 'concepto', label: 'CONCEPTO', width: 185, align: 'left' },
    { key: 'estatus', label: 'ESTATUS', width: 60, align: 'right' },
    { key: 'importe', label: 'IMPORTE (USD)', width: 100, align: 'right' },
    { key: 'importeConIva', label: 'IMPORTE CON IVA (USD)', width: 112, align: 'right' },
  ]);
}

function drawCheckmark(doc: PDFKit.PDFDocument, centerX: number, centerY: number, size: number, color: string): void {
  const x = centerX - size / 2;
  const y = centerY - size / 2;
  doc
    .lineWidth(1.6)
    .strokeColor(color)
    .lineCap('round')
    .lineJoin('round')
    .moveTo(x, y + size * 0.55)
    .lineTo(x + size * 0.38, y + size * 0.9)
    .lineTo(x + size, y + size * 0.12)
    .stroke();
}

function drawCargosTableHeader(doc: PDFKit.PDFDocument, y: number, columns: CargoColumn[]): number {
  doc.font('Mono-Bold').fontSize(8).fillColor(BRAND.accent);
  const maxHeight = Math.max(...columns.map((col) => doc.heightOfString(col.label, { width: col.width })));
  columns.forEach((col) => {
    doc.text(col.label, col.x, y, { width: col.width, align: col.align });
  });
  const ruleY = y + Math.max(12, maxHeight + 2);
  doc.moveTo(PAGE_MARGIN, ruleY).lineTo(doc.page.width - PAGE_MARGIN, ruleY).lineWidth(0.75).strokeColor(BRAND.ink).stroke();
  return ruleY + 6;
}

function drawCargoRow(doc: PDFKit.PDFDocument, y: number, cargo: EstadoCuenta['cargos'][number], columns: CargoColumn[]): number {
  const conceptoCol = columns.find((col) => col.key === 'concepto')!;
  const conceptoWidth = conceptoCol.width - 10;
  const conceptoHeight = doc.font('Body').fontSize(8).heightOfString(cargo.concepto ?? '', { width: conceptoWidth });
  const rowHeight = Math.max(14, conceptoHeight);

  columns.forEach((col) => {
    switch (col.key) {
      case 'anio':
        doc.font('Body').fontSize(8).fillColor(BRAND.ink).text(cargo.anio ?? '', col.x, y, { width: col.width, align: col.align });
        break;
      case 'concepto': {
        // A cargo whose own moneda isn't USD (rare - see the repository's file-level comment)
        // gets a "*" flag next to its amount rather than silently passing it off as USD.
        const conceptoText = cargo.es_usd ? cargo.concepto ?? '' : `${cargo.concepto ?? ''} *`;
        doc.font('Body').fontSize(8).fillColor(BRAND.ink).text(conceptoText, col.x, y, { width: conceptoWidth });
        break;
      }
      case 'estatus': {
        // Pagado=green, Vencido=red (text-safe danger shade, not a raw status-palette fill -
        // those don't clear WCAG contrast as small text on white), Pendiente/Parcialmente pagado
        // stay neutral ink rather than guessing a severity for them.
        const estatusColor = cargo.estatus_id === '1' ? '#0CA30C' : cargo.estatus_id === '4' ? '#BD3434' : BRAND.ink;
        doc
          .fillColor(estatusColor)
          .font(cargo.estatus_id === '1' || cargo.estatus_id === '4' ? 'Body-Bold' : 'Body')
          .fontSize(8)
          .text(cargo.estatus_label, col.x, y, { width: col.width, align: col.align });
        break;
      }
      case 'importe':
        doc.font('Body').fontSize(8).fillColor(BRAND.ink).text(money(cargo.importe), col.x, y, { width: col.width, align: col.align });
        break;
      case 'importeConIva':
        // Null (non-Mexico subsidiary, no known tax rate - see the repository's file-level
        // comment) shows as "—" rather than a misleading blank cell or a guessed amount.
        doc
          .font('Body')
          .fontSize(8)
          .fillColor(BRAND.ink)
          .text(cargo.importe_con_impuesto === null ? '—' : money(cargo.importe_con_impuesto), col.x, y, { width: col.width, align: col.align });
        break;
      case 'moratorio':
        doc
          .font('Body')
          .fontSize(8)
          .fillColor(cargo.interes_moratorio > 0 ? '#BD3434' : BRAND.ink)
          .text(cargo.interes_moratorio > 0 ? money(cargo.interes_moratorio) : '—', col.x, y, { width: col.width, align: col.align });
        break;
      case 'pagado':
        drawCheckmark(doc, col.x + col.width / 2, y + 5, 11, '#0CA30C');
        break;
    }
  });

  const bottomY = y + rowHeight + 5;
  doc.moveTo(PAGE_MARGIN, bottomY).lineTo(doc.page.width - PAGE_MARGIN, bottomY).lineWidth(0.5).strokeColor(BRAND.rule).stroke();
  return bottomY + 5;
}

const SERVICIO_COLUMNS = {
  tipo: { x: PAGE_MARGIN, width: 160 },
  procesamiento: { x: PAGE_MARGIN + 160, width: 170 },
  cubierto: { x: PAGE_MARGIN + 160 + 170, width: 162 },
};

function drawServiciosTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.font('Mono-Bold').fontSize(8).fillColor(BRAND.accent);
  doc.text('SERVICIO', SERVICIO_COLUMNS.tipo.x, y, { width: SERVICIO_COLUMNS.tipo.width });
  doc.text('FECHA DE PROCESAMIENTO', SERVICIO_COLUMNS.procesamiento.x, y, { width: SERVICIO_COLUMNS.procesamiento.width });
  doc.text('CUOTA DE ALMACENAJE CUBIERTA HASTA', SERVICIO_COLUMNS.cubierto.x, y, { width: SERVICIO_COLUMNS.cubierto.width });
  const ruleY = y + 20;
  doc.moveTo(PAGE_MARGIN, ruleY).lineTo(doc.page.width - PAGE_MARGIN, ruleY).lineWidth(0.75).strokeColor(BRAND.ink).stroke();
  return ruleY + 6;
}

function drawServicioRow(doc: PDFKit.PDFDocument, y: number, servicio: EstadoCuenta['servicios'][number]): number {
  const rowHeight = 14;
  doc.font('Body-Bold').fontSize(9).fillColor(BRAND.ink);
  doc.text(servicio.tipo_label, SERVICIO_COLUMNS.tipo.x, y, { width: SERVICIO_COLUMNS.tipo.width });
  doc.font('Body').fillColor(BRAND.ink);
  doc.text(fechaLargaFromLocaleText(servicio.fecha_procesamiento), SERVICIO_COLUMNS.procesamiento.x, y, { width: SERVICIO_COLUMNS.procesamiento.width });
  doc.text(servicio.cubierto_hasta ?? 'N/D', SERVICIO_COLUMNS.cubierto.x, y, { width: SERVICIO_COLUMNS.cubierto.width });

  const bottomY = y + rowHeight + 5;
  doc.moveTo(PAGE_MARGIN, bottomY).lineTo(doc.page.width - PAGE_MARGIN, bottomY).lineWidth(0.5).strokeColor(BRAND.rule).stroke();
  return bottomY + 5;
}

interface CargoTotals {
  cargos: number;
  cargosConIva: number | null;
  moratorio: number | null;
}

function drawCargosTotalRow(doc: PDFKit.PDFDocument, y: number, columns: CargoColumn[], totals: CargoTotals): number {
  const conceptoCol = columns.find((col) => col.key === 'concepto')!;
  const estatusCol = columns.find((col) => col.key === 'estatus');
  const importeCol = columns.find((col) => col.key === 'importe');
  const importeConIvaCol = columns.find((col) => col.key === 'importeConIva');
  const moratorioCol = columns.find((col) => col.key === 'moratorio');
  const labelEndCol = estatusCol ?? conceptoCol;

  doc.font('Body-Bold').fontSize(9).fillColor(BRAND.ink);
  doc.text('TOTAL', conceptoCol.x, y, { width: labelEndCol.x + labelEndCol.width - conceptoCol.x, align: 'right' });
  if (importeCol) doc.text(`$ ${money(totals.cargos)} USD`, importeCol.x, y, { width: importeCol.width, align: 'right' });
  if (importeConIvaCol) {
    doc.text(totals.cargosConIva === null ? '—' : `$ ${money(totals.cargosConIva)} USD`, importeConIvaCol.x, y, { width: importeConIvaCol.width, align: 'right' });
  }
  if (moratorioCol && totals.moratorio !== null) {
    doc.text(`$ ${money(totals.moratorio)} USD`, moratorioCol.x, y, { width: moratorioCol.width, align: 'right' });
  }
  return y + 18;
}

/** Identical to sampleReportService.js's own drawFooter (address/phone lines + legal disclaimer,
 * all BRAND.accent, then a solid BRAND.ink bar) - no invented "El complemento ideal" tagline. A
 * page indicator (needed here since a long charge history can span pages, unlike the reference's
 * fixed 1-2 pages) sits on its own row just above that block - vertically clear of the centered
 * address/phone lines regardless of how wide they render, so it can never collide with them. */
function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number, pageCount: number): void {
  const width = doc.page.width;
  const bottom = doc.page.height;
  const margin = 70;

  if (pageCount > 1) {
    doc
      .font('Body')
      .fontSize(7)
      .fillColor(BRAND.muted)
      .text(`Página ${pageNumber} de ${pageCount}`, width - margin - 100, bottom - 104, { width: 100, align: 'right' });
  }

  doc
    .font('Body-SemiBold')
    .fontSize(9)
    .fillColor(BRAND.accent)
    .text('Aztecas N°295 esq. Coras, Fracc. Monraz, C.P. 44670, Guadalajara, Jalisco.', 0, bottom - 92, { width, align: 'center' });
  doc
    .font('Body-SemiBold')
    .fontSize(9)
    .fillColor(BRAND.accent)
    .text('800 999 CRYO (2796)  |  cryo@cryo-cell.com.mx  |  www.cryo-cell.com.mx', 0, bottom - 78, { width, align: 'center' });

  doc
    .font('Body')
    .fontSize(7)
    .fillColor(BRAND.accent)
    .text('Este documento es un estado de cuenta informativo, no un comprobante fiscal.', margin, bottom - 58, {
      width: width - margin * 2,
      align: 'center',
    });

  doc.rect(0, bottom - 6, width, 6).fill(BRAND.ink);
}

export async function generateEstadoCuentaPdf(data: EstadoCuenta): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true });
  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const left = PAGE_MARGIN;
  const contentWidth = doc.page.width - left * 2;
  const pageBottom = doc.page.height - FOOTER_HEIGHT;

  function ensureSpace(y: number, needed: number): number {
    if (y + needed > pageBottom) {
      doc.addPage();
      return PAGE_MARGIN;
    }
    return y;
  }

  const headerHeight = drawHeader(doc);
  let y = headerHeight + 46;

  doc.font('Body-Bold').fontSize(21).fillColor(BRAND.title).text('Estado de Cuenta', left, y, { width: contentWidth - 180, lineGap: 4 });
  const titleBottom = doc.y;

  // Total de Adeudo box, top-right - the one piece of content sampleReportService.js's own
  // reference has no equivalent for (a lab certificate carries no money figure). Height is sized
  // to fit all 4 stacked lines (FECHA label+value, TOTAL DE ADEUDO label+value) plus padding on
  // both ends - a fixed 46 previously let the amount overflow past the bottom border.
  const boxWidth = 170;
  const boxX = doc.page.width - left - boxWidth;
  const boxY = y;
  // Shown WITH tax when known (Mexico-subsidiary contracts - see the repository's file-level
  // comment); every other subsidiary has no known tax rate, so it falls back to the plain sum.
  const adeudoAmount = data.total_adeudo_con_impuesto ?? data.total_adeudo;
  const adeudoLabel = data.total_adeudo_con_impuesto !== null ? 'TOTAL DE ADEUDO (CON IVA)' : 'TOTAL DE ADEUDO';
  doc.font('Mono').fontSize(7).fillColor(BRAND.muted).text('FECHA', boxX + 10, boxY + 10);
  doc.font('Body-Bold').fontSize(9).fillColor(BRAND.ink).text(fechaLarga(data.fecha_emision), boxX + 10, doc.y, { width: boxWidth - 20 });
  const adeudoColor = adeudoAmount > 0 ? '#BD3434' : '#0CA30C';
  doc.font('Mono').fontSize(7).fillColor(BRAND.muted).text(adeudoLabel, boxX + 10, doc.y + 6, { width: boxWidth - 20 });
  doc
    .font('Body-Bold')
    .fontSize(11)
    .fillColor(adeudoColor)
    .text(`$ ${money(adeudoAmount)} USD`, boxX + 10, doc.y, { width: boxWidth - 20 });
  const boxHeight = doc.y - boxY + 12;
  doc.rect(boxX, boxY, boxWidth, boxHeight).lineWidth(0.75).strokeColor(BRAND.rule).stroke();

  y = Math.max(titleBottom, doc.y) + 16;
  doc.moveTo(left, y).lineTo(doc.page.width - left, y).lineWidth(0.75).strokeColor(BRAND.rule).stroke();
  y += 14;

  const folioSistemaAnterior = data.id_cliente && data.id_cliente !== data.folio_netsuite ? data.id_cliente : null;
  const folioText = `${data.folio_netsuite ?? 'N/D'}${folioSistemaAnterior ? ` (${folioSistemaAnterior})` : ''}`;
  doc
    .font('Mono-Bold')
    .fontSize(9)
    .fillColor(BRAND.muted)
    .text(`FOLIO: ${folioText}  |  FECHA DE EMISIÓN: ${fechaLarga(data.fecha_emision)}`, left, y);
  y += 32;

  const clienteFields: FieldRow[] = [{ label: 'Nombre de Mamá', value: data.nombre_titular ?? 'N/D' }];
  if (data.nombre_padres) clienteFields.push({ label: 'Nombre de Papá', value: data.nombre_padres });
  if (data.direccion) {
    const { addr1, city, state, zip, country } = data.direccion;
    const linea2 = [city, state].filter(Boolean).join(', ') + (zip ? ` C.P. ${zip}` : '') + (country ? `, ${country}` : '');
    clienteFields.push({ label: 'Dirección', value: [addr1, linea2].filter(Boolean).join(', ') || 'N/D' });
  }
  clienteFields.push({ label: 'ID Cliente', value: data.id_cliente ?? 'N/D' });

  const especimenFields: FieldRow[] = [
    { label: 'Nombre de Hijo', value: data.nombre_bebe ?? 'N/D' },
    { label: 'Fecha de Nacimiento', value: fechaLargaFromLocaleText(data.fecha_nacimiento) },
  ];

  // Shared value column across BOTH sections, sized to the widest label on this page - identical
  // to sampleReportService.js's own valueX computation.
  doc.font('Mono').fontSize(9);
  const labelGap = 10;
  const maxLabelWidth = Math.max(...[...clienteFields, ...especimenFields].map((f) => doc.widthOfString(`${f.label.toUpperCase()}:`)));
  const valueX = left + maxLabelWidth + labelGap;

  drawSectionHeader(doc, left, y, 'INFORMACIÓN DEL CLIENTE');
  y += 22;
  clienteFields.forEach((field) => {
    drawField(doc, left, valueX, y, field.label, field.value);
    y += 22;
  });
  y += 14;

  drawSectionHeader(doc, left, y, 'INFORMACIÓN DEL ESPÉCIMEN');
  y += 22;
  especimenFields.forEach((field) => {
    drawField(doc, left, valueX, y, field.label, field.value);
    y += 22;
  });
  y += 14;

  if (data.servicios.length > 0) {
    y = ensureSpace(y, 60);
    drawSectionHeader(doc, left, y, 'COBERTURA POR SERVICIO');
    y += 22;
    y = drawServiciosTableHeader(doc, y);

    data.servicios.forEach((servicio) => {
      if (y + 19 > pageBottom) {
        doc.addPage();
        y = PAGE_MARGIN;
        y = drawServiciosTableHeader(doc, y);
      }
      y = drawServicioRow(doc, y, servicio);
    });
    y += 14;
  }

  // When there's at least one unpaid cargo, only THOSE are shown (the full paid history is noise
  // next to what's actually owed) - per explicit instruction. Only once every cargo is already
  // paid off does the full history become the more useful view (there's no debt left to spotlight).
  const hasUnpaidCargos = data.cargos.some((cargo) => !cargo.pagado);
  const visibleCargos = hasUnpaidCargos ? data.cargos.filter((cargo) => !cargo.pagado) : data.cargos;

  if (visibleCargos.length > 0) {
    // Three layouts (see buildCargoColumns) - when every visible cargo is already Pagado (i.e.
    // hasUnpaidCargos is false, so visibleCargos is the full paid history), dollar amounts are
    // dropped entirely in favor of a single checkmark column, per explicit instruction.
    const allPagados = visibleCargos.every((cargo) => cargo.pagado);
    const hasMoratorios = visibleCargos.some((cargo) => cargo.interes_moratorio > 0);
    const cargoColumns = buildCargoColumns(allPagados, hasMoratorios);
    const conceptoWidth = cargoColumns.find((col) => col.key === 'concepto')!.width - 10;

    // 100, not 60 - a header with long column labels (e.g. "INTERÉS MORATORIO (USD)") can wrap to
    // two lines, and this must leave room for the section title + that header + at least one row,
    // or the header alone gets stranded at the bottom of a page with every row pushed past it.
    y = ensureSpace(y, 100);
    drawSectionHeader(doc, left, y, 'ÚLTIMOS CARGOS');
    y += 22;
    y = drawCargosTableHeader(doc, y, cargoColumns);

    visibleCargos.forEach((cargo) => {
      const estimatedHeight = Math.max(14, doc.font('Body').fontSize(8).heightOfString(cargo.concepto ?? '', { width: conceptoWidth }) + 10);
      if (y + estimatedHeight > pageBottom) {
        doc.addPage();
        y = PAGE_MARGIN;
        y = drawCargosTableHeader(doc, y, cargoColumns);
      }
      y = drawCargoRow(doc, y, cargo, cargoColumns);
    });

    if (!allPagados) {
      const totalCargos = visibleCargos.reduce((sum, cargo) => sum + cargo.importe, 0);
      const totalCargosConIva = data.es_mexico ? visibleCargos.reduce((sum, cargo) => sum + (cargo.importe_con_impuesto ?? 0), 0) : null;
      const totalMoratorio = hasMoratorios ? visibleCargos.reduce((sum, cargo) => sum + cargo.interes_moratorio, 0) : null;
      y = ensureSpace(y, 24);
      y = drawCargosTotalRow(doc, y, cargoColumns, { cargos: totalCargos, cargosConIva: totalCargosConIva, moratorio: totalMoratorio });
    }

    if (visibleCargos.some((cargo) => !cargo.es_usd)) {
      y = ensureSpace(y, 12);
      doc
        .font('Body')
        .fontSize(7)
        .fillColor(BRAND.muted)
        .text('* Cargo registrado en una moneda distinta a USD - importe mostrado sin conversión de tipo de cambio.', left, y, {
          width: contentWidth,
        });
    }
  }

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    drawFooter(doc, i + 1, pageCount);
  }

  doc.end();
  return done;
}
