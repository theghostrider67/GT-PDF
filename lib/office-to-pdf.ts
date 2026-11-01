import { assertPageCount, assertPageGeometry, validateInputFile } from "./file-safety";
import { PDFDocument, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { Worksheet } from "@silurus/ooxml/xlsx";

type TextRun = { text: string; x: number; y: number; width: number; height: number };
type OfficeKind = "word-pdf" | "powerpoint-pdf" | "excel-pdf";

// The visible page is rendered by the Office engine. Retain a separate text
// layer for searching, copying, and subsequent PDF-to-Excel conversion.
function addTextLayer(page: PDFPage, font: PDFFont, runs: TextRun[], canvasWidth: number, canvasHeight: number, frame: { x: number; y: number; width: number; height: number }) {
  const supported = new Set(font.getCharacterSet());
  const sx = frame.width / canvasWidth;
  const sy = frame.height / canvasHeight;
  for (const run of runs) {
    const text = Array.from(run.text).map((char) => supported.has(char.codePointAt(0)!) ? char : " ").join("").trim();
    if (!text || run.width <= 0 || run.height <= 0) continue;
    const size = Math.max(1, run.height * sy * 0.8);
    // An invisible layer must fit the same cell/run as the visible rendering.
    const measured = font.widthOfTextAtSize(text, size);
    const fitSize = measured > 0 ? Math.min(size, size * run.width * sx / measured) : size;
    page.drawText(text, { x: frame.x + run.x * sx, y: frame.y + frame.height - (run.y + run.height * 0.85) * sy,
      size: Math.max(0.1, fitSize), font, opacity: 0 });
  }
}

async function appendCanvas(pdf: PDFDocument, font: PDFFont, canvas: HTMLCanvasElement,
  width: number, height: number, runs: TextRun[], fitToPage = false) {
  const image = await pdf.embedPng(canvas.toDataURL("image/png"));
  const page = pdf.addPage([width, height]);
  const scale = Math.min(0.75, (width - 48) / canvas.width, (height - 48) / canvas.height);
  const frame = fitToPage
    ? { x: 24, y: height - 24 - canvas.height * scale, width: canvas.width * scale, height: canvas.height * scale }
    : { x: 0, y: 0, width, height };
  page.drawImage(image, frame);
  addTextLayer(page, font, runs, canvas.width, canvas.height, frame);
  // Release each page before rendering the next one, including batch jobs.
  canvas.width = canvas.height = 0;
}

function sheetBounds(sheet: Worksheet) {
  let lastRow = 1;
  let lastCol = 1;
  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      if (cell.value.type === "empty" && !cell.formula) continue;
      lastRow = Math.max(lastRow, cell.row);
      lastCol = Math.max(lastCol, cell.col);
    }
  }
  for (const merge of sheet.mergeCells) {
    lastRow = Math.max(lastRow, merge.bottom);
    lastCol = Math.max(lastCol, merge.right);
  }
  for (const drawing of [...sheet.images, ...sheet.charts, ...(sheet.shapeGroups ?? [])]) {
    lastRow = Math.max(lastRow, drawing.toRow + 1);
    lastCol = Math.max(lastCol, drawing.toCol + 1);
  }
  return { lastRow, lastCol };
}

