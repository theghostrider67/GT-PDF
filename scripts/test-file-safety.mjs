import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { FILE_LIMITS, assertBatchSize, assertFileSize, assertPageCount, assertPageGeometry, validateImageFile, validateInputFile } from "../lib/file-safety.ts";
import { parsePageSequence, pdfTextRows, wrapText } from "../lib/pdf-utils.ts";

async function office(xml = "<document/>", extras = {}) {
  const zip = new JSZip(); zip.file("[Content_Types].xml", "<Types/>"); zip.file("word/document.xml", xml);
  for (const [name, value] of Object.entries(extras)) zip.file(name, value);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
const file = (bytes, name = "test.docx") => new File([bytes], name);
test("rejects oversized and empty files before reading their contents", () => {
  let read = false; const oversized = { name: "huge.pdf", size: FILE_LIMITS.fileBytes + 1, arrayBuffer() { read = true; throw Error("Must not read"); } };
  assert.throws(() => assertFileSize(oversized), /50 MB/); assert.equal(read, false);
  assert.throws(() => assertFileSize({ name: "empty.pdf", size: 0 }), /non-empty/);
  assert.throws(() => assertBatchSize(Array(21).fill({ name: "a.pdf", size: 1 })), /20 files/);
  assert.throws(() => assertBatchSize(Array(4).fill({ name: "a.pdf", size: FILE_LIMITS.fileBytes })), /150 MB/);
});
test("checks file signatures and image dimensions before rendering", async () => {
  await assert.rejects(() => validateInputFile(file("<html>not a PDF</html>", "spoof.pdf"), "pdf-word"), /PDF header/);
  await assert.rejects(() => validateInputFile(file("not an XLS file", "spoof.xls"), "excel-pdf"), /XLS workbook/);
  await assert.rejects(() => validateImageFile(file('<svg xmlns="http://www.w3.org/2000/svg"/>', "spoof.png")), /valid JPG or PNG/);
  const png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]); const data = new DataView(png.buffer); data.setUint32(12, 0x49484452); data.setUint32(16, 100000); data.setUint32(20, 100000);
  await assert.rejects(() => validateImageFile(file(png, "bomb.png")), /40 megapixels/);
  await assert.rejects(async () => validateInputFile(file(await office("<document/>", { "word/media/image.png": png })), "word-pdf"), /40 megapixels/);
  const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 0]); await assert.rejects(() => validateImageFile(file(jpeg, "loop.jpg")), /valid JPG or PNG/);
});
test("accepts valid Office archives and ordinary external hyperlinks", async () => {
  await validateInputFile(file(await office()), "word-pdf");
  await validateInputFile(file(await office("<document/>", { "word/_rels/document.xml.rels": '<Relationships><Relationship TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com"/></Relationships>' })), "word-pdf");
});
test("rejects XML entity expansion in UTF-8 and UTF-16 Office parts", async () => {
  const payload = '<!DOCTYPE document [<!ENTITY x "test">]><document>&x;</document>';
  await assert.rejects(async () => validateInputFile(file(await office(payload)), "word-pdf"), /entity declarations/);
  const utf16 = Buffer.concat([Buffer.from([255, 254]), Buffer.from(payload, "utf16le")]);
  await assert.rejects(async () => validateInputFile(file(await office(utf16)), "word-pdf"), /entity declarations/);
});
test("blocks linked Office resources, including entity-encoded attributes", async () => {
  const rel = '<Relationships><Relationship TargetMode="&#x45;xternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/tracker"/></Relationships>';
  await assert.rejects(async () => validateInputFile(file(await office("<document/>", { "word/_rels/document.xml.rels": rel })), "word-pdf"), /external resources/);
  await assert.rejects(async () => validateInputFile(file(await office('<image src="http://127.0.0.1/private"/>')), "word-pdf"), /external resources/);
  await assert.rejects(async () => validateInputFile(file(await office("<document/>", { "word/vbaProject.bin": "macro" })), "word-pdf"), /Macro/);
});
test("detects compression bombs and false ZIP expanded sizes while streaming", async () => {
  await assert.rejects(async () => validateInputFile(file(await office("A".repeat(2_000_000))), "word-pdf"), /safety limits/);
  const data = Buffer.from(await office("A".repeat(500_000)));
  let offset = 0;
  while ((offset = data.indexOf(Buffer.from([80, 75, 1, 2]), offset)) !== -1) {
    const nameLength = data.readUInt16LE(offset + 28), name = data.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === "word/document.xml") { data.writeUInt32LE(8, offset + 24); break; } offset += 4;
  }
  await assert.rejects(() => validateInputFile(file(data), "word-pdf"), /declared expanded size/);
});
test("rejects unsafe paths, corrupted entries and truncated ZIPs", async () => {
  const paths = Buffer.from(await office("<document/>", { "evilxxx.xml": "bad" }));
  for (let at = 0; (at = paths.indexOf("evilxxx.xml", at)) !== -1; at += 11) paths.write("../xxxx.xml", at);
  await assert.rejects(() => validateInputFile(file(paths), "word-pdf"), /unsafe/);
  const zip = await office(); await assert.rejects(() => validateInputFile(file(zip.subarray(0, zip.length - 5)), "word-pdf"), /complete ZIP/);
  const corrupt = new Uint8Array(zip); corrupt[45] ^= 255;
  await assert.rejects(() => validateInputFile(file(corrupt), "word-pdf"));
});
test("bounded archive mutation fuzzing always terminates", async () => {
  const original = await office();
  for (let i = 0; i < 80; i++) {
    const changed = original.slice(); const index = (i * 31 + 13) % changed.length; changed[index] ^= (i % 255) + 1;
    try { await validateInputFile(file(changed), "word-pdf"); } catch (error) { assert(error instanceof Error); }
  }
});
test("bounds page counts, geometry, huge ranges and duplicate selections", () => {
  for (const count of [0, Infinity, NaN, 501, 1.5]) assert.throws(() => assertPageCount(count));
  for (const size of [[0, 20], [Infinity, 20], [20, 100000]]) assert.throws(() => assertPageGeometry(...size));
  for (const range of ["1-999999999999999999999999", "1".repeat(5000), Array(30).fill("1-500").join(",")]) assert.throws(() => parsePageSequence(range, 500, false));
  for (let i = 0; i < 1000; i++) {
    const text = Array.from({ length: i % 19 }, (_, j) => String.fromCharCode(32 + ((i * 37 + j * 17) % 95))).join("");
    try { const result = parsePageSequence(text, 50, false); assert(result.length <= 1000 && result.every((n) => n >= 0 && n < 50)); } catch (error) { assert(error instanceof Error); }
  }
});
test("text grouping scales to long documents and zero-width tokens stay bounded", () => {
  const rows = pdfTextRows(Array.from({ length: 10000 }, (_, n) => ({ str: `Row ${n}`, transform: [1, 0, 0, 1, 20, 100000 - n * 10], width: 20, height: 8 })));
  assert.equal(rows.length, 10000); assert.equal(rows.at(-1)[0], "Row 9999");
  const token = "\u200b".repeat(10000); const lines = wrapText(token, 200, () => 0); assert.equal(lines.join(""), token); assert(lines.every((line) => line.length <= 500));
});
