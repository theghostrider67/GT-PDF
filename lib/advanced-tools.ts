import { PDFDocument, StandardFonts, rgb, degrees, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import { canvasBytes, openLocalPdf, readDocumentText, renderLocalPage } from "./pdf-render";
import { parsePageSequence, pdfTextRows } from "./pdf-utils";
import { keySentenceDigest, type LocalSummarizer, type LocalTranslator } from "./document-intelligence";
import type { AdvancedOptions, Mark, ToolResult } from "./studio-types";
import type { ToolId } from "./tools";

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-") || "document";
const encoded = (text: string) => new TextEncoder().encode(text);
const htmlEscape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const imageFor = (dataUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("This image could not be read.")); image.src = dataUrl; });
export async function paintMarks(context: CanvasRenderingContext2D, marks: Mark[], width: number, height: number) {
  for (const mark of marks) {
    const x = mark.x * width, y = mark.y * height, w = mark.width * width, h = mark.height * height;
    context.save(); context.fillStyle = mark.color || "#141827"; context.strokeStyle = mark.color || "#6554e8";
    context.lineWidth = Math.max(2, width / 450); context.lineCap = "round"; context.lineJoin = "round";
    if (mark.kind === "redact") { context.fillStyle = "#000"; context.fillRect(x, y, w, h); }
    else if (mark.kind === "highlight") { context.globalAlpha = .32; context.fillStyle = mark.color || "#ffcf4b"; context.fillRect(x, y, w, h); }
    else if (mark.kind === "rectangle") context.strokeRect(x, y, w, h);
    else if (mark.kind === "text") { context.font = `500 ${Math.max(10, (mark.size || .025) * width)}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`; context.textBaseline = "top"; context.fillText(mark.text || "", x, y, width - x); }
    else if (mark.kind === "image" && mark.dataUrl) context.drawImage(await imageFor(mark.dataUrl), x, y, w, h);
    else if (mark.kind === "draw" && mark.points?.length) { context.beginPath(); mark.points.forEach((p, i) => i ? context.lineTo(p.x * width, p.y * height) : context.moveTo(p.x * width, p.y * height)); context.stroke(); }
    context.restore();
  }
}
export async function renderEditedPdf(file: File, marks: Mark[], base = "", quality = .94, edge = 2200, progress?: (text: string) => void) {
  const opened = await openLocalPdf(file, base); const output = await PDFDocument.create();
  output.setCreator("GHOST PDF");
  try {
    for (let n = 1; n <= opened.document.numPages; n++) {
      progress?.(`Rendering page ${n} of ${opened.document.numPages}…`);
      const rendered = await renderLocalPage(await opened.document.getPage(n), edge);
      await paintMarks(rendered.context, marks.filter((mark) => mark.page === n - 1), rendered.canvas.width, rendered.canvas.height);
      const image = await output.embedJpg(await canvasBytes(rendered.canvas, "image/jpeg", quality));
      output.addPage([rendered.width, rendered.height]).drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
      rendered.canvas.width = rendered.canvas.height = 0;
    }
    return await output.save();
  } finally { await opened.close(); }
}
export async function textPagesPdf(pages: string[], title: string) {
  const pdf = await PDFDocument.create(); pdf.setCreator("GHOST PDF"); pdf.setTitle(title);
  const canvas = document.createElement("canvas"); canvas.width = 1190; canvas.height = 1684;
  const context = canvas.getContext("2d"); if (!context) throw new Error("This browser cannot render document text.");
  const finish = async () => { const image = await pdf.embedPng(await canvasBytes(canvas)); pdf.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 }); };
  const reset = () => { context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#172033"; context.font = "25px Arial, sans-serif"; context.textBaseline = "top"; };
  for (const text of pages) {
    reset(); let y = 90;
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const token of Array.from(paragraph)) {
        if (context.measureText(line + token).width > 1010) { context.fillText(line, 90, y); y += 39; line = ""; }
        if (y > 1550) { await finish(); reset(); y = 90; }
        line += token;
      }
      context.fillText(line, 90, y); y += 46;
      if (y > 1550) { await finish(); reset(); y = 90; }
    }
    if (y > 90) await finish();
  }
  canvas.width = canvas.height = 0;
  return pdf.save();
}

