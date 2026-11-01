import { openLocalPdf } from "./pdf-render";
import { pdfTextRows } from "./pdf-utils";
import type { ToolResult } from "./studio-types";
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
export async function editableOfficeExport(file: File, kind: "pdf-word" | "pdf-powerpoint", base = ""): Promise<ToolResult> {
  const opened = await openLocalPdf(file, base); const name = file.name.replace(/\.pdf$/i, "");
  let hasText = false;
  try {
    if (kind === "pdf-powerpoint") {
      const PptxGenJS = (await import("pptxgenjs")).default; const deck = new PptxGenJS();
      const first = (await opened.document.getPage(1)).getViewport({ scale: 1 }); const width = first.width / 72, height = first.height / 72;
      deck.defineLayout({ name: "PDF_TEXT", width, height }); deck.layout = "PDF_TEXT"; deck.author = "GHOST PDF";
      for (let n = 1; n <= opened.document.numPages; n++) {
        const page = await opened.document.getPage(n); const viewport = page.getViewport({ scale: 1 }); const content = await page.getTextContent(); const slide = deck.addSlide();
        const fit = Math.min(width / viewport.width, height / viewport.height), left = (width - viewport.width * fit) / 2, top = (height - viewport.height * fit) / 2;
        for (const item of content.items) if ("str" in item && item.str.trim()) {
          hasText = true; const point = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          slide.addText(item.str, { x: left + point[0] * fit, y: Math.max(0, top + (point[1] - item.height) * fit), w: Math.max(.05, item.width * fit + .04), h: Math.max(.08, item.height * fit * 1.5), fontFace: "Arial", fontSize: Math.max(4, item.height * fit * 72), margin: 0, color: "20202B", breakLine: false, fit: "shrink" });
        }
      }
      if (!hasText) throw new Error("This PDF has no selectable text. Run OCR PDF before creating editable slides.");
      return { output: await deck.write({ outputType: "uint8array", compression: true }) as Uint8Array, filename: `${name}-editable.pptx`, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", detail: "Editable text boxes created. Images, complex formatting, and original fonts are not reproduced." };
    }
    const { default: JSZip } = await import("jszip"); const zip = new JSZip(); const body: string[] = []; let finalSection = "";
    const paragraph = (text: string) => `<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`;
    for (let n = 1; n <= opened.document.numPages; n++) {
      const page = await opened.document.getPage(n); const viewport = page.getViewport({ scale: 1 }); const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => "str" in item);
      const rows = pdfTextRows(items); hasText ||= rows.some((row) => row.some((cell) => cell.trim()));
      const columns = Math.max(0, ...rows.map((row) => row.length));
      if (columns > 1) body.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${Array(columns).fill('<w:gridCol w:w="2400"/>').join("")}</w:tblGrid>${rows.map((row) => `<w:tr>${Array.from({ length: columns }, (_, i) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraph(row[i] || "")}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`);
      else body.push(...rows.map((row) => paragraph(row.join(" "))));
      const scale = Math.min(1, 1584 / Math.max(viewport.width, viewport.height));
      finalSection = `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${Math.round(viewport.width * scale * 20)}" w:h="${Math.round(viewport.height * scale * 20)}"/><w:pgMar w:top="480" w:bottom="480" w:left="480" w:right="480"/></w:sectPr>`;
      if (n < opened.document.numPages) body.push(`<w:p><w:pPr>${finalSection}</w:pPr></w:p>`);
    }
    if (!hasText) throw new Error("This PDF has no selectable text. Run OCR PDF before creating editable Word text.");
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}${finalSection}</w:body></w:document>`);
    return { output: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), filename: `${name}-editable.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", detail: "Editable text and simple tables created. Images, fonts, and complex layout are not reproduced." };
  } finally { await opened.close(); }
}
