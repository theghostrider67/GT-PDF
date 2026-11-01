import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "ghost-pdf-tests-"));
const out = path.join(root, "out");
await stat(path.join(out, "index.html")).catch(() => { throw new Error("Run npm run build:static before test:conversions."); });
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const netlify = await readFile(path.join(root, "netlify.toml"), "utf8");
const policy = netlify.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1];
const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (base && pathname.startsWith(base + "/")) pathname = pathname.slice(base.length);
    const target = path.resolve(out, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!target.startsWith(out + path.sep)) { response.writeHead(403).end(); return; }
    response.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
    if (policy) response.setHeader("Content-Security-Policy", policy);
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ acceptDownloads: true });
  const failures = [];
  const external = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("requestfailed", (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on("request", (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith("http://127.0.0.1:")) external.push(request.url()); });
  await page.goto(process.env.GHOST_PDF_TEST_URL || `http://127.0.0.1:${server.address().port}${base}/`, { waitUntil: "networkidle" });
  assert.match(await page.title(), /GHOST PDF/);
  assert.equal(await page.locator("header .brand").textContent(), "GHOST PDF");

  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  for (const [index, width] of [300, 400, 500].entries()) {
    const p = source.addPage([width, 600]);
    p.drawText(`PAGE ${index + 1}`, { x: 40, y: 540, font, size: 14 });
    p.drawText("Name", { x: 40, y: 500, font, size: 12 });
    p.drawText("Total", { x: 220, y: 500, font, size: 12 });
    p.drawText("Alpha", { x: 40, y: 480, font, size: 12 });
    p.drawText("42", { x: 220, y: 480, font, size: 12 });
  }
  const sourcePath = path.join(directory, "source.pdf");
  await writeFile(sourcePath, await source.save());

  async function convert(tool, input, output) {
    await page.locator(".tool-card").filter({ has: page.getByText(tool, { exact: true }) }).click();
    await page.locator('input[type="file"]').setInputFiles(input);
    const download = page.waitForEvent("download", { timeout: 60000 });
    download.catch(() => {});
    const errorController = new AbortController();
    // Poll the visible app error without leaving a dangling locator wait.
    const appError = (async () => {
      while (!errorController.signal.aborted) {
        const error = await page.locator(".feedback.error").allTextContents();
        if (error.length) throw new Error(`${tool}: ${error.join(" ")}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return new Promise(() => {});
    })();
    appError.catch(() => {});
    try {
      await page.locator(".process-button").click();
      const result = await Promise.race([download, appError]);
      const filename = path.join(directory, output);
      await result.saveAs(filename);
      await page.waitForFunction(() => !document.querySelector(".process-button").disabled);
      assert.equal(await page.locator(".feedback.error").count(), 0);
      console.log(`PASS ${tool}: ${output}`);
      return filename;
    } finally { errorController.abort(); }
  }
  async function textOf(filename) {
    const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(filename)),
      standardFontDataUrl: path.join(root, "node_modules/pdfjs-dist/standard_fonts/") });
    try {
      const document = await task.promise;
      const texts = [];
      for (let n = 1; n <= document.numPages; n++) {
        const content = await (await document.getPage(n)).getTextContent();
        texts.push(content.items.filter((item) => "str" in item).map((item) => item.str).join(" ").replace(/\s+/g, " "));
      }
      return texts;
    } finally { await task.destroy(); }
  }

  const converted = {};
  for (const [forward, reverse, extension] of [["PDF to Word", "Word to PDF", "docx"], ["PDF to PowerPoint", "PowerPoint to PDF", "pptx"], ["PDF to Excel", "Excel to PDF", "xlsx"]]) {
    const office = await convert(forward, sourcePath, `converted.${extension}`);
    converted[extension] = office;
    const output = await convert(reverse, office, `returned-${extension}.pdf`);
    const pdf = await PDFDocument.load(await readFile(output));
    assert.equal(pdf.getPageCount(), 3);
    assert(pdf.getPages().every((p) => p.getWidth() < 2000 && p.getHeight() < 2000));
    assert(pdf.getPages().every((p) => p.node.Resources()?.lookup(PDFName.of("XObject"))?.keys().length > 0), "Every output page must retain its image content");
    if (extension === "docx") assert.deepEqual(pdf.getPages().map((p) => p.getWidth()), [300, 400, 500]);
    if (extension === "pptx") assert(Math.abs(pdf.getPage(0).getWidth() - 300) < 0.1);
    if (extension === "xlsx") {
      const text = (await textOf(output)).join(" ");
      assert(text.includes("Alpha") && text.includes("42"));
      const restored = await convert("PDF to Excel", output, "restored.xlsx");
      const workbook = XLSX.read(await readFile(restored), { type: "buffer" });
      assert(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }).flat().includes("Alpha"));
    }
    console.log(`PASS ${extension.toUpperCase()} round trip: content and physical page dimensions`);
  }

  // A Word file with an image-only page used to fail in the text-only importer.
  // Add real text to a separate copy and require the current text to survive.
  const word = await JSZip.loadAsync(await readFile(converted.docx));
  let xml = await word.file("word/document.xml").async("text");
  xml = xml.replace("<w:body>", '<w:body><w:p><w:r><w:t>EDITED DOCUMENT</w:t></w:r></w:p>');
  word.file("word/document.xml", xml);
  const edited = path.join(directory, "edited.docx");
  await writeFile(edited, await word.generateAsync({ type: "nodebuffer" }));
  assert((await textOf(await convert("Word to PDF", edited, "edited-word.pdf"))).join(" ").includes("EDITED DOCUMENT"));

  const presentation = new PptxGenJS();
  for (const n of [1, 2, 3]) presentation.addSlide().addText(`SLIDE${n} CONTENT`, { x: 1, y: 1, w: 6, h: 1 });
  const pptx = await JSZip.loadAsync(await presentation.write({ outputType: "nodebuffer" }));
  let slidesXml = await pptx.file("ppt/presentation.xml").async("text");
  const ids = slidesXml.match(/<p:sldId\b[^>]*\/>/g);
  slidesXml = slidesXml.replace(/<p:sldIdLst>.*?<\/p:sldIdLst>/s, `<p:sldIdLst>${ids[2]}${ids[0]}</p:sldIdLst>`);
  pptx.file("ppt/presentation.xml", slidesXml);
  const reordered = path.join(directory, "reordered.pptx");
  await writeFile(reordered, await pptx.generateAsync({ type: "nodebuffer" }));
  const slidesText = await textOf(await convert("PowerPoint to PDF", reordered, "reordered.pdf"));
  assert.equal(slidesText.length, 2);
  assert(slidesText[0].includes("SLIDE3 CONTENT") && slidesText[1].includes("SLIDE1 CONTENT"));

  const workbook = XLSX.utils.book_new();
  const rows = [Array.from({ length: 12 }, (_, c) => `Column ${c + 1}`), ...Array.from({ length: 74 }, (_, r) => Array.from({ length: 12 }, (_, c) => `R${r + 2}C${c + 1}`))];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = Array.from({ length: 12 }, (_, c) => ({ wch: c === 0 ? 32 : 14 }));
  sheet["!rows"] = [{ hpt: 48 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Ledger");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Hidden content"]]), "Hidden");
  workbook.Workbook = { Sheets: [{ name: "Ledger", Hidden: 0 }, { name: "Hidden", Hidden: 1 }] };
  for (const [extension, bookType] of [["xlsx", "xlsx"], ["xls", "biff8"]]) {
    const filename = path.join(directory, `wide.${extension}`);
    await writeFile(filename, XLSX.write(workbook, { type: "buffer", bookType }));
    const output = await convert("Excel to PDF", filename, `wide-${extension}.pdf`);
    const pdf = await PDFDocument.load(await readFile(output));
    assert.equal(pdf.getPageCount(), 6);
    const text = (await textOf(output)).join(" ");
    assert(text.includes("R75C12"), "The last row and column must not be clipped");
    assert(!text.includes("Hidden content"));
  }
  const csv = path.join(directory, "sheet.csv");
  await writeFile(csv, "Name,Total\nAlpha,42\n");
  assert((await textOf(await convert("Excel to PDF", csv, "csv.pdf"))).join(" ").includes("Alpha"));
  assert.deepEqual(failures, []);
  assert.deepEqual(external, [], "Office conversion must work without third-party font or conversion services");
  console.log("PASS branding, deployed content security policy, local resources, edited documents, slide order, XLS/CSV, and spreadsheet pagination");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
