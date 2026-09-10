import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import PptxGenJS from "pptxgenjs";
import * as XLSX from "xlsx";

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name", "Total"], ["GT PDF", 21]]), "Tools");
const workbookBytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const workbookCheck = XLSX.read(workbookBytes, { type: "buffer" });
if (XLSX.utils.sheet_to_json(workbookCheck.Sheets.Tools, { header: 1 })[1][1] !== 21) throw new Error("Excel conversion smoke test failed.");

const docx = new JSZip();
docx.file("[Content_Types].xml", "<Types/>");
docx.folder("word").file("document.xml", "<w:document xmlns:w='word'><w:body><w:p><w:r><w:t>GT PDF Word test</w:t></w:r></w:p></w:body></w:document>");
const docxBytes = await docx.generateAsync({ type: "nodebuffer" });
const docxCheck = await JSZip.loadAsync(docxBytes);
if (!(await docxCheck.file("word/document.xml").async("text")).includes("GT PDF Word test")) throw new Error("Word conversion smoke test failed.");

const presentation = new PptxGenJS();
presentation.addSlide().addText("GT PDF PowerPoint test", { x: 1, y: 1, w: 6, h: 1 });
const pptxBytes = await presentation.write({ outputType: "nodebuffer" });
const pptxCheck = await JSZip.loadAsync(pptxBytes);
if (!pptxCheck.file("ppt/slides/slide1.xml")) throw new Error("PowerPoint conversion smoke test failed.");

const source = await PDFDocument.create();
const font = await source.embedFont(StandardFonts.Helvetica);
source.addPage().drawText("GT PDF extraction test", { x: 40, y: 700, size: 14, font });
const pdfBytes = await source.save();
const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
const content = await (await pdf.getPage(1)).getTextContent();
if (!content.items.some((item) => "str" in item && item.str.includes("GT PDF extraction test"))) throw new Error("PDF extraction smoke test failed.");

console.log("Office conversion engine passed: Excel, Word, PowerPoint, and PDF extraction primitives.");
