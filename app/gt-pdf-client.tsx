"use client";

import {
  ArrowDown, ArrowUp, Check, Copy, Crop, Download,
  FileImage, FileOutput, FilePenLine, FileSpreadsheet, FileText, Files,
  Gauge, Hash, Layers3, ListRestart, LockKeyhole, Menu, Minimize2, Plus,
  Presentation, RotateCw, ShieldCheck, Signature, Sparkles, Split, Stamp,
  Table2, Trash2, UploadCloud, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { insetCropBox, parsePageSequence, pdfTextRows } from "@/lib/pdf-utils";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const pdfWorkerUrl = `${publicBasePath}/pdf.worker.min.mjs`;

type ToolId = "merge" | "extract" | "organize" | "rotate" | "optimize" | "number" | "watermark" | "images" | "duplicate" | "delete" | "blank" | "reverse" | "crop" | "sign" | "metadata" | "pdf-excel" | "excel-pdf" | "pdf-powerpoint" | "powerpoint-pdf" | "pdf-word" | "word-pdf";
type Tool = {
  id: ToolId;
  name: string;
  short: string;
  description: string;
  Icon: typeof Files;
  color: string;
  accept: string;
  multiple: boolean;
};

const tools: Tool[] = [
  { id: "pdf-word", name: "PDF to Word", short: "Preserve page layout", description: "Create a page-faithful Word document that keeps the original visual context.", Icon: FileText, color: "word", accept: "application/pdf,.pdf", multiple: false },
  { id: "word-pdf", name: "Word to PDF", short: "DOCX to PDF pages", description: "Render Word pages, including images and tables, into a PDF.", Icon: FileText, color: "word", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", multiple: false },
  { id: "pdf-powerpoint", name: "PDF to PowerPoint", short: "Pages to slide images", description: "Place every PDF page onto its own PowerPoint slide.", Icon: Presentation, color: "powerpoint", accept: "application/pdf,.pdf", multiple: false },
  { id: "powerpoint-pdf", name: "PowerPoint to PDF", short: "Slides to PDF pages", description: "Convert slides, pictures, and text into PDF pages.", Icon: Presentation, color: "powerpoint", accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation", multiple: false },
  { id: "pdf-excel", name: "PDF to Excel", short: "Extract pages to sheets", description: "Extract page text into an editable Excel workbook.", Icon: FileSpreadsheet, color: "excel", accept: "application/pdf,.pdf", multiple: false },
  { id: "excel-pdf", name: "Excel to PDF", short: "Sheets to printable pages", description: "Convert styled worksheets into PDF pages, including pictures and tables.", Icon: Table2, color: "excel", accept: ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv", multiple: false },
  { id: "merge", name: "Merge PDF", short: "Combine PDFs", description: "Combine several PDFs in the exact order you choose.", Icon: Files, color: "coral", accept: "application/pdf,.pdf", multiple: true },
  { id: "extract", name: "Extract pages", short: "Keep selected pages", description: "Create a new PDF with only the pages you need.", Icon: Split, color: "blue", accept: "application/pdf,.pdf", multiple: false },
  { id: "organize", name: "Organize PDF", short: "Reorder any pages", description: "Rebuild a document in a custom page order.", Icon: Layers3, color: "violet", accept: "application/pdf,.pdf", multiple: false },
  { id: "rotate", name: "Rotate PDF", short: "Turn every page", description: "Rotate every page clockwise or upside down.", Icon: RotateCw, color: "mint", accept: "application/pdf,.pdf", multiple: false },
  { id: "optimize", name: "Optimize PDF", short: "Clean file structure", description: "Rewrite the PDF with compact object streams for a leaner file.", Icon: Minimize2, color: "yellow", accept: "application/pdf,.pdf", multiple: false },
  { id: "number", name: "Page numbers", short: "Add clean numbering", description: "Place page numbers at the top or bottom of every page.", Icon: Hash, color: "cyan", accept: "application/pdf,.pdf", multiple: false },
  { id: "watermark", name: "Watermark PDF", short: "Stamp custom text", description: "Add visible custom text across every page.", Icon: Stamp, color: "pink", accept: "application/pdf,.pdf", multiple: false },
  { id: "images", name: "Images to PDF", short: "JPG & PNG to PDF", description: "Turn up to 20 JPG or PNG images into one PDF.", Icon: FileImage, color: "orange", accept: "image/jpeg,image/png,.jpg,.jpeg,.png", multiple: true },
  { id: "duplicate", name: "Duplicate pages", short: "Copy selected pages", description: "Append copies of selected pages to your document.", Icon: Copy, color: "indigo", accept: "application/pdf,.pdf", multiple: false },
  { id: "delete", name: "Delete pages", short: "Remove page ranges", description: "Remove unwanted pages and keep everything else.", Icon: Trash2, color: "red", accept: "application/pdf,.pdf", multiple: false },
  { id: "blank", name: "Add blank page", short: "Append a clean page", description: "Add a fresh A4 page to the end of a PDF.", Icon: FileOutput, color: "slate", accept: "application/pdf,.pdf", multiple: false },
  { id: "reverse", name: "Reverse pages", short: "Flip page order", description: "Reverse the complete page order in one click.", Icon: ListRestart, color: "lime", accept: "application/pdf,.pdf", multiple: false },
  { id: "crop", name: "Crop PDF", short: "Trim page margins", description: "Apply a consistent crop margin to every page.", Icon: Crop, color: "yellow", accept: "application/pdf,.pdf", multiple: false },
  { id: "sign", name: "Sign PDF", short: "Add a text signature", description: "Place your typed signature on the final page.", Icon: Signature, color: "cyan", accept: "application/pdf,.pdf", multiple: false },
  { id: "metadata", name: "Edit metadata", short: "Title, author & topic", description: "Update document title, author, subject, and keywords.", Icon: FilePenLine, color: "pink", accept: "application/pdf,.pdf", multiple: false },
];

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};
const safeBaseName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "document";
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const downloadBytes = (bytes: Uint8Array, filename: string, type = "application/pdf") => downloadBlob(new Blob([bytes as BlobPart], { type }), filename);

function ToolGlyph({ tool }: { tool: Tool }) {
  const officeLetter = tool.id.includes("word") ? "W" : tool.id.includes("powerpoint") ? "P" : tool.id.includes("excel") ? "X" : null;
  if (!officeLetter) return <span className={`tool-icon ${tool.color}`}><tool.Icon /></span>;
  const pdfFirst = tool.id.startsWith("pdf-");
  return <span className={`tool-icon office ${tool.color} ${pdfFirst ? "pdf-first" : "office-first"}`} aria-hidden="true">
    <span className="office-letter">{officeLetter}</span><span className="office-arrow">↘</span>
  </span>;
}

export default function GTPdfClient() {
  const [activeTool, setActiveTool] = useState<Tool>(tools[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pageRange, setPageRange] = useState("1");
  const [rotation, setRotation] = useState(90);
  const [numberPosition, setNumberPosition] = useState("bottom-center");
  const [watermark, setWatermark] = useState("CONFIDENTIAL");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.18);
  const [cropMargin, setCropMargin] = useState(24);
  const [signature, setSignature] = useState("");
  const [meta, setMeta] = useState({ title: "", author: "", subject: "", keywords: "" });
  const fileInput = useRef<HTMLInputElement>(null);
  const jobRunning = useRef(false);

  const selectTool = useCallback((tool: Tool) => {
    if (jobRunning.current) throw new Error("Wait for the current conversion to finish before changing tools.");
    setActiveTool(tool);
    setFiles([]);
    setMessage("");
    setError("");
    setMobileMenu(false);
    setPageRange(tool.id === "organize" ? "3, 1, 2" : "1");
    requestAnimationFrame(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: { toolId?: string }) => Promise<object> }, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(modelContext.registerTool({
        name: "choose_ghost_pdf_tool",
        title: "Choose a GHOST PDF tool",
        description: "Open one of GHOST PDF's visible local document tools so the user can add files.",
        inputSchema: { type: "object", properties: { toolId: { type: "string", enum: tools.map((tool) => tool.id) } }, required: ["toolId"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const selected = tools.find((tool) => tool.id === input.toolId);
          if (!selected) throw new Error("Unknown PDF tool.");
          selectTool(selected);
          return { selectedTool: selected.id, status: "ready_for_local_files" };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* WebMCP is optional. */ }
    return () => lifecycle.abort();
  }, [selectTool]);

  const addFiles = (incoming: File[]) => {
    if (jobRunning.current) return;
    setError("");
    setMessage("");
    const valid = incoming.filter((file) => {
      if (activeTool.id === "images") return ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
      if (["excel-pdf"].includes(activeTool.id)) return /\.(xlsx?|csv)$/i.test(file.name);
      if (activeTool.id === "powerpoint-pdf") return /\.pptx$/i.test(file.name);
      if (activeTool.id === "word-pdf") return /\.docx$/i.test(file.name);
      return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    });
    if (!valid.length) {
      const wanted = activeTool.id === "images" ? "JPG or PNG images" : activeTool.id === "excel-pdf" ? "an XLSX, XLS, or CSV file" : activeTool.id === "powerpoint-pdf" ? "a PPTX file" : activeTool.id === "word-pdf" ? "a DOCX file" : "a PDF file";
      setError(`Choose ${wanted}.`);
      return;
    }
    setFiles((current) => {
      const combined = [...current, ...valid];
      if (combined.length > 20) setError("You can select up to 20 files in one job. The first 20 were kept.");
      return combined.slice(0, 20);
    });
  };
  const moveFile = (index: number, direction: -1 | 1) => setFiles((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const processFiles = async (selectedFiles = files, nested = false): Promise<void | { output: Uint8Array; filename: string; mime: string }> => {
    if (!selectedFiles.length || (!nested && jobRunning.current)) return;
    if (!nested && selectedFiles.length > 1 && !["merge", "images"].includes(activeTool.id)) {
      jobRunning.current = true;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const { default: JSZip } = await import("jszip");
        const archive = new JSZip();
        for (let index = 0; index < selectedFiles.length; index += 1) {
          const result = await processFiles([selectedFiles[index]], true);
          if (result) archive.file(`${String(index + 1).padStart(2, "0")}-${result.filename}`, result.output);
        }
        const filename = `ghost-pdf-${activeTool.id}-batch.zip`;
        downloadBlob(await archive.generateAsync({ type: "blob", compression: "DEFLATE" }), filename);
        setMessage(`Done — ${selectedFiles.length} files were converted and downloaded as ${filename}.`);
      } catch (caught) {
        const detail = caught instanceof Error ? caught.message : "The files could not be processed.";
        setError(detail);
      } finally {
        jobRunning.current = false;
        setBusy(false);
      }
      return;
    }
    if (activeTool.id === "merge" && selectedFiles.length < 2) {
      setError("Add at least two PDFs to merge.");
      return;
    }
    if (!nested) {
      jobRunning.current = true;
      setBusy(true);
      setError("");
      setMessage("");
    }
    let pdfTask: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentLoadingTask | undefined;
    try {
      const { degrees, PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const loadPdf = async () => {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        pdfTask = pdfjs.getDocument({
          data: new Uint8Array(await selectedFiles[0].arrayBuffer()),
          cMapUrl: `${publicBasePath}/pdfjs/cmaps/`,
          standardFontDataUrl: `${publicBasePath}/pdfjs/standard_fonts/`,
          wasmUrl: `${publicBasePath}/pdfjs/wasm/`,
          iccUrl: `${publicBasePath}/pdfjs/iccs/`,
        });
        return pdfTask.promise;
      };
      let output: Uint8Array;
      let mime = "application/pdf";
      let filename = `${safeBaseName(selectedFiles[0].name)}-${activeTool.id}.pdf`;
      if (activeTool.id === "pdf-excel") {
        const document = await loadPdf();
        const XLSX = await import("xlsx");
        const workbook = XLSX.utils.book_new();
        let hasText = false;
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          const items = content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => "str" in item);
          const rows = pdfTextRows(items);
          hasText ||= rows.length > 0;
          const sheet = XLSX.utils.aoa_to_sheet(rows);
          XLSX.utils.book_append_sheet(workbook, sheet, `Page ${pageNumber}`);
          page.cleanup();
        }
        if (!hasText) throw new Error("This PDF contains no selectable text. Scanned pages require OCR before Excel conversion.");
        const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
        filename = `${safeBaseName(selectedFiles[0].name)}.xlsx`;
        output = new Uint8Array(bytes);
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (activeTool.id === "pdf-word") {
        const document = await loadPdf();
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const relationships: string[] = [];
        const body: string[] = [];
        let finalSection = "";
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const original = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2, 2400 / Math.max(original.width, original.height)) });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("This browser could not render the PDF page.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const relationshipId = `rId${pageNumber + 1}`;
          const mediaName = `page-${pageNumber}.png`;
          const imageData = canvas.toDataURL("image/png").split(",")[1];
          zip.folder("word/media")?.file(mediaName, imageData, { base64: true });
          relationships.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/>`);
          // Word permits a maximum page dimension of 22 inches. Scale only
          // oversized pages, retaining each page's orientation and aspect ratio.
          const pageScale = Math.min(1, 1584 / Math.max(original.width, original.height));
          const pageWidth = Math.round(original.width * pageScale * 20);
          const pageHeight = Math.round(original.height * pageScale * 20);
          const width = pageWidth * 635;
          const height = pageHeight * 635;
          const section = `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
          finalSection = section;
          const sectionBreak = pageNumber < document.numPages ? section : "";
          body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${sectionBreak}</w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${width}" cy="${height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${pageNumber}" name="PDF page ${pageNumber}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${pageNumber}" name="${mediaName}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`);
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
        zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
        zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
        zip.folder("word/_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`);
        zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}${finalSection}</w:body></w:document>`);
        filename = `${safeBaseName(selectedFiles[0].name)}.docx`;
        output = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (activeTool.id === "pdf-powerpoint") {
        const document = await loadPdf();
        const PptxGenJS = (await import("pptxgenjs")).default;
        const presentation = new PptxGenJS();
        const firstPage = (await document.getPage(1)).getViewport({ scale: 1 });
        const slideScale = Math.min(1, 4032 / Math.max(firstPage.width, firstPage.height));
        const slideWidth = firstPage.width * slideScale / 72;
        const slideHeight = firstPage.height * slideScale / 72;
        presentation.defineLayout({ name: "PDF_PAGE", width: slideWidth, height: slideHeight });
        presentation.layout = "PDF_PAGE";
        presentation.author = "GHOST PDF";
        presentation.subject = `Converted from ${selectedFiles[0].name}`;
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const original = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2, 2400 / Math.max(original.width, original.height)) });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("This browser could not render the PDF page.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const slide = presentation.addSlide();
          slide.background = { color: "FFFFFF" };
          const pageRatio = viewport.width / viewport.height;
          const boxRatio = slideWidth / slideHeight;
          const width = pageRatio > boxRatio ? slideWidth : slideHeight * pageRatio;
          const height = pageRatio > boxRatio ? slideWidth / pageRatio : slideHeight;
          slide.addImage({ data: canvas.toDataURL("image/png"), x: (slideWidth - width) / 2, y: (slideHeight - height) / 2, w: width, h: height });
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
        filename = `${safeBaseName(selectedFiles[0].name)}.pptx`;
        output = await presentation.write({ outputType: "uint8array", compression: true }) as Uint8Array;
        mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else if (["word-pdf", "powerpoint-pdf", "excel-pdf"].includes(activeTool.id)) {
        const { officeToPdf } = await import("@/lib/office-to-pdf");
        output = await officeToPdf(selectedFiles[0], activeTool.id as "word-pdf" | "powerpoint-pdf" | "excel-pdf", publicBasePath);
        filename = `${safeBaseName(selectedFiles[0].name)}.pdf`;
      } else if (activeTool.id === "merge") {
        const result = await PDFDocument.create();
        for (const file of selectedFiles) {
          const source = await PDFDocument.load(await file.arrayBuffer());
          const copied = await result.copyPages(source, source.getPageIndices());
          copied.forEach((page) => result.addPage(page));
        }
        output = await result.save({ useObjectStreams: true });
        filename = "merged-document.pdf";
      } else if (activeTool.id === "images") {
        const result = await PDFDocument.create();
        for (const file of selectedFiles) {
          const bytes = await file.arrayBuffer();
          const image = file.type === "image/png" || /\.png$/i.test(file.name) ? await result.embedPng(bytes) : await result.embedJpg(bytes);
          const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
          const width = image.width * scale;
          const height = image.height * scale;
          const page = result.addPage([width, height]);
          page.drawImage(image, { x: 0, y: 0, width, height });
        }
        output = await result.save({ useObjectStreams: true });
        filename = "images.pdf";
      } else {
        const source = await PDFDocument.load(await selectedFiles[0].arrayBuffer());
        const total = source.getPageCount();
        if (activeTool.id === "extract" || activeTool.id === "organize") {
          const result = await PDFDocument.create();
          const indices = parsePageSequence(pageRange, total, activeTool.id === "extract");
          const copied = await result.copyPages(source, indices);
          copied.forEach((page) => result.addPage(page));
          output = await result.save({ useObjectStreams: true });
        } else if (activeTool.id === "delete") {
          const removed = new Set(parsePageSequence(pageRange, total));
          const keep = source.getPageIndices().filter((index) => !removed.has(index));
          if (!keep.length) throw new Error("You cannot delete every page.");
          const result = await PDFDocument.create();
          (await result.copyPages(source, keep)).forEach((page) => result.addPage(page));
          output = await result.save({ useObjectStreams: true });
        } else if (activeTool.id === "duplicate") {
          const result = await PDFDocument.create();
          const original = await result.copyPages(source, source.getPageIndices());
          original.forEach((page) => result.addPage(page));
          const duplicated = await result.copyPages(source, parsePageSequence(pageRange, total));
          duplicated.forEach((page) => result.addPage(page));
          output = await result.save({ useObjectStreams: true });
        } else if (activeTool.id === "reverse") {
          const result = await PDFDocument.create();
          const indices = source.getPageIndices().reverse();
          (await result.copyPages(source, indices)).forEach((page) => result.addPage(page));
          output = await result.save({ useObjectStreams: true });
        } else if (activeTool.id === "rotate") {
          source.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + rotation) % 360)));
          output = await source.save({ useObjectStreams: true });
        } else if (activeTool.id === "number") {
          const font = await source.embedFont(StandardFonts.Helvetica);
          source.getPages().forEach((page, index) => {
            const label = `${index + 1}`;
            const size = 11;
            const textWidth = font.widthOfTextAtSize(label, size);
            const { width, height } = page.getSize();
            const isTop = numberPosition.startsWith("top");
            const isLeft = numberPosition.endsWith("left");
            const isRight = numberPosition.endsWith("right");
            const x = isLeft ? 28 : isRight ? width - textWidth - 28 : (width - textWidth) / 2;
            const y = isTop ? height - 30 : 22;
            page.drawText(label, { x, y, size, font, color: rgb(0.08, 0.1, 0.2), opacity: 0.86 });
          });
          output = await source.save({ useObjectStreams: true });
        } else if (activeTool.id === "watermark") {
          if (!watermark.trim()) throw new Error("Enter watermark text.");
          const font = await source.embedFont(StandardFonts.HelveticaBold);
          source.getPages().forEach((page) => {
            const { width, height } = page.getSize();
            const size = Math.max(22, Math.min(64, width / Math.max(7, watermark.length * 0.72)));
            const textWidth = font.widthOfTextAtSize(watermark, size);
            page.drawText(watermark, { x: (width - textWidth * 0.82) / 2, y: height / 2 - size / 2, size, font, rotate: degrees(32), color: rgb(0.27, 0.22, 0.78), opacity: watermarkOpacity });
          });
          output = await source.save({ useObjectStreams: true });
        } else if (activeTool.id === "blank") {
          source.addPage([595.28, 841.89]);
          output = await source.save({ useObjectStreams: true });
        } else if (activeTool.id === "crop") {
          source.getPages().forEach((page) => {
            const { x, y, width, height } = insetCropBox(page.getCropBox(), cropMargin);
            page.setCropBox(x, y, width, height);
          });
          output = await source.save({ useObjectStreams: true });
        } else if (activeTool.id === "sign") {
          if (!signature.trim()) throw new Error("Type the name you want to use as your signature.");
          const font = await source.embedFont(StandardFonts.TimesRomanItalic);
          const page = source.getPage(total - 1);
          const { width } = page.getSize();
          const size = 24;
          const textWidth = font.widthOfTextAtSize(signature, size);
          page.drawText(signature, { x: Math.max(36, width - textWidth - 44), y: 42, size, font, color: rgb(0.08, 0.13, 0.32) });
          output = await source.save({ useObjectStreams: true });
        } else if (activeTool.id === "metadata") {
          if (meta.title.trim()) source.setTitle(meta.title.trim());
          if (meta.author.trim()) source.setAuthor(meta.author.trim());
          if (meta.subject.trim()) source.setSubject(meta.subject.trim());
          if (meta.keywords.trim()) source.setKeywords(meta.keywords.split(",").map((item) => item.trim()).filter(Boolean));
          source.setModificationDate(new Date());
          output = await source.save({ useObjectStreams: true });
        } else {
          output = await source.save({ useObjectStreams: true, objectsPerTick: 50 });
        }
      }
      if (nested) return { output, filename, mime };
      downloadBytes(output, filename, mime);
      setMessage(`Done — ${filename} has been downloaded.`);
    } catch (caught) {
      if (nested) throw caught;
      const detail = caught instanceof Error ? caught.message : "The file could not be processed.";
      setError(detail.toLowerCase().includes("encrypt") ? "This PDF is password-protected. Unlock it before processing." : detail);
    } finally {
      // Release the worker even if loading, text extraction, or rendering fails.
      await pdfTask?.destroy().catch(() => undefined);
      if (!nested) {
        jobRunning.current = false;
        setBusy(false);
      }
    }
  };

  const rangeLabel = activeTool.id === "organize" ? "New page order" : activeTool.id === "delete" ? "Pages to remove" : activeTool.id === "duplicate" ? "Pages to copy" : "Pages to keep";
  const rangeHelp = activeTool.id === "organize" ? "Use any order, including reverse ranges: 5-1, 8, 10." : "Use commas and ranges, for example 1-3, 6.";
  const inputNoun = activeTool.id === "images" ? "up to 20 images" : activeTool.id === "excel-pdf" ? "up to 20 Excel files" : activeTool.id === "powerpoint-pdf" ? "up to 20 PowerPoint files" : activeTool.id === "word-pdf" ? "up to 20 Word files" : "up to 20 PDFs";
  const fileTag = activeTool.id === "images" ? "IMG" : activeTool.id === "excel-pdf" ? "XLS" : activeTool.id === "powerpoint-pdf" ? "PPT" : activeTool.id === "word-pdf" ? "DOC" : "PDF";

  return <main id="top">
    <header className="site-header">
      <a className="brand" href="#top" aria-label="GHOST PDF home"><span className="brand-mark"><FileOutput size={22} /></span><span>GHOST <b>PDF</b></span></a>
      <nav className={mobileMenu ? "nav-links open" : "nav-links"} aria-label="Main navigation">
        <a href="#tools" onClick={() => setMobileMenu(false)}>All tools</a>
        <a href="#privacy" onClick={() => setMobileMenu(false)}>Privacy</a>
        <span className="free-access"><Check /> Free & unlimited</span>
      </nav>
      <button className="menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="Toggle navigation" aria-expanded={mobileMenu}>{mobileMenu ? <X /> : <Menu />}</button>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow"><ShieldCheck /> Files never leave your device</span>
        <h1>PDF jobs done.<br /><em>Right here.</em></h1>
        <p>Convert and edit PDF, Word, Excel, and PowerPoint files right in your browser. No account and no daily limit.</p>
        <div className="hero-actions"><a className="primary-button" href="#tools">Explore all tools <ArrowDown /></a><span><b>{tools.length}</b> free tools · unlimited use</span></div>
      </div>
      <div className="hero-panel" aria-label="GHOST PDF product summary">
        <div className="hero-panel-top"><span className="live-pill"><i /> Ready in your browser</span><Sparkles /></div>
        <div className="floating-docs" aria-hidden="true"><div className="doc-card back"><span /><span /><span /></div><div className="doc-card front"><b>PDF</b><span /><span /><span /></div><div className="spark spark-one">✦</div><div className="spark spark-two">✦</div></div>
        <div className="hero-stats"><div><strong>21</strong><span>free tools</span></div><div><strong>∞</strong><span>uses per day</span></div><div><strong>0</strong><span>files stored</span></div></div>
      </div>
    </section>

    <section className="tools-section" id="tools">
      <div className="section-heading"><div><span className="kicker">All tools. No limits.</span><h2>What do you need to do?</h2></div><div className="legend"><span><i className="free-dot" /> 21 free tools</span><span><Sparkles /> Unlimited times</span></div></div>
      <div className="tool-grid">{tools.map((tool, index) => <button key={tool.id} className={`tool-card ${activeTool.id === tool.id ? "active" : ""}`} onClick={() => selectTool(tool)} disabled={busy}>
        <ToolGlyph tool={tool} />
        <span className="tool-card-copy"><span className="tool-title"><strong>{tool.name}</strong></span><small>{tool.short}</small></span>
        <span className="tool-index">{String(index + 1).padStart(2, "0")}</span>
      </button>)}</div>
    </section>

    <section className="workspace-wrap" id="workspace"><div className="workspace-shell">
      <div className="workspace-heading"><ToolGlyph tool={activeTool} /><div><span className="kicker">Free · unlimited</span><h2>{activeTool.name}</h2><p>{activeTool.description}</p></div></div>
      <div className="workspace-card">
        <fieldset className="processing-fields" disabled={busy}>
          <div className={dragging ? "dropzone dragging" : "dropzone"} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles([...event.dataTransfer.files]); }}>
            <input ref={fileInput} type="file" accept={activeTool.accept} multiple hidden onChange={(event) => { addFiles([...(event.target.files ?? [])]); event.currentTarget.value = ""; }} />
            <span className="upload-icon"><UploadCloud /></span><h3>Drop {inputNoun} here</h3><p>or choose them from your device</p><button className="secondary-button" onClick={() => fileInput.current?.click()}><Plus /> Choose files</button><small><LockKeyhole /> Up to 20 files · processed locally · no usage limit</small>
          </div>
          {files.length > 0 && <div className="job-panel">
            <div className="file-list-heading"><strong>{files.length} {files.length === 1 ? "file" : "files"} ready</strong><span>{formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</span></div>
            <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}><span className="file-type">{fileTag}</span><span className="file-name"><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>{activeTool.multiple && <span className="order-buttons"><button onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label={`Move ${file.name} up`}><ArrowUp /></button><button onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`}><ArrowDown /></button></span>}<button className="remove-button" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remove ${file.name}`}><Trash2 /></button></div>)}</div>
            {["extract", "organize", "duplicate", "delete"].includes(activeTool.id) && <label className="option-field"><span>{rangeLabel}</span><input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-3, 6, 9-12" /><small>{rangeHelp}</small></label>}
            {activeTool.id === "rotate" && <fieldset className="option-field"><legend>Rotate every page</legend><div className="choice-row">{[90, 180, 270].map((angle) => <button type="button" className={rotation === angle ? "choice active" : "choice"} key={angle} onClick={() => setRotation(angle)}>{angle}°</button>)}</div></fieldset>}
            {activeTool.id === "number" && <label className="option-field"><span>Number position</span><select value={numberPosition} onChange={(event) => setNumberPosition(event.target.value)}><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option></select></label>}
            {activeTool.id === "watermark" && <div className="options-grid"><label className="option-field"><span>Watermark text</span><input value={watermark} maxLength={40} onChange={(event) => setWatermark(event.target.value)} /></label><label className="option-field"><span>Opacity: {Math.round(watermarkOpacity * 100)}%</span><input type="range" min="0.08" max="0.5" step="0.02" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></label></div>}
            {activeTool.id === "crop" && <label className="option-field"><span>Crop margin: {cropMargin} pt</span><input type="range" min="0" max="72" step="2" value={cropMargin} onChange={(event) => setCropMargin(Number(event.target.value))} /><small>Applied evenly to all four sides.</small></label>}
            {activeTool.id === "sign" && <label className="option-field"><span>Signature name</span><input value={signature} maxLength={60} onChange={(event) => setSignature(event.target.value)} placeholder="Type your name" /><small>Placed at the bottom-right of the final page.</small></label>}
            {activeTool.id === "metadata" && <div className="metadata-grid"><label className="option-field"><span>Document title</span><input value={meta.title} onChange={(event) => setMeta({ ...meta, title: event.target.value })} /></label><label className="option-field"><span>Author</span><input value={meta.author} onChange={(event) => setMeta({ ...meta, author: event.target.value })} /></label><label className="option-field"><span>Subject</span><input value={meta.subject} onChange={(event) => setMeta({ ...meta, subject: event.target.value })} /></label><label className="option-field"><span>Keywords</span><input value={meta.keywords} onChange={(event) => setMeta({ ...meta, keywords: event.target.value })} placeholder="invoice, final, 2026" /></label></div>}
            {["word-pdf", "powerpoint-pdf", "excel-pdf"].includes(activeTool.id) && <p className="inline-note">Images, text, and supported layout are rendered locally. Complex Office effects and unavailable fonts may look different.</p>}
            {["pdf-word", "pdf-powerpoint"].includes(activeTool.id) && <p className="inline-note">Each PDF page becomes an image. The original appearance is preserved; its text is not editable in the output.</p>}
            {activeTool.id === "optimize" && <p className="inline-note"><Gauge /> GHOST PDF will rebuild the file using compact object streams. Results vary depending on the source PDF.</p>}
            {error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status"><Check /> {message}</p>}
            <button className="process-button" onClick={() => void processFiles()} disabled={busy}>{busy ? <><span className="spinner" /> Processing on your device…</> : <><activeTool.Icon /> {activeTool.name} <Download /></>}</button>
          </div>}
          {!files.length && error && <p className="feedback error standalone" role="alert">{error}</p>}
        </fieldset>
      </div>
    </div></section>

    <section className="trust-section" id="privacy"><div className="trust-copy"><span className="eyebrow"><ShieldCheck /> Privacy built in</span><h2>Your document stays yours.</h2><p>GHOST PDF processes files in browser memory. Your documents are not uploaded, stored, or inspected by us.</p></div><div className="trust-steps"><div><span>01</span><strong>Choose locally</strong><p>Your browser reads the file from your device.</p></div><div><span>02</span><strong>Process privately</strong><p>The change happens in temporary browser memory.</p></div><div><span>03</span><strong>Download directly</strong><p>The finished PDF returns straight to you.</p></div></div></section>

    <footer><a className="brand" href="#top"><span className="brand-mark"><FileOutput /></span><span>GHOST <b>PDF</b></span></a><p>Twenty-one private document tools, free and unlimited.</p><div><a href="#tools">Tools</a><a href="#privacy">Privacy</a></div><small>© {new Date().getFullYear()} GHOST PDF. Files are processed locally in your browser.</small></footer>
  </main>;
}