async function htmlPdf(source: string) {
  const { default: DOMPurify } = await import("dompurify");
  const { toCanvas } = await import("html-to-image");
  const safe = DOMPurify.sanitize(source, { WHOLE_DOCUMENT: false, FORBID_TAGS: ["iframe", "form", "input", "button", "video", "audio", "link", "meta", "base", "object", "embed"] });
  const parsed = new DOMParser().parseFromString(safe, "text/html");
  parsed.querySelectorAll("img").forEach((image) => { if (!image.src.startsWith("data:image/")) image.remove(); });
  parsed.querySelectorAll("a").forEach((link) => link.removeAttribute("href"));
  const frame = document.createElement("iframe"); frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;";
  const loaded = new Promise<void>((resolve) => { frame.onload = () => resolve(); });
  frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><style>html,body{margin:0;padding:0;background:white;color:#172033;font:16px Arial,sans-serif}#content{padding:48px;box-sizing:border-box;width:794px;overflow-wrap:anywhere}img{max-width:100%}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd}</style></head><body><div id="viewport" style="height:1123px;overflow:hidden"><div id="content">${parsed.body.innerHTML}</div></div></body></html>`;
  document.body.appendChild(frame);
  try {
    await loaded; const doc = frame.contentDocument!; await doc.fonts.ready;
    await Promise.all(Array.from(doc.images).map((image) => image.decode().catch(() => undefined)));
    const viewport = doc.getElementById("viewport")!; const content = doc.getElementById("content")!;
    const height = Math.max(1, content.scrollHeight); const pdf = await PDFDocument.create();
    for (let top = 0; top < height; top += 1123) {
      content.style.transform = `translateY(-${top}px)`;
      const canvas = await toCanvas(viewport, { width: 794, height: 1123, pixelRatio: 1.5, backgroundColor: "white", fontEmbedCSS: "" });
      const image = await pdf.embedPng(await canvasBytes(canvas)); pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 }); canvas.width = canvas.height = 0;
    }
    return pdf.save();
  } finally { frame.remove(); }
}

