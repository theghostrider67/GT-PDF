import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PDFDocument, PDFName } from "pdf-lib";
import JSZip from "jszip";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "out"), base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const headers = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8")).headers[0].headers;
const mime = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
let canaryRequests = 0;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"); if (url.pathname.includes("security-canary")) canaryRequests++;
    let pathname = decodeURIComponent(url.pathname); if (base && pathname.startsWith(base + "/")) pathname = pathname.slice(base.length);
    const target = path.resolve(out, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
    if (!target.startsWith(out + path.sep)) { res.writeHead(403).end(); return; }
    for (const { key, value } of headers) res.setHeader(key, value);
    res.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
    const data = await readFile(target); res.setHeader("Content-Length", data.length); res.end(req.method === "HEAD" ? undefined : data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const home = `http://127.0.0.1:${server.address().port}${base}/`;
const directory = await mkdtemp(path.join(tmpdir(), "ghost-security-"));
let browser, embeddingServer;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  const errors = [], external = []; let dialogs = 0;
  page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (dialog) => { dialogs++; void dialog.dismiss(); });
  await page.route("**/*", async (route) => { if (new URL(route.request().url()).origin === new URL(home).origin) await route.continue(); else { external.push(route.request().url()); await route.abort(); } });
  await page.goto(home, { waitUntil: "networkidle" }); assert.equal(await page.locator("a.tool-card").count(), 38);
  const response = await page.request.get(home); assert.equal(response.headers()["x-frame-options"], "DENY"); assert.equal(response.headers()["x-content-type-options"], "nosniff"); assert(response.headers()["content-security-policy"].includes("frame-ancestors 'none'"));
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  const scripts = policy.split(";").find((part) => part.trim().startsWith("script-src "));
  assert(scripts.includes("sha256-") && !scripts.includes("'unsafe-inline'"));
  await page.evaluate(() => { const script = document.createElement("script"); script.textContent = "globalThis.__ghostInlineExecuted = true"; document.head.append(script); const image = document.createElement("img"); image.setAttribute("onerror", "globalThis.__ghostHandlerExecuted = true"); image.src = "data:image/png;base64,invalid"; document.body.append(image); });
  await page.waitForTimeout(150); assert.equal(await page.evaluate(() => Boolean(globalThis.__ghostInlineExecuted || globalThis.__ghostHandlerExecuted)), false);
  console.log("PASS deployed headers, strict hashed inline scripts, event-handler blocking, and normal hydration");
  const source = await PDFDocument.create(); const sheet = source.addPage([400, 500]); sheet.drawText("SECRET ACCOUNT 1234", { x: 30, y: 350 }); source.setTitle("PRIVATE DOCUMENT TITLE"); source.addJavaScript("probe", "globalThis.__ghostPdfScriptExecuted = true"); await source.attach(new Uint8Array([83, 69, 67, 82, 69, 84]), "private.txt"); const pdf = Buffer.from(await source.save());
  async function choose(name, input) {
    await page.goto(home, { waitUntil: "networkidle" }); const card = page.locator("a.tool-card").filter({ has: page.getByText(name, { exact: true }) }); const href = await card.getAttribute("href"); await card.click(); await page.waitForURL((url) => url.pathname === href); await page.getByRole("heading", { level: 1, name: `${name}.`, exact: true }).waitFor();
    if (input) await page.locator('input[type="file"][hidden]').first().setInputFiles(input);
  }
  async function error(pattern) { await page.locator(".feedback.error").filter({ hasText: pattern }).waitFor({ timeout: 15000 }); }
  async function run(name) {
    const pending = page.waitForEvent("download", { timeout: 60000 }); pending.catch(() => {}); await page.locator(".process-button").click(); const dl = await pending; const file = path.join(directory, name); await dl.saveAs(file); await page.waitForFunction(() => !document.querySelector(".process-button").disabled); return readFile(file);
  }
  await choose("Rotate PDF", { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>not a PDF</script>") }); await error(/valid PDF header/); assert.equal(await page.locator(".studio-page>img").count(), 0);
  await page.locator('input[type="file"][hidden]').first().setInputFiles({ name: 'evil"><svg onload=__ghostFilenameExecuted=1>.pdf', mimeType: "application/pdf", buffer: pdf });
  await page.locator(".file-name").waitFor(); assert.equal(await page.locator(".file-name svg,.file-name img,[onload]").count(), 0); assert.equal(await page.evaluate(() => Boolean(globalThis.__ghostFilenameExecuted)), false); assert.equal((await PDFDocument.load(await run("recovered.pdf"))).getPage(0).getRotation().angle, 90);
  assert.equal(await page.evaluate(() => Boolean(globalThis.__ghostPdfScriptExecuted)), false);
  console.log("PASS spoofed PDFs rejected before preview; hostile filenames remain text; valid-file recovery works");
  const zip = new JSZip(); zip.file("[Content_Types].xml", "<Types/>"); zip.file("word/document.xml", '<!DOCTYPE document [<!ENTITY x "unsafe">]><document>&x;</document>');
  await choose("Word to PDF", { name: "entities.docx", mimeType: "application/octet-stream", buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) }); await error(/entity declarations/);
  const png = Buffer.alloc(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]); png.writeUInt32BE(0x49484452, 12); png.writeUInt32BE(100000, 16); png.writeUInt32BE(100000, 20);
  await choose("Images to PDF", { name: "pixels.png", mimeType: "image/png", buffer: png }); await error(/40 megapixels/);
  console.log("PASS dangerous XML and oversized image headers rejected before document engines run");
  await choose("HTML to PDF");
  await page.getByLabel("HTML source").fill(`<h1>Safe heading</h1><script>parent.__ghostHtmlExecuted=true</script><style>@import '${home}security-canary';</style><div style="background-image:url('${home}security-canary');font-size:20px">Visible content</div><img src="${home}security-canary" onerror="parent.__ghostHtmlExecuted=true"><svg><image href="${home}security-canary"/></svg><form action="https://example.invalid/steal"><input name="data" value="secret"></form><iframe src="https://example.invalid/"></iframe>`);
  assert((await PDFDocument.load(await run("safe-html.pdf"))).getPageCount() >= 1); assert.equal(await page.evaluate(() => Boolean(globalThis.__ghostHtmlExecuted)), false); assert.equal(canaryRequests, 0); assert.equal(await page.locator("iframe").count(), 0);
  await page.getByLabel("HTML source").fill('<div style="height:9999em">Too tall</div>'); await page.locator(".process-button").click(); await error(/100-page/); assert.equal(await page.locator("iframe").count(), 0);
  console.log("PASS HTML scripts, stylesheets, URL fetches, forms and frames cannot escape; overlong output is bounded");
  await choose("Protect PDF", { name: "private.pdf", mimeType: "application/pdf", buffer: pdf }); await page.getByLabel("New password", { exact: true }).fill("short"); await page.locator(".process-button").click(); await error(/8–1,024/);
  const password = "private-test-password-42"; await page.getByLabel("New password", { exact: true }).fill(password); await run("protected.pdf"); const storage = await page.evaluate(() => JSON.stringify(localStorage)); assert(!storage.includes(password) && !storage.includes("SECRET ACCOUNT") && !storage.includes("PRIVATE DOCUMENT TITLE"));
  await choose("Redact PDF", { name: "private.pdf", mimeType: "application/pdf", buffer: pdf }); await page.locator(".studio-page>img").waitFor(); await page.locator(".preview-loading").waitFor({ state: "hidden" }); await page.locator(".studio-page").scrollIntoViewIfNeeded(); const box = await page.locator(".studio-page").boundingBox(); await page.mouse.move(box.x + box.width * .01, box.y + box.height * .01); await page.mouse.down(); await page.mouse.move(box.x + box.width * .99, box.y + box.height * .99, { steps: 15 }); await page.mouse.up();
  const redacted = await PDFDocument.load(await run("redacted.pdf")); assert.equal(redacted.getTitle(), undefined); assert.equal(redacted.catalog.get(PDFName.of("Names")), undefined); assert.equal(redacted.getForm().getFields().length, 0);
  console.log("PASS password validation, no sensitive localStorage persistence, and redaction removes metadata/attachments/forms");
  embeddingServer = createServer((req, res) => { res.setHeader("Content-Type", "text/html"); res.end(`<iframe src="${home}"></iframe>`); }); await new Promise((resolve) => embeddingServer.listen(0, "127.0.0.1", resolve));
  const outer = await browser.newPage(); const cspErrors = []; outer.on("console", (m) => cspErrors.push(m.text())); await outer.goto(`http://127.0.0.1:${embeddingServer.address().port}/`, { waitUntil: "networkidle" });
  assert(cspErrors.some((text) => /frame-ancestors|X-Frame-Options|refused to (?:frame|display)/i.test(text))); await outer.close();
  assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.equal(dialogs, 0);
  console.log("PASS cross-origin framing is blocked and adversarial tests produce no external requests or script execution");
} catch (error) {
  if (process.env.GITHUB_ACTIONS) console.error(`::error title=Security regression failed::${String(error.stack || error).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`);
  throw error;
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); if (embeddingServer) await new Promise((resolve) => embeddingServer.close(resolve)); await rm(directory, { recursive: true, force: true }); }
