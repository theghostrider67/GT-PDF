import { degrees, PDFDocument, StandardFonts } from "pdf-lib";

const first = await PDFDocument.create();
first.addPage([300, 400]);
first.addPage([300, 400]);
const firstBytes = await first.save();

const second = await PDFDocument.create();
second.addPage([420, 300]);
const secondBytes = await second.save();

const merged = await PDFDocument.create();
for (const bytes of [firstBytes, secondBytes]) {
  const source = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(source, source.getPageIndices());
  pages.forEach((page) => merged.addPage(page));
}
const mergedBytes = await merged.save();
const mergedCheck = await PDFDocument.load(mergedBytes);
if (mergedCheck.getPageCount() !== 3) throw new Error("Merge smoke test failed.");

const extracted = await PDFDocument.create();
const extractedPages = await extracted.copyPages(mergedCheck, [0, 2]);
extractedPages.forEach((page) => extracted.addPage(page));
if ((await PDFDocument.load(await extracted.save())).getPageCount() !== 2) throw new Error("Extract smoke test failed.");

mergedCheck.getPages().forEach((page) => page.setRotation(degrees(90)));
if (mergedCheck.getPage(0).getRotation().angle !== 90) throw new Error("Rotate smoke test failed.");

const font = await mergedCheck.embedFont(StandardFonts.Helvetica);
mergedCheck.getPages().forEach((page, index) => page.drawText(String(index + 1), { x: 20, y: 20, size: 11, font }));
const finalBytes = await mergedCheck.save();
if (!finalBytes.length) throw new Error("Annotation smoke test failed.");

console.log("PDF engine smoke test passed: merge, extract, rotate, number/watermark primitives.");