export async function officeToPdf(file: File, kind: OfficeKind, basePath = ""): Promise<Uint8Array> {
  await validateInputFile(file, kind);
  const pdf = await PDFDocument.create();
  pdf.setCreator("GHOST PDF");
  pdf.setProducer("GHOST PDF");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const canvas = document.createElement("canvas");
  const data = await file.arrayBuffer();
  const common = { mode: "main" as const, useGoogleFonts: false, progressiveLayout: false };
  try {
    if (kind === "word-pdf") {
      const { DocxDocument } = await import("@silurus/ooxml/docx");
      const doc = await DocxDocument.load(data, { ...common, wasmUrl: `${basePath}/office/docx_parser_bg.wasm` });
      try {
        await doc.waitUntilLayoutComplete();
        assertPageCount(doc.pageCount);
        for (let index = 0; index < doc.pageCount; index++) {
          const { widthPt, heightPt } = doc.pageSize(index);
          assertPageGeometry(widthPt, heightPt);
          const width = Math.min(1800, widthPt * 2);
          const runs: TextRun[] = [];
          await doc.renderPage(canvas, index, { width, dpr: 1,
            onTextRun: (run) => runs.push({ text: run.text, x: run.x, y: run.y, width: run.w, height: run.h }) });
          await appendCanvas(pdf, font, canvas, widthPt, heightPt, runs);
        }
      } finally { doc.destroy(); }
    } else if (kind === "powerpoint-pdf") {
      const { PptxPresentation } = await import("@silurus/ooxml/pptx");
      const deck = await PptxPresentation.load(data, { ...common, wasmUrl: `${basePath}/office/pptx_parser_bg.wasm` });
      try {
        await deck.waitUntilLayoutComplete();
        assertPageCount(deck.slideCount); assertPageGeometry(deck.slideWidth / 12700, deck.slideHeight / 12700);
        for (let index = 0; index < deck.slideCount; index++) {
          const runs: TextRun[] = [];
          await deck.renderSlide(canvas, index, { width: Math.min(1800, deck.slideWidth / 9525 * 2), dpr: 1, skipMediaControls: true,
            onTextRun: (run) => runs.push({ text: run.text, x: run.shapeX + run.inShapeX, y: run.shapeY + run.inShapeY, width: run.w, height: run.h }) });
          // Presentation dimensions are EMUs (12,700 per PDF point).
          await appendCanvas(pdf, font, canvas, deck.slideWidth / 12700, deck.slideHeight / 12700, runs);
        }
      } finally { deck.destroy(); }
    } else {
      const { XlsxWorkbook } = await import("@silurus/ooxml/xlsx");
      let input = data;
      if (/\.(xls|csv)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        input = XLSX.write(XLSX.read(data, { type: "array", cellStyles: true }), { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      }
      const book = await XlsxWorkbook.load(input, { ...common, wasmUrl: `${basePath}/office/xlsx_parser_bg.wasm` });
      try {
        assertPageCount(book.sheetCount, 100);
        let printedPages = 0;
        for (let index = 0; index < book.sheetCount; index++) {
          if (book.isHidden(index)) continue;
          const sheet = await book.getWorksheet(index);
          const { lastRow, lastCol } = sheetBounds(sheet);
          const count = Math.ceil(lastRow / 32) * Math.ceil(lastCol / 8);
          assertPageCount(count); printedPages += count; assertPageCount(printedPages);
          // Tile both axes to include sheets that are wider or longer than one page.
          for (let row = 1; row <= lastRow; row += 32) {
            for (let col = 1; col <= lastCol; col += 8) {
              const runs: TextRun[] = [];
              const rows = Math.min(32, lastRow - row + 1);
              const cols = Math.min(8, lastCol - col + 1);
              const digitWidth = 10;
              let intrinsicWidth = 52;
              let intrinsicHeight = 24;
              for (let c = col; c < col + cols; c++) {
                const range = sheet.colWidthRanges?.find((range) => c >= range.min && c <= range.max);
                intrinsicWidth += sheet.colHidden?.[c] ? 0 : Math.ceil((sheet.colWidths[c] ?? range?.width ?? sheet.defaultColWidth) * digitWidth + 6);
              }
              for (let r = row; r < row + rows; r++) {
                const rowInfo = sheet.rows.find((entry) => entry.index === r);
                intrinsicHeight += rowInfo?.hidden ? 0 : Math.ceil((sheet.rowHeights[r] ?? rowInfo?.height ?? sheet.defaultRowHeight) * 4 / 3) + 2;
              }
              const scale = Math.min(1, 1800 / intrinsicWidth, 1800 / intrinsicHeight);
              await book.renderViewport(canvas, index, { row, col, rows, cols },
                { width: Math.ceil(intrinsicWidth * scale), height: Math.ceil(intrinsicHeight * scale), cellScale: scale,
                  dpr: 1, freezeRows: 0, freezeCols: 0,
                  onTextRun: (run) => runs.push({ text: run.text, x: run.x, y: run.y, width: run.width, height: run.height }) });
              // Worksheet renderers include interactive row/column headers.
              // Remove that chrome from the PDF and keep the cell geometry.
              const left = sheet.isChartSheet || sheet.rightToLeft ? 0 : Math.round(50 * scale);
              const top = sheet.isChartSheet ? 0 : Math.round(22 * scale);
              const headerWidth = sheet.isChartSheet ? 0 : Math.round(50 * scale);
              const trimmed = document.createElement("canvas");
              trimmed.width = Math.max(1, canvas.width - headerWidth);
              trimmed.height = Math.max(1, canvas.height - top);
              const context = trimmed.getContext("2d");
              if (!context) throw new Error("This browser cannot render worksheet pages.");
              context.drawImage(canvas, left, top, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
              await appendCanvas(pdf, font, trimmed, 841.89, 595.28,
                runs.map((run) => ({ ...run, x: run.x - left, y: run.y - top })), true);
              canvas.width = canvas.height = 0;
            }
          }
        }
      } finally { book.destroy(); }
    }
    if (!pdf.getPageCount()) throw new Error("This file does not contain any pages, slides, or visible worksheets.");
    return await pdf.save({ useObjectStreams: true });
  } finally { canvas.width = canvas.height = 0; }
}
