import assert from "node:assert/strict";
import test from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { insetCropBox, parsePageSequence, pdfTextRows, wrapText } from "../lib/pdf-utils.ts";
import { presentationSlidePaths, slideParagraphs, wordParagraphs } from "../lib/office-utils.ts";

globalThis.DOMParser = DOMParser;
const wordNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const drawingNS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const presentationNS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const relationshipNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

test("invalid or empty page selections are rejected before PDF creation", () => {
  for (const range of ["", " ", ",", ", ,", "1,", ",1", "1,,2", "0", "4", "1-4", "-1", "1.5", "NaN"]) {
    assert.throws(() => parsePageSequence(range, 3), Error, range);
  }
});

test("descending ranges and explicit repeated pages keep the requested order", async () => {
  assert.deepEqual(parsePageSequence("3-1, 2", 3), [2, 1, 0]);
  const indices = parsePageSequence("3-1, 2", 3, false);
  assert.deepEqual(indices, [2, 1, 0, 1]);
  const source = await PDFDocument.create();
  [100, 200, 300].forEach((width) => source.addPage([width, 400]));
  const output = await PDFDocument.create();
  (await output.copyPages(source, indices)).forEach((page) => output.addPage(page));
  const check = await PDFDocument.load(await output.save());
  assert.deepEqual(check.getPages().map((page) => page.getWidth()), [300, 200, 100, 200]);
});

test("cropping respects existing crop and media box origins", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  page.setMediaBox(50, 70, 600, 800);
  page.setCropBox(100, 120, 400, 600);
  for (let count = 0; count < 2; count++) {
    const { x, y, width, height } = insetCropBox(page.getCropBox(), 24);
    page.setCropBox(x, y, width, height);
  }
  const check = await PDFDocument.load(await pdf.save());
  assert.deepEqual(check.getPage(0).getCropBox(), { x: 148, y: 168, width: 304, height: 504 });
  assert.deepEqual(insetCropBox({ x: 50, y: 70, width: 20, height: 10 }, 72),
    { x: 52.5, y: 72.5, width: 15, height: 5 });
});

const item = (str, x, y, width, height = 12) => ({ str, transform: [12, 0, 0, 12, x, y], width, height });

test("PDF table columns survive extraction and nearby text stays in the same cell", () => {
  const rows = pdfTextRows([
    item("42", 260, 499, 20), item("Total", 40, 500, 30),
    item("report", 79, 480, 32), item("Annual", 40, 481, 35),
    item(" ", 112, 480, 3), item("99", 260, 480, 20),
  ]);
  assert.deepEqual(rows, [["Total", "42"], ["Annual report", "99"]]);
});

test("missing PDF table cells do not shift later values into earlier columns", () => {
  const rows = pdfTextRows([
    item("Product", 40, 500, 45), item("Price", 160, 500, 30), item("Count", 260, 500, 35),
    item("2", 270, 480, 10), item("Alpha", 40, 460, 35), item("10", 170, 460, 10),
  ]);
  assert.deepEqual(rows, [["Product", "Price", "Count"], ["", "", "2"], ["Alpha", "10"]]);
});

test("long tokens and titles wrap within the page without truncating characters", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const measure = (text) => font.widthOfTextAtSize(text, 10);
  const token = "W".repeat(240);
  const lines = wrapText(token, 180, measure);
  assert.equal(lines.join(""), token);
  assert(lines.every((line) => measure(line) <= 180));
  assert.deepEqual(wrapText("hello world", 180, measure), ["hello world"]);
  assert.deepEqual(wrapText("   ", 180, measure), [""]);
});

test("Word text is read by namespace instead of a hardcoded prefix", () => {
  const xml = `<doc:document xmlns:doc="${wordNS}"><doc:body><doc:p><doc:r><doc:t>Hello </doc:t></doc:r><doc:r><doc:t>world</doc:t></doc:r></doc:p><doc:p><doc:r><doc:t>Second paragraph</doc:t></doc:r></doc:p></doc:body></doc:document>`;
  assert.deepEqual(wordParagraphs(xml), ["Hello world", "Second paragraph"]);
});

test("PowerPoint text runs stay together within each paragraph", () => {
  const xml = `<slide xmlns:d="${drawingNS}"><d:p><d:r><d:t>Bold </d:t></d:r><d:r><d:t>text</d:t></d:r></d:p><d:p><d:r><d:t>Next line</d:t></d:r></d:p></slide>`;
  assert.deepEqual(slideParagraphs(xml), ["Bold text", "Next line"]);
});

const presentation = `<p:presentation xmlns:p="${presentationNS}" xmlns:r="${relationshipNS}"><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`;
const relationships = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${relationshipNS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId9" Type="${relationshipNS}/slide" Target="/ppt/slides/slide3.xml"/><Relationship Id="unused" Type="${relationshipNS}/slide" Target="slides/slide2.xml"/></Relationships>`;

test("slides follow presentation order and unreferenced slides are excluded", () => {
  assert.deepEqual(presentationSlidePaths(presentation, relationships), ["ppt/slides/slide3.xml", "ppt/slides/slide1.xml"]);
});

test("missing or external slide relationships produce a useful error", () => {
  assert.throws(() => presentationSlidePaths(presentation, "<Relationships/>"), /missing slide relationship/);
  assert.throws(() => presentationSlidePaths(presentation, relationships.replace('Target="/ppt/slides/slide3.xml"', 'TargetMode="External" Target="https://example.com/slide3.xml"')), /missing slide relationship/);
});
