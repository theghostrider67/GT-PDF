import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "ghost-toolkit-"));
const outputDirectory = process.env.GHOST_PDF_TEST_OUTPUT_DIR;
if (outputDirectory) await mkdir(outputDirectory, { recursive: true });
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const out = path.join(root, "out");
const policy = (await readFile(path.join(root, "netlify.toml"), "utf8")).match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1];
const mime = { ".txt": "text/plain; charset=utf-8", ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (base && pathname.startsWith(base + "/")) pathname = pathname.slice(base.length);
    const filename = path.resolve(out, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
    if (!filename.startsWith(out + path.sep)) { response.writeHead(403).end(); return; }
    if (policy) response.setHeader("Content-Security-Policy", policy);
    response.setHeader("Content-Type", mime[path.extname(filename)] || "application/octet-stream"); response.end(await readFile(filename));
  } catch { response.writeHead(404).end(); }
});
if (!process.env.GHOST_PDF_TEST_URL) await stat(path.join(out, "index.html"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const homeUrl = process.env.GHOST_PDF_TEST_URL || `http://127.0.0.1:${server.address().port}${base}/`;
  await page.goto(homeUrl, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".tool-card").count(), 38);
  assert.equal(await page.locator("#workspace, input[type=file]").count(), 0, "The catalog has no conversion workspace");
  const toolLinks = await page.locator("a.tool-card").evaluateAll((links) => links.map((link) => ({ href: link.href, name: link.querySelector(".tool-title").textContent })));
  assert.equal(new Set(toolLinks.map((link) => link.href)).size, 38);
  for (const link of toolLinks) {
    const response = await page.request.get(link.href);
    assert.equal(response.status(), 200, link.href);
    const html = await response.text(); assert(html.includes(`${link.name} — GHOST PDF`), link.href);
    assert(!html.includes('class="tool-grid"'), "Dedicated pages exclude the catalog");
  }
  assert.equal((await page.request.get(new URL("tools/not-a-pdf-tool/", homeUrl).href)).status(), 404);
  await page.locator('a.tool-card').filter({ has: page.getByText("PDF to Word", { exact: true }) }).click();
  await page.waitForURL(/\/tools\/pdf-to-word\/$/); await page.getByRole("heading", { level: 1, name: "PDF to Word." }).waitFor();
  await page.reload(); await page.getByRole("heading", { level: 1, name: "PDF to Word." }).waitFor();
  await page.goBack(); await page.locator("#tools").waitFor();
  await page.goForward(); await page.getByRole("heading", { level: 1, name: "PDF to Word." }).waitFor();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.waitForFunction(() => document.activeElement === document.querySelector('input[aria-label="Search PDF tools"]'));
  await page.goBack(); await page.getByRole("heading", { level: 1, name: "PDF to Word." }).waitFor();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "All tools" }).click();
  await page.locator("#tools").waitFor();
  console.log("PASS 38 dedicated routes, direct access, refresh, browser back/forward, and catalog/workspace separation");
  await page.getByRole("searchbox", { name: "Search PDF tools" }).fill("password");
  assert((await page.locator(".tool-card").count()) >= 2);
  await page.getByRole("searchbox", { name: "Search PDF tools" }).fill("");
  await page.getByRole("button", { name: "Save Merge PDF", exact: true }).click();
  await page.getByRole("button", { name: /^Saved/ }).click();
  assert.equal(await page.locator(".tool-card").count(), 1);
  await page.getByRole("tab", { name: "All tools", exact: true }).click();
  await page.getByRole("button", { name: /Use dark appearance|Use light appearance/ }).click();
  assert(["dark", "light"].includes(await page.locator("html").getAttribute("data-theme")));
  console.log("PASS searchable catalog, favorites, categories, and appearance controls");

  const source = await PDFDocument.create(); const font = await source.embedFont(StandardFonts.Helvetica);
  for (const [index, size] of [[300, 400], [400, 500], [500, 600]].entries()) {
    const p = source.addPage(size); p.drawText("SECRET ACCOUNT 1234", { x: 25, y: size[1] - 90, font, size: 16 });
    p.drawText(`PAGE ${index + 1}`, { x: 25, y: size[1] - 135, font, size: 16 });
    p.drawText("Local documents keep private information on your own device.", { x: 20, y: 150, font, size: 7 });
    p.drawText("Searchable text makes documents easier to find and reuse.", { x: 20, y: 130, font, size: 7 });
    p.drawText("Workflows can combine multiple finishing tasks into one download.", { x: 20, y: 110, font, size: 7 });
  }
  const sourcePath = path.join(directory, "source.pdf"); await writeFile(sourcePath, await source.save({ useObjectStreams: false }));
  const modified = await PDFDocument.load(await source.save()); modified.getPage(0).drawText("CHANGED", { x: 40, y: 60, size: 18 });
  const damagedPath = path.join(directory, "damaged.pdf"); await writeFile(damagedPath, Buffer.from((await readFile(sourcePath)).toString("latin1").replace(/startxref\s+\d+/, "startxref\n0"), "latin1"));
  const modifiedPath = path.join(directory, "modified.pdf"); await writeFile(modifiedPath, await modified.save());
  assert(GlobalFonts.registerFromPath(path.join(root, "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"), "GhostFixture"), "Load the bundled OCR fixture font");
  const canvas = createCanvas(1200, 1600); const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1200, 1600); ctx.fillStyle = "black"; ctx.font = "64px GhostFixture"; ctx.fillText("GHOST PDF OCR TEST", 80, 180); ctx.font = "48px GhostFixture"; ctx.fillText("Invoice number 12345", 80, 280);
  const png = canvas.toBuffer("image/png"); const pngPath = path.join(directory, "scan.png"); await writeFile(pngPath, png);
  const scanned = await PDFDocument.create(); const image = await scanned.embedPng(png); scanned.addPage([600, 800]).drawImage(image, { x: 0, y: 0, width: 600, height: 800 }); const scannedPath = path.join(directory, "scan.pdf"); await writeFile(scannedPath, await scanned.save());
  const formDoc = await PDFDocument.create(); const formPage = formDoc.addPage([500, 600]); formPage.drawText("Name:", { x: 35, y: 540 }); const form = formDoc.getForm(); const fullName = form.createTextField("Full Name"); fullName.addToPage(formPage, { x: 35, y: 470, width: 250, height: 30 }); const agree = form.createCheckBox("Accept"); agree.addToPage(formPage, { x: 35, y: 420, width: 20, height: 20 }); const formPath = path.join(directory, "form.pdf"); await writeFile(formPath, await formDoc.save());
  async function choose(name, inputs = [sourcePath]) {
    await page.goto(homeUrl, { waitUntil: "networkidle" });
    const card = page.locator("a.tool-card").filter({ has: page.getByText(name, { exact: true }) });
    const href = await card.getAttribute("href"); await card.click();
    await page.waitForURL((url) => url.pathname === href);
    await page.getByRole("heading", { level: 1, name: `${name}.`, exact: true }).waitFor();
    if (inputs.length) await page.locator('input[type="file"][hidden]').first().setInputFiles(inputs);
  }
  async function run(output, timeout = 60000) {
    const waiting = page.waitForEvent("download", { timeout }); waiting.catch(() => {});
    const stop = new AbortController();
    const appError = (async () => { while (!stop.signal.aborted) { const messages = await page.locator(".feedback.error").allTextContents(); if (messages.length) throw Error(messages.join(" ")); await new Promise((resolve) => setTimeout(resolve, 100)); } return new Promise(() => {}); })(); appError.catch(() => {});
    try {
      await page.locator(".process-button").click(); const download = await Promise.race([waiting, appError]); const filename = path.join(directory, output); await download.saveAs(filename); await page.waitForFunction(() => !document.querySelector(".process-button").disabled);
      const bytes = await readFile(filename); if (outputDirectory) await writeFile(path.join(outputDirectory, output), bytes); console.log(`PASS ${output} (${bytes.length} bytes)`); return bytes;
    } finally { stop.abort(); }
  }
  async function getText(bytes, password) {
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), password, standardFontDataUrl: path.join(root, "node_modules/pdfjs-dist/standard_fonts/") });
    try { const doc = await task.promise; const pages = []; for (let n = 1; n <= doc.numPages; n++) { const content = await (await doc.getPage(n)).getTextContent(); pages.push(content.items.filter((item) => "str" in item).map((item) => item.str).join(" ")); } return pages; } finally { await task.destroy(); }
  }
  async function previewReady() { await page.locator(".studio-page>img").waitFor(); await page.locator(".preview-loading").waitFor({ state: "hidden" }); }
  async function box(x1, y1, x2, y2) {
    await previewReady(); await page.locator(".studio-page").scrollIntoViewIfNeeded(); const rect = await page.locator(".studio-page").boundingBox(); assert(rect); await page.mouse.move(rect.x + rect.width * x1, rect.y + rect.height * y1); await page.mouse.down(); await page.mouse.move(rect.x + rect.width * x2, rect.y + rect.height * y2, { steps: 12 }); await page.mouse.up();
  }
  await choose("Split PDF"); const split = await JSZip.loadAsync(await run("split.zip")); assert.equal(Object.keys(split.files).filter((name) => name.endsWith(".pdf")).length, 3);
  await choose("Split PDF"); await page.getByLabel("Split into").selectOption("groups"); await page.getByPlaceholder("1-3; 4-6; 7").fill("3,1;2"); const groups = await JSZip.loadAsync(await run("groups.zip")); assert.equal(Object.keys(groups.files).filter((name) => name.endsWith(".pdf")).length, 2);
  await choose("PDF to JPG"); const images = await JSZip.loadAsync(await run("pages.zip")); assert.equal(Object.keys(images.files).length, 3); assert.equal((await images.file("page-001.jpg").async("uint8array"))[0], 255);
  await choose("PDF to PDF/A"); const archival = await run("pdfa.pdf"); assert.equal((await PDFDocument.load(archival)).getPageCount(), 3);
  await choose("Protect PDF"); await page.getByLabel("New password", { exact: true }).fill("ghost-secret-42"); const encrypted = await run("protected.pdf"); await assert.rejects(() => getText(encrypted), /password/i); await assert.rejects(() => getText(encrypted, "wrong-password"), /password/i); assert.equal((await getText(encrypted, "ghost-secret-42")).length, 3); const protectedPath = path.join(directory, "protected.pdf"); await writeFile(protectedPath, encrypted);
  await choose("Unlock PDF", [protectedPath]); await page.getByLabel("Document password", { exact: true }).fill("ghost-secret-42"); assert.equal((await PDFDocument.load(await run("unlocked.pdf"))).getPageCount(), 3);
  await choose("Repair PDF", [damagedPath]); assert.equal((await PDFDocument.load(await run("repaired.pdf"))).getPageCount(), 3);
  await choose("Scan to PDF", [pngPath]); assert.equal((await PDFDocument.load(await run("scanned.pdf"))).getPageCount(), 1);
  await choose("Compress PDF", [scannedPath]); const compressed = await run("compressed.pdf"); assert(compressed.length <= (await readFile(scannedPath)).length);
  await choose("HTML to PDF", []); await page.getByLabel("HTML source").fill('<h1>GHOST PDF HTML test</h1><p>A private document.</p><script>throw new Error("must not execute")</script>'); assert((await PDFDocument.load(await run("html.pdf"))).getPageCount() >= 1);
  await choose("PDF to Word"); await page.getByLabel("Output mode").selectOption("editable"); const editableWord = await JSZip.loadAsync(await run("editable.docx")); assert((await editableWord.file("word/document.xml").async("text")).includes("SECRET ACCOUNT 1234"));
  await choose("PDF to PowerPoint"); await page.getByLabel("Output mode").selectOption("editable"); const editableSlides = await JSZip.loadAsync(await run("editable.pptx")); assert((await editableSlides.file("ppt/slides/slide1.xml").async("text")).includes("SECRET ACCOUNT 1234"));
  await choose("PDF to Markdown"); assert((await run("document.md")).toString().includes("SECRET ACCOUNT 1234"));
  await choose("Summarize PDF"); assert((await run("summary.md")).toString().includes("Key-sentence digest"));
  await choose("Compare PDF", [sourcePath, modifiedPath]); assert.equal((await PDFDocument.load(await run("comparison.pdf"))).getPageCount(), 3); assert((await page.locator(".feedback.success").textContent()).includes("1 of 3 pages"));
  await choose("Edit PDF"); await previewReady(); await page.getByRole("button", { name: "Add text", exact: true }).click(); await page.getByLabel("Annotation text").fill("APPROVED"); await page.locator(".studio-page").scrollIntoViewIfNeeded(); const rect = await page.locator(".studio-page").boundingBox(); await page.mouse.click(rect.x + rect.width * .2, rect.y + rect.height * .7); assert.equal(await page.locator(".studio-mark").count(), 1); assert.equal((await PDFDocument.load(await run("edited.pdf"))).getPageCount(), 3);
  await choose("Redact PDF"); await box(.04, .16, .95, .29); assert.equal(await page.locator(".studio-mark").count(), 1); const redacted = await run("redacted.pdf"); assert(!(await getText(redacted)).join(" ").includes("SECRET"));
  await choose("PDF Forms", [formPath]); await page.getByLabel("Full Name", { exact: true }).fill("GHOST TEST"); await page.getByLabel("Accept", { exact: true }).check(); await box(.1, .65, .55, .72); await page.getByLabel("Field name", { exact: true }).fill("New Field"); const filled = await PDFDocument.load(await run("forms.pdf")); assert.equal(filled.getForm().getTextField("Full Name").getText(), "GHOST TEST"); assert(filled.getForm().getCheckBox("Accept").isChecked()); assert(filled.getForm().getField("New Field"));
  await choose("Crop PDF"); await box(.1, .1, .8, .8); const cropped = await PDFDocument.load(await run("visual-crop.pdf")); assert(Math.abs(cropped.getPage(0).getCropBox().width - 210) < 2);
  await choose("OCR PDF", [scannedPath]); const recognized = await run("ocr.pdf", 120000); const recognizedText = (await getText(recognized)).join(" "); assert(recognizedText.toUpperCase().includes("GHOST"), `Expected searchable OCR text; received: ${JSON.stringify(recognizedText)}`);
  await choose("Images to PDF", [pngPath]); await page.getByLabel("Page orientation").selectOption("landscape"); const landscape = await PDFDocument.load(await run("landscape.pdf")); assert(landscape.getPage(0).getWidth() > landscape.getPage(0).getHeight());
  await choose("Watermark PDF"); await page.locator('.watermark-image-option input[type="file"]').setInputFiles(pngPath); const watermarkPdf = await run("image-watermark.pdf"); assert.equal((await PDFDocument.load(watermarkPdf)).getPageCount(), 3);
  await choose("Sign PDF"); await page.getByRole("button", { name: "Upload", exact: true }).click(); await page.locator('.image-upload input[type="file"]').setInputFiles(pngPath); const signed = await run("image-signed.pdf"); assert.equal((await PDFDocument.load(signed)).getPageCount(), 3);
  await choose("Organize PDF"); await page.locator(".page-thumbnail").first().waitFor(); await page.getByLabel("New page order").fill("3,1"); const reordered = await run("organized.pdf"); const reorderedText = await getText(reordered); assert.equal(reorderedText.length, 2); assert(reorderedText[0].includes("PAGE 3"));
  await choose("Rotate PDF"); await page.locator(".workflow-panel summary").click(); await page.getByLabel("Apply a finishing workflow", { exact: true }).check(); await page.getByLabel("Then rotate every page").selectOption("90"); await page.getByLabel("Then add a watermark", { exact: true }).fill("GHOST WORKFLOW"); await page.getByRole("button", { name: "Save workflow", exact: true }).click(); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("ghost-pdf-workflow")).watermark), "GHOST WORKFLOW"); const finished = await run("workflow.pdf"); assert((await getText(finished))[0].includes("GHOST WORKFLOW"));
  console.log("PASS image orientation, image watermark, uploaded signature, page organization, and saved finishing workflow");
  await choose("Translate PDF");
  const translationNotice = page.locator(".advanced-options .inline-note").filter({ hasText: /Private translation is unavailable|Your browser translates on-device/ });
  await translationNotice.waitFor({ state: "visible" });
  const translationUnavailable = (await translationNotice.textContent()).includes("unavailable");
  await page.waitForFunction((unavailable) => document.querySelector(".process-button").disabled === unavailable, translationUnavailable);
  assert.equal(await page.locator(".process-button").isDisabled(), translationUnavailable);
  if (!translationUnavailable) console.log("INFO native translation available; browser-managed language download requires a real language pack for end-to-end verification");
  const stalledBrowser = await context.newPage();
  await stalledBrowser.addInitScript(() => { Object.defineProperty(globalThis, "Translator", { configurable: true, value: { availability: () => new Promise(() => {}) } }); });
  await stalledBrowser.goto(new URL("tools/translate-pdf/", homeUrl).href, { waitUntil: "networkidle" });
  await stalledBrowser.locator('input[type="file"][hidden]').first().setInputFiles(sourcePath);
  await stalledBrowser.getByText(/Private translation is unavailable/).waitFor({ state: "visible", timeout: 15000 });
  assert(await stalledBrowser.locator(".process-button").isDisabled());
  await stalledBrowser.close(); console.log("PASS stalled browser translation capability falls back without hanging the workspace");
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await page.getByRole("button", { name: "Toggle navigation" }).click(); assert.equal(await page.getByRole("button", { name: "Toggle navigation" }).getAttribute("aria-expanded"), "true");
  assert.deepEqual(errors, []); console.log("PASS visual editor, irreversible redaction, forms, visual crop, OCR, translation capability messaging, and mobile navigation");
} catch (error) {
  // Surface the actual browser/assertion failure in public CI annotations.
  if (process.env.GITHUB_ACTIONS) {
    const detail = (error instanceof Error ? error.stack || error.message : String(error)).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
    console.error(`::error title=PDF toolkit verification failed::${detail}`);
  }
  throw error;
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