export async function runAdvancedTool(id: ToolId, files: File[], options: AdvancedOptions, progress: (text: string) => void, base = "", sessions?: { translator?: Promise<LocalTranslator>; summarizer?: Promise<LocalSummarizer> }): Promise<ToolResult> {
  const file = files[0]; const name = baseName(file?.name || "document");
  const pdfResult = (output: Uint8Array, suffix: string = id, detail?: string): ToolResult => ({ output, filename: `${name}-${suffix}.pdf`, mime: "application/pdf", detail });
  if (id === "protect" || id === "unlock" || id === "repair") {
    const { PDF } = await import("@libpdf/core");
    if (id === "protect" && options.newPassword.length < 6) throw new Error("Choose a password with at least 6 characters.");
    const doc = await PDF.load(new Uint8Array(await file.arrayBuffer()), { credentials: options.password || undefined, lenient: id === "repair" });
    if (doc.isEncrypted && !doc.isAuthenticated) throw new Error("Enter the correct document password.");
    if (!doc.getPageCount()) throw new Error("No readable pages could be recovered from this file.");
    if (id === "protect") doc.setProtection({ userPassword: options.newPassword, ownerPassword: options.newPassword, algorithm: "AES-256" });
    if (id === "unlock") doc.removeProtection({ ignorePermissions: true });
    return pdfResult(await doc.save(), id, id === "repair" ? "Rebuilt the readable document structure. Missing content cannot be recreated." : undefined);
  }
  if (id === "html-pdf") return pdfResult(await htmlPdf(options.html.trim() || await file.text()));
  if (id === "edit" || id === "redact") {
    if (!options.marks.length) throw new Error(id === "redact" ? "Draw at least one redaction area on the preview." : "Add text, an image, or a drawing to the preview first.");
    return pdfResult(await renderEditedPdf(file, options.marks, base, .96, 2400, progress), id, "Exported a flattened copy. Original hidden content and interactive fields are not retained.");
  }
  if (id === "scan") {
    const pdf = await PDFDocument.create();
    for (let index = 0; index < files.length; index++) {
      progress(`Cleaning scan ${index + 1} of ${files.length}…`);
      const url = URL.createObjectURL(files[index]);
      try {
        const image = await imageFor(url); const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
        context.filter = `${options.scanMode === "color" ? "" : "grayscale(1) "}contrast(${options.scanContrast}%) brightness(1.03)`;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const embedded = await pdf.embedJpg(await canvasBytes(canvas, "image/jpeg", .92));
        const width = canvas.width * .5, height = canvas.height * .5;
        pdf.addPage([width, height]).drawImage(embedded, { x: 0, y: 0, width, height }); canvas.width = canvas.height = 0;
      } finally { URL.revokeObjectURL(url); }
    }
    return pdfResult(await pdf.save());
  }
  if (id === "split") {
    const source = await PDFDocument.load(await file.arrayBuffer()); const { default: JSZip } = await import("jszip"); const zip = new JSZip();
    const groups = options.splitMode === "groups" ? options.pageRange.split(";").map((range) => parsePageSequence(range, source.getPageCount(), false)) : source.getPageIndices().map((index) => [index]);
    for (let n = 0; n < groups.length; n++) { const doc = await PDFDocument.create(); (await doc.copyPages(source, groups[n])).forEach((page) => doc.addPage(page)); zip.file(`${name}-${String(n + 1).padStart(3, "0")}.pdf`, await doc.save()); }
    return { output: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), filename: `${name}-split.zip`, mime: "application/zip", detail: `${groups.length} separate PDFs.` };
  }
  if (id === "forms") {
    const pdf = await PDFDocument.load(await file.arrayBuffer()); const form = pdf.getForm();
    for (const value of options.formValues) {
      const field = form.getField(value.name);
      if (field instanceof PDFTextField) field.setText(String(value.value));
      else if (field instanceof PDFCheckBox) { if (value.value) field.check(); else field.uncheck(); }
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) { if (value.value) field.select(String(value.value)); }
    }
    const opened = await openLocalPdf(file, base);
    try {
      for (const mark of options.marks.filter((mark) => ["text-field", "checkbox", "dropdown"].includes(mark.kind))) {
        const fieldName = mark.name?.trim() || `Field ${mark.id}`;
        const page = pdf.getPage(mark.page); const viewport = (await opened.document.getPage(mark.page + 1)).getViewport({ scale: 1 });
        const a = viewport.convertToPdfPoint(mark.x * viewport.width, mark.y * viewport.height), b = viewport.convertToPdfPoint((mark.x + mark.width) * viewport.width, (mark.y + mark.height) * viewport.height);
        const bounds = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), borderWidth: 1, borderColor: rgb(.5, .5, .65), backgroundColor: rgb(.97, .97, 1) };
        if (mark.kind === "checkbox") { const field = form.createCheckBox(fieldName); field.addToPage(page, bounds); }
        else if (mark.kind === "dropdown") { const field = form.createDropdown(fieldName); field.addOptions(mark.options?.length ? mark.options : ["Option 1", "Option 2"]); field.addToPage(page, bounds); }
        else { const field = form.createTextField(fieldName); field.addToPage(page, bounds); }
      }
    } finally { await opened.close(); }
    if (options.flatten) form.flatten();
    return pdfResult(await pdf.save());
  }
  if (id === "compress") {
    const output = await renderEditedPdf(file, [], base, options.quality, Math.round(800 + options.quality * 1200), progress);
    const original = new Uint8Array(await file.arrayBuffer());
    return pdfResult(output.length < original.length ? output : original, id, output.length < original.length ? `${Math.round((1 - output.length / original.length) * 100)}% smaller. Pages are flattened; searchable text and form fields are removed.` : "Your original was already smaller than the compressed version, so it was retained.");
  }
  const opened = await openLocalPdf(file, base, options.password);
  try {
    if (id === "pdf-images") {
      const { default: JSZip } = await import("jszip"); const zip = new JSZip();
      const indices = options.pageRange.trim() ? parsePageSequence(options.pageRange, opened.document.numPages) : Array.from({ length: opened.document.numPages }, (_, i) => i);
      for (const index of indices) { progress(`Exporting page ${index + 1}…`); const rendered = await renderLocalPage(await opened.document.getPage(index + 1), 2200); const png = options.imageFormat === "png"; zip.file(`page-${String(index + 1).padStart(3, "0")}.${png ? "png" : "jpg"}`, await canvasBytes(rendered.canvas, png ? "image/png" : "image/jpeg", options.quality)); rendered.canvas.width = rendered.canvas.height = 0; }
      return { output: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), filename: `${name}-images.zip`, mime: "application/zip" };
    }
    if (id === "pdfa") {
      const { PDFDocument: ArchivalPdf } = await import("@cantoo/pdf-lib"); const pdf = await ArchivalPdf.create(); pdf.setCreator("GHOST PDF"); pdf.setTitle(name);
      for (let n = 1; n <= opened.document.numPages; n++) { progress(`Archiving page ${n}…`); const rendered = await renderLocalPage(await opened.document.getPage(n), 2200); const image = await pdf.embedJpg(await canvasBytes(rendered.canvas, "image/jpeg", .97)); pdf.addPage([rendered.width, rendered.height]).drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height }); rendered.canvas.width = rendered.canvas.height = 0; }
      pdf.convertToPDFA({ conformance: "2B" }); return pdfResult(await pdf.save(), "pdfa-2b", "Created a flattened PDF/A-2b archival copy with an embedded sRGB profile.");
    }
    if (id === "ocr") {
      const { createWorker, OEM } = await import("tesseract.js");
      const worker = await createWorker(options.ocrLanguage, OEM.LSTM_ONLY, { workerPath: `${base}/ocr/worker.min.js`, corePath: `${base}/ocr/core`, langPath: `${base}/ocr/lang`, workerBlobURL: false,
        logger: (event) => progress(`${event.status.includes("recogniz") ? "Reading page text" : event.status.includes("language") ? "Loading language data" : "Preparing text recognition"}${typeof event.progress === "number" ? ` · ${Math.round(event.progress * 100)}%` : ""}`) });
      const result = await PDFDocument.create();
      try {
        for (let n = 1; n <= opened.document.numPages; n++) {
          progress(`Recognizing page ${n} of ${opened.document.numPages}…`);
          const rendered = await renderLocalPage(await opened.document.getPage(n), 2400);
          const recognized = await worker.recognize(rendered.canvas, { pdfTitle: "GHOST PDF OCR", pdfTextOnly: false }, { pdf: true, text: true });
          if (!recognized.data.pdf) throw new Error("The OCR engine could not create this page.");
          const [page] = await result.embedPdf(new Uint8Array(recognized.data.pdf));
          result.addPage([rendered.width, rendered.height]).drawPage(page, { x: 0, y: 0, width: rendered.width, height: rendered.height });
          rendered.canvas.width = rendered.canvas.height = 0;
        }
        return pdfResult(await result.save(), id, "Searchable OCR copy created. Review recognized text before relying on it.");
      } finally { await worker.terminate(); }
    }
    if (id === "compare") {
      if (files.length !== 2) throw new Error("Choose exactly two PDFs to compare.");
      const other = await openLocalPdf(files[1], base); const report = await PDFDocument.create(); const font = await report.embedFont(StandardFonts.Helvetica);
      let changed = 0; const preview: string[] = [];
      try {
        const count = Math.max(opened.document.numPages, other.document.numPages);
        for (let n = 1; n <= count; n++) {
          progress(`Comparing page ${n} of ${count}…`);
          const first = n <= opened.document.numPages ? await renderLocalPage(await opened.document.getPage(n), 1000) : null;
          const second = n <= other.document.numPages ? await renderLocalPage(await other.document.getPage(n), 1000) : null;
          const width = Math.max(first?.canvas.width || 1, second?.canvas.width || 1), height = Math.max(first?.canvas.height || 1, second?.canvas.height || 1);
          const canvases = [first, second].map((rendered) => { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d", { willReadFrequently: true })!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, height); if (rendered) ctx.drawImage(rendered.canvas, 0, 0); return canvas; });
          const a = canvases[0].getContext("2d")!.getImageData(0, 0, width, height), b = canvases[1].getContext("2d")!.getImageData(0, 0, width, height);
          const overlay = canvases[1].getContext("2d")!.createImageData(width, height); let difference = 0;
          for (let i = 0; i < a.data.length; i += 4) { const delta = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); if (delta > 80) { difference++; overlay.data[i] = 240; overlay.data[i + 1] = 62; overlay.data[i + 2] = 103; overlay.data[i + 3] = 140; } }
          if (difference || !first || !second) changed++;
          const overlayCanvas = document.createElement("canvas"); overlayCanvas.width = width; overlayCanvas.height = height; overlayCanvas.getContext("2d")!.putImageData(overlay, 0, 0);
          canvases[1].getContext("2d")!.drawImage(overlayCanvas, 0, 0);
          const page = report.addPage([1190, 842]); page.drawText(`Page ${n} | ${difference ? "Changes highlighted" : !first || !second ? "Page added or removed" : "No visual changes"}`, { x: 28, y: 810, size: 14, font });
          for (let side = 0; side < 2; side++) { const image = await report.embedPng(await canvasBytes(canvases[side])); const scale = Math.min(548 / width, 740 / height); page.drawImage(image, { x: 28 + side * 580, y: 42 + (740 - height * scale), width: width * scale, height: height * scale }); if (preview.length < 2 && (difference || n === count)) preview.push(canvases[side].toDataURL("image/png")); canvases[side].width = canvases[side].height = 0; }
          if (first) first.canvas.width = first.canvas.height = 0; if (second) second.canvas.width = second.canvas.height = 0; overlayCanvas.width = overlayCanvas.height = 0;
        }
        return { ...pdfResult(await report.save()), detail: `${changed} of ${count} pages have visual differences. Pink highlights show changed pixels.`, preview };
      } finally { await other.close(); }
    }
    const textPages = await readDocumentText(opened.document); const text = textPages.join("\n\n");
    if (!text.trim()) throw new Error("This PDF has no selectable text. Run OCR PDF first.");
    if (id === "markdown") {
      const blocks: string[] = [`# ${name}\n`];
      for (let n = 1; n <= opened.document.numPages; n++) {
        const page = await opened.document.getPage(n); const content = await page.getTextContent(); const items = content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => "str" in item);
        const rows = pdfTextRows(items); blocks.push(`## Page ${n}\n`);
        const columns = Math.max(0, ...rows.map((row) => row.length));
        if (columns > 1) { const format = (row: string[]) => `| ${Array.from({ length: columns }, (_, index) => (row[index] || "").replace(/\|/g, "\\|")).join(" | ")} |`; blocks.push(format(rows[0]), `| ${Array(columns).fill("---").join(" | ")} |`, ...rows.slice(1).map(format)); }
        else blocks.push(rows.map((row) => row.join(" ")).join("\n\n"));
      }
      const markdown = blocks.join("\n\n"); return { output: encoded(markdown), filename: `${name}.md`, mime: "text/markdown;charset=utf-8", text: markdown, detail: "Reconstructed from selectable text; complex layouts may need adjustment." };
    }
    if (id === "summarize") {
      let summary: string;
      if (options.summaryMode === "ai") { if (!sessions?.summarizer) throw new Error("On-device AI is not available in this browser. Choose Key sentences instead."); const summarizer = await sessions.summarizer; try { const chunks: string[] = []; for (let i = 0; i < text.length; i += 10000) chunks.push(await summarizer.summarize(text.slice(i, i + 10000))); summary = chunks.join("\n\n"); } finally { summarizer.destroy(); } }
      else summary = keySentenceDigest(text);
      const markdown = `# ${name} — ${options.summaryMode === "ai" ? "On-device AI summary" : "Key-sentence digest"}\n\n${summary}`;
      return { output: encoded(markdown), filename: `${name}-summary.md`, mime: "text/markdown;charset=utf-8", text: markdown, detail: options.summaryMode === "ai" ? "Generated locally with browser AI. Review against the original." : "Extracted key sentences locally. This mode does not use generative AI." };
    }
    if (id === "translate") {
      if (!sessions?.translator) throw new Error("Private translation needs the on-device Translator API in a supported desktop Chrome or Edge browser.");
      const translator = await sessions.translator;
      try { const translated: string[] = []; for (let index = 0; index < textPages.length; index++) { progress(`Translating page ${index + 1} of ${textPages.length}…`); let page = ""; for (let start = 0; start < textPages[index].length; start += 3000) page += await translator.translate(textPages[index].slice(start, start + 3000)) + "\n"; translated.push(page); } return { ...pdfResult(await textPagesPdf(translated, name), "translated"), text: translated.join("\n\n"), detail: "Translated text in a new layout. Original pictures and formatting are not reproduced." }; }
      finally { translator.destroy(); }
    }
    throw new Error("This tool is not supported.");
  } finally { await opened.close(); }
}

export async function applyPdfWorkflow(bytes: Uint8Array, settings: AdvancedOptions["workflow"], base: string) {
  const pdf = await PDFDocument.load(bytes); const font = settings.number || settings.watermark ? await pdf.embedFont(StandardFonts.Helvetica) : undefined;
  pdf.getPages().forEach((page, index) => {
    if (settings.rotate) page.setRotation(degrees((page.getRotation().angle + settings.rotate) % 360));
    if (settings.number && font) page.drawText(String(index + 1), { x: page.getWidth() / 2, y: 22, font, size: 11 });
    if (settings.watermark && font) page.drawText(settings.watermark, { x: 30, y: page.getHeight() / 2, font, size: 30, opacity: .2, rotate: degrees(25) });
  });
  const result = await pdf.save();
  if (!settings.compress) return result;
  const compressed = await renderEditedPdf(new File([result as BlobPart], "workflow.pdf", { type: "application/pdf" }), [], base, .65, 1500);
  return compressed.length < result.length ? compressed : result;
}
export { htmlEscape };
