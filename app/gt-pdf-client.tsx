"use client";

import { ArrowDown, ArrowUp, Check, Download, FileOutput, Gauge, LockKeyhole, Menu, Plus, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { insetCropBox, parsePageSequence, pdfTextRows } from "@/lib/pdf-utils";
import { tools, categories, popularTools, toolCategory, advancedTools, type Tool, type ToolId, type Category } from "@/lib/tools";

import { ArrowRight, ArrowUpRight, Bookmark, ChevronDown, Ghost, ImagePlus, Moon, Search, Sun, Workflow, Zap } from "lucide-react";
import { DocumentStudio, SignaturePad } from "@/components/pdf/document-studio";
import { PageOrganizer } from "@/components/pdf/page-organizer";
import { AdvancedToolOptions } from "@/components/pdf/advanced-options";
import type { AdvancedOptions, Mark, ToolResult } from "@/lib/studio-types";
import type { BrowserIntelligence, LocalSummarizer, LocalTranslator } from "@/lib/document-intelligence";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const pdfWorkerUrl = `${publicBasePath}/pdf.worker.min.mjs`;

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
  const [activeTool, setActiveTool] = useState<Tool>(tools.find((tool) => tool.id === "merge")!);
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [favorites, setFavorites] = useState<ToolId[]>([]);
  const [recent, setRecent] = useState<ToolId[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [dark, setDark] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [progress, setProgress] = useState("");
  const [signatureMode, setSignatureMode] = useState("type");
  const [signatureImage, setSignatureImage] = useState("");
  const [watermarkImage, setWatermarkImage] = useState("");
  const [workflowEnabled, setWorkflowEnabled] = useState(false);
  const [translationSupport, setTranslationSupport] = useState("checking");
  const [summarySupport, setSummarySupport] = useState(false);
  const [options, setOptions] = useState<AdvancedOptions>({ officeMode: "appearance", pageRange: "", splitMode: "every", quality: .7, imageFormat: "jpg", password: "", newPassword: "", marks: [], formValues: [], flatten: false, ocrLanguage: "eng", summaryMode: "digest", sourceLanguage: "en", targetLanguage: "es", html: "", scanMode: "grayscale", scanContrast: 130, imageOrientation: "original", imageMargin: 0, workflow: { rotate: 0, number: false, watermark: "", compress: false } });
  const searchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const jobRunning = useRef(false);

  const selectTool = useCallback((tool: Tool) => {
    if (jobRunning.current) throw new Error("Wait for the current conversion to finish before changing tools.");
    setActiveTool(tool);
    setFiles([]);
    setMarks([]);
    setResult(null);
    setSignatureImage("");
    setSignatureMode("type");
    setOptions((current) => ({ ...current, formValues: [], password: "", newPassword: "" }));
    setRecent((current) => { const next = [tool.id, ...current.filter((id) => id !== tool.id)].slice(0, 5); try { localStorage.setItem("ghost-pdf-recent", JSON.stringify(next)); } catch {} return next; });
    setMessage("");
    setError("");
    setMobileMenu(false);
    setPageRange(["organize", "pdf-images"].includes(tool.id) ? "" : "1");
    requestAnimationFrame(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const savedFavorites = JSON.parse(localStorage.getItem("ghost-pdf-favorites") || "[]");
        const savedRecent = JSON.parse(localStorage.getItem("ghost-pdf-recent") || "[]");
        if (Array.isArray(savedFavorites)) setFavorites(savedFavorites.filter((id): id is ToolId => tools.some((tool) => tool.id === id)));
        if (Array.isArray(savedRecent)) setRecent(savedRecent.filter((id): id is ToolId => tools.some((tool) => tool.id === id)));
        const savedTheme = localStorage.getItem("ghost-pdf-theme");
        const isDark = savedTheme ? savedTheme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
        setDark(isDark); document.documentElement.dataset.theme = isDark ? "dark" : "light";
      } catch { /* Storage is optional. */ }
      const summarizer = (globalThis as BrowserIntelligence).Summarizer;
      if (summarizer) void summarizer.availability().then((value) => setSummarySupport(value !== "unavailable")).catch(() => setSummarySupport(false));
    });
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.current?.focus(); document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" }); }
      if (event.key === "Escape") { setMobileMenu(false); searchInput.current?.blur(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", shortcut); };
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Some Chromium builds expose the API but never settle availability().
    // Keep the action disabled until support is known, with a bounded fallback.
    void Promise.resolve().then(async () => {
      if (!active) return "unavailable";
      setTranslationSupport("checking");
      const translator = (globalThis as BrowserIntelligence).Translator;
      if (!translator || options.sourceLanguage === options.targetLanguage) return "unavailable";
      return Promise.race([
        translator.availability({ sourceLanguage: options.sourceLanguage, targetLanguage: options.targetLanguage }),
        new Promise<string>((resolve) => { timer = setTimeout(() => resolve("unavailable"), 8000); }),
      ]);
    }).then((value) => { if (active) setTranslationSupport(value === "unavailable" ? "unavailable" : value); })
      .catch(() => { if (active) setTranslationSupport("unavailable"); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [options.sourceLanguage, options.targetLanguage]);
  useEffect(() => {
    if (activeTool.id !== "forms" || !files[0]) return;
    let active = true;
    void (async () => {
      const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await files[0].arrayBuffer());
      const fields: AdvancedOptions["formValues"] = [];
      for (const field of pdf.getForm().getFields()) {
        if (field instanceof PDFTextField) fields.push({ name: field.getName(), kind: "text", value: field.getText() || "" });
        else if (field instanceof PDFCheckBox) fields.push({ name: field.getName(), kind: "check", value: field.isChecked() });
        else if (field instanceof PDFDropdown || field instanceof PDFOptionList) fields.push({ name: field.getName(), kind: "choice", value: field.getSelected()[0] || "", options: field.getOptions() });
        else if (field instanceof PDFRadioGroup) fields.push({ name: field.getName(), kind: "choice", value: field.getSelected() || "", options: field.getOptions() });
      }
      if (active) setOptions((current) => ({ ...current, formValues: fields }));
    })().catch(() => undefined);
    return () => { active = false; };
  }, [files, activeTool.id]);
  const filteredTools = useMemo(() => tools.filter((tool) => (category === "all" || toolCategory(tool.id) === category) && (!favoritesOnly || favorites.includes(tool.id)) && `${tool.name} ${tool.short} ${tool.description}`.toLowerCase().includes(query.toLowerCase().trim())), [query, category, favoritesOnly, favorites]);
  const toggleFavorite = (id: ToolId) => setFavorites((current) => { const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]; try { localStorage.setItem("ghost-pdf-favorites", JSON.stringify(next)); } catch {} return next; });
  const toggleTheme = () => { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light"; try { localStorage.setItem("ghost-pdf-theme", next ? "dark" : "light"); } catch {} };
  const readImageFile = (file: File | undefined, setImage: (value: string) => void) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setImage(String(reader.result)); reader.readAsDataURL(file); };

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
      if (["images", "scan"].includes(activeTool.id)) return ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
      if (activeTool.id === "html-pdf") return /\.html?$/i.test(file.name) || file.type === "text/html";
      if (["excel-pdf"].includes(activeTool.id)) return /\.(xlsx?|csv)$/i.test(file.name);
      if (activeTool.id === "powerpoint-pdf") return /\.pptx$/i.test(file.name);
      if (activeTool.id === "word-pdf") return /\.docx$/i.test(file.name);
      return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    });
    if (!valid.length) {
      const wanted = ["images", "scan"].includes(activeTool.id) ? "JPG or PNG images" : activeTool.id === "excel-pdf" ? "an XLSX, XLS, or CSV file" : activeTool.id === "powerpoint-pdf" ? "a PPTX file" : activeTool.id === "word-pdf" ? "a DOCX file" : "a PDF file";
      setError(`Choose ${wanted}.`);
      return;
    }
    setResult(null); setMarks([]);
    setFiles((current) => {
      const limit = activeTool.id === "compare" ? 2 : ["edit", "forms", "redact", "crop", "sign", "translate", "summarize", "html-pdf"].includes(activeTool.id) ? 1 : 20;
      const combined = limit === 1 ? valid.slice(0, 1) : [...current, ...valid];
      if (combined.length > limit) setError(`This tool accepts up to ${limit} files. The first ${limit} were kept.`);
      return combined.slice(0, limit);
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
    if (!selectedFiles.length && activeTool.id === "html-pdf" && options.html.trim()) selectedFiles = [new File([options.html], "document.html", { type: "text/html" })];
    if (!selectedFiles.length || (!nested && jobRunning.current)) return;
    if (!nested && selectedFiles.length > 1 && !["merge", "images", "scan", "compare"].includes(activeTool.id)) {
      jobRunning.current = true;
      setBusy(true);
      setResult(null);
      setProgress("Starting privately on your device…");
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
        const zipped = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
        downloadBytes(zipped, filename, "application/zip");
        setResult({ output: zipped, filename, mime: "application/zip" });
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
      setResult(null);
      setProgress("Starting privately on your device…");
      setError("");
      setMessage("");
    }
    let pdfTask: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentLoadingTask | undefined;
    try {
      if (["pdf-word", "pdf-powerpoint"].includes(activeTool.id) && options.officeMode === "editable") {
        const { editableOfficeExport } = await import("@/lib/editable-office"); const converted = await editableOfficeExport(selectedFiles[0], activeTool.id as "pdf-word" | "pdf-powerpoint", publicBasePath);
        if (nested) return converted; downloadBytes(converted.output, converted.filename, converted.mime); setResult(converted); setMessage(converted.detail || "Your editable document is ready."); return;
      }
      if (advancedTools.has(activeTool.id)) {
        const sessions: { translator?: Promise<LocalTranslator>; summarizer?: Promise<LocalSummarizer> } = {};
        const intelligence = globalThis as BrowserIntelligence;
        const monitor = (events: EventTarget) => events.addEventListener("downloadprogress", (event) => { const loaded = (event as Event & { loaded?: number }).loaded; setProgress(`Downloading on-device model${typeof loaded === "number" ? ` · ${Math.round(loaded * 100)}%` : ""}…`); });
        if (activeTool.id === "translate") {
          if (!intelligence.Translator) throw new Error("Private translation needs a supported desktop Chrome or Edge browser.");
          sessions.translator = intelligence.Translator.create({ sourceLanguage: options.sourceLanguage, targetLanguage: options.targetLanguage, monitor }).then((instance) => { let destroyed = false; return { translate: instance.translate.bind(instance), destroy: () => { if (!destroyed) { destroyed = true; instance.destroy(); } } }; });
          void sessions.translator.catch(() => undefined);
        }
        if (activeTool.id === "summarize" && options.summaryMode === "ai") {
          if (!intelligence.Summarizer) throw new Error("On-device AI is not supported here. Choose Key sentences instead.");
          sessions.summarizer = intelligence.Summarizer.create({ type: "key-points", format: "markdown", length: "medium", monitor }).then((instance) => { let destroyed = false; return { summarize: instance.summarize.bind(instance), destroy: () => { if (!destroyed) { destroyed = true; instance.destroy(); } } }; });
          void sessions.summarizer.catch(() => undefined);
        }
        const { runAdvancedTool, applyPdfWorkflow } = await import("@/lib/advanced-tools");
        let converted: ToolResult;
        try { converted = await runAdvancedTool(activeTool.id, selectedFiles, { ...options, pageRange, marks }, setProgress, publicBasePath, sessions); }
        finally { void sessions.translator?.then((instance) => instance.destroy()).catch(() => undefined); void sessions.summarizer?.then((instance) => instance.destroy()).catch(() => undefined); }
        if (workflowEnabled && converted.mime === "application/pdf" && !["protect", "pdfa", "forms"].includes(activeTool.id)) converted.output = await applyPdfWorkflow(converted.output, options.workflow, publicBasePath);
        if (nested) return converted;
        downloadBytes(converted.output, converted.filename, converted.mime); setResult(converted);
        setMessage(converted.detail || `Done — ${converted.filename} is ready.`); return;
      }
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
          const margin = options.imageMargin;
          const pageSize: [number, number] = options.imageOrientation === "portrait" ? [595.28, 841.89] : options.imageOrientation === "landscape" ? [841.89, 595.28] : [width + margin * 2, height + margin * 2];
          const fit = Math.min((pageSize[0] - margin * 2) / width, (pageSize[1] - margin * 2) / height);
          const page = result.addPage(pageSize);
          page.drawImage(image, { x: (pageSize[0] - width * fit) / 2, y: (pageSize[1] - height * fit) / 2, width: width * fit, height: height * fit });
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
          if (!watermark.trim() && !watermarkImage) throw new Error("Enter watermark text or choose an image.");
          const font = await source.embedFont(StandardFonts.HelveticaBold);
          const image = watermarkImage ? watermarkImage.startsWith("data:image/png") ? await source.embedPng(watermarkImage) : await source.embedJpg(watermarkImage) : null;
          source.getPages().forEach((page) => {
            if (image) { const scale = Math.min(page.getWidth() * .65 / image.width, page.getHeight() * .4 / image.height); page.drawImage(image, { x: (page.getWidth() - image.width * scale) / 2, y: (page.getHeight() - image.height * scale) / 2, width: image.width * scale, height: image.height * scale, opacity: watermarkOpacity }); return; }
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
          const crops = marks.filter((mark) => mark.kind === "crop");
          if (crops.length) {
            const { openLocalPdf } = await import("@/lib/pdf-render"); const opened = await openLocalPdf(selectedFiles[0], publicBasePath);
            try { for (const mark of crops) { const viewport = (await opened.document.getPage(mark.page + 1)).getViewport({ scale: 1 }); const a = viewport.convertToPdfPoint(mark.x * viewport.width, mark.y * viewport.height), b = viewport.convertToPdfPoint((mark.x + mark.width) * viewport.width, (mark.y + mark.height) * viewport.height); source.getPage(mark.page).setCropBox(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); } } finally { await opened.close(); }
          } else source.getPages().forEach((page) => {
            const { x, y, width, height } = insetCropBox(page.getCropBox(), cropMargin); page.setCropBox(x, y, width, height);
          });
          output = await source.save({ useObjectStreams: true });
        } else if (activeTool.id === "sign") {
          if (signatureMode !== "type") {
            if (!signatureImage && !marks.some((mark) => mark.kind === "image")) throw new Error("Draw or upload your signature first.");
            const { renderEditedPdf } = await import("@/lib/advanced-tools");
            const signatureMarks = marks.filter((mark) => mark.kind === "image");
            output = await renderEditedPdf(selectedFiles[0], signatureMarks.length ? signatureMarks : [{ id: "signature", page: total - 1, kind: "image", x: .58, y: .82, width: .34, height: .1, dataUrl: signatureImage }], publicBasePath);
          } else {
          if (!signature.trim()) throw new Error("Type the name you want to use as your signature.");
          const font = await source.embedFont(StandardFonts.TimesRomanItalic);
          const page = source.getPage(total - 1);
          const { width } = page.getSize();
          const size = 24;
          const textWidth = font.widthOfTextAtSize(signature, size);
          page.drawText(signature, { x: Math.max(36, width - textWidth - 44), y: 42, size, font, color: rgb(0.08, 0.13, 0.32) });
          output = await source.save({ useObjectStreams: true });
          }
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
      if (workflowEnabled && mime === "application/pdf") {
        const { applyPdfWorkflow } = await import("@/lib/advanced-tools"); output = await applyPdfWorkflow(output, options.workflow, publicBasePath);
      }
      if (nested) return { output, filename, mime };
      downloadBytes(output, filename, mime);
      setResult({ output, filename, mime });
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
  const rangeHelp = activeTool.id === "organize" ? "Drag thumbnails or enter any page order, including reverse ranges: 5-1, 8, 10." : "Use commas and ranges, for example 1-3, 6.";
  const isImageTool = ["images", "scan"].includes(activeTool.id);
  const isVisualTool = ["edit", "forms", "redact", "crop", "sign"].includes(activeTool.id);
  const isSingleFileTool = isVisualTool || ["translate", "summarize", "html-pdf"].includes(activeTool.id);
  const inputNoun = isImageTool ? "your images" : activeTool.id === "excel-pdf" ? "your spreadsheets" : activeTool.id === "powerpoint-pdf" ? "your presentations" : activeTool.id === "word-pdf" ? "your Word documents" : activeTool.id === "html-pdf" ? "your HTML file" : activeTool.id === "compare" ? "two PDFs" : "your PDFs";
  const hasInput = files.length > 0 || (activeTool.id === "html-pdf" && Boolean(options.html.trim()));
  const canPreview = files.length > 0 && /\.pdf$/i.test(files[0].name) && !["unlock", "repair", "protect", "compare", "organize"].includes(activeTool.id) && !(activeTool.id === "sign" && signatureMode === "type");
  const saveRecipe = () => { try { localStorage.setItem("ghost-pdf-workflow", JSON.stringify(options.workflow)); setMessage("Workflow saved on this device."); } catch { setError("This browser could not save the workflow."); } };
  const loadRecipe = () => { try { const saved = JSON.parse(localStorage.getItem("ghost-pdf-workflow") || "null"); if (saved && [0, 90, 180, 270].includes(saved.rotate) && typeof saved.number === "boolean" && typeof saved.watermark === "string" && typeof saved.compress === "boolean") { setOptions((current) => ({ ...current, workflow: saved })); setWorkflowEnabled(true); setMessage("Saved workflow loaded."); } else setMessage("Save a workflow first, then reuse it here."); } catch { setError("The saved workflow could not be read."); } };

  return <main id="top">
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <div className="ambient-light ambient-one" aria-hidden="true"/><div className="ambient-light ambient-two" aria-hidden="true"/>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="GHOST PDF home"><span className="brand-mark"><Ghost size={22}/></span><span>GHOST <b>PDF</b></span></a>
      <nav className={mobileMenu ? "nav-links open" : "nav-links"} aria-label="Main navigation"><a href="#tools" onClick={() => setMobileMenu(false)}>All tools</a><a href="#workspace" onClick={() => setMobileMenu(false)}>Workspace</a><a href="#privacy" onClick={() => setMobileMenu(false)}>Privacy</a></nav>
      <div className="header-actions"><button type="button" className="header-search" aria-label="Search tools" onClick={() => { searchInput.current?.focus(); document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" }); }}><Search/><kbd>⌘ K</kbd></button><button type="button" className="icon-button theme-button" onClick={toggleTheme} aria-label={dark ? "Use light appearance" : "Use dark appearance"}>{dark ? <Sun/> : <Moon/>}</button><a className="header-cta" href="#tools">Get started <ArrowUpRight/></a><button type="button" className="menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="Toggle navigation" aria-expanded={mobileMenu}>{mobileMenu ? <X/> : <Menu/>}</button></div>
    </header>
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><span className="status-dot"/> A little more effortless.</span><h1>Everything PDF.<br/><em>Beautifully simple.</em></h1><p>Big ideas deserve less busywork. Convert, edit, and protect your documents in one thoughtful workspace.</p><div className="hero-actions"><a className="primary-button" href="#tools">Find your tool <ArrowRight/></a><a className="text-link" href="#privacy"><ShieldCheck/> Yours. And only yours.</a></div><div className="hero-proof"><span><Check/> No account</span><span><Check/> Files stay local</span><span><Check/> Free to use</span></div></div>
      <div className="hero-experience" aria-label="Sample document conversion preview"><div className="hero-glow"/>
        <div className="floating-label label-private"><span className="mini-icon"><LockKeyhole/></span><div><strong>Private by design</strong><small>On your device. Always.</small></div><ShieldCheck/></div>
        <div className="sample-document"><div className="document-top"><span className="pdf-file-badge">PDF</span><span>Sample document</span><span>•••</span></div><div className="document-content"><span className="document-kicker">A clearer picture.</span><h3>Good ideas.<br/>Ready to go.</h3><div className="sample-lines"><i/><i/><i/></div><div className="sample-chart"><i/><i/><i/><i/><i/><i/><i/></div><div className="sample-document-foot"><span>Quarterly overview</span><span>01</span></div></div></div>
        <button type="button" className="converted-card" onClick={() => selectTool(tools.find((tool) => tool.id === "pdf-word")!)} disabled={busy}><span className="word-file-badge">W</span><span><strong>From PDF. To possibility.</strong><small>Try PDF to Word <ArrowUpRight/></small></span><span className="conversion-check"><Check/></span></button>
        <div className="floating-label label-tools"><span className="orbital-icon"><Sparkles/></span><div><strong>{tools.length} thoughtful tools</strong><small>One beautifully simple place.</small></div></div>
      </div>
    </section>
    <section className="quick-tools" aria-label="Popular tools"><span>Your everyday essentials</span><div>{popularTools.map((id) => { const tool = tools.find((item) => item.id === id)!; return <button type="button" key={id} onClick={() => selectTool(tool)} disabled={busy}><tool.Icon/><span>{tool.name}</span><ArrowUpRight/></button>; })}</div></section>
    <section className="tools-section" id="tools">
      <div className="section-heading"><div><span className="kicker">THE TOOLKIT</span><h2>Find your flow.</h2><p>One task or a whole to-do list. There’s a tool for that.</p></div><div className="tool-search"><Search/><input ref={searchInput} type="search" aria-label="Search PDF tools" placeholder="What would you like to do?" value={query} onChange={(event) => setQuery(event.target.value)}/>{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X/></button> : <kbd>⌘ K</kbd>}</div></div>
      <div className="tool-filter-row"><div className="category-tabs" role="tablist" aria-label="Tool categories">{categories.map((item) => <button type="button" key={item.id} role="tab" aria-selected={category === item.id && !favoritesOnly} className={category === item.id && !favoritesOnly ? "active" : ""} onClick={() => { setCategory(item.id); setFavoritesOnly(false); }}>{item.label}</button>)}</div><button type="button" className={`favorites-filter ${favoritesOnly ? "active" : ""}`} onClick={() => { setFavoritesOnly((current) => !current); setCategory("all"); }} aria-pressed={favoritesOnly}><Bookmark/> Saved <span>{favorites.length}</span></button></div>
      <p className="search-status" aria-live="polite">{filteredTools.length} {favoritesOnly ? "saved " : ""}tools{query ? ` matching “${query}”` : category === "all" ? " · all on your device" : ` · ${categories.find((item) => item.id === category)?.label}`}</p>
      <div className="tool-grid">{filteredTools.map((tool) => <article className={`tool-tile ${activeTool.id === tool.id ? "active" : ""}`} key={tool.id}><button type="button" className={`tool-card ${activeTool.id === tool.id ? "active" : ""}`} onClick={() => selectTool(tool)} disabled={busy}><ToolGlyph tool={tool}/><span className="tool-card-copy"><strong className="tool-title">{tool.name}</strong><small>{tool.short}</small></span><ArrowUpRight className="tool-arrow"/></button><button type="button" className={`favorite-button ${favorites.includes(tool.id) ? "saved" : ""}`} onClick={() => toggleFavorite(tool.id)} aria-label={`${favorites.includes(tool.id) ? "Unsave" : "Save"} ${tool.name}`} aria-pressed={favorites.includes(tool.id)}><Bookmark/></button></article>)}</div>
      {!filteredTools.length && <div className="empty-search"><Search/><h3>{favoritesOnly ? "Your favorites belong here." : "Let’s try another search."}</h3><p>{favoritesOnly ? "Tap a bookmark on any tool to save it for next time." : "Try “merge”, “Word”, “password”, or “pages”."}</p><button type="button" className="subtle-button" onClick={() => { setQuery(""); setCategory("all"); setFavoritesOnly(false); }}>Show all tools <ArrowRight/></button></div>}
    </section>
    <section className="workspace-wrap" id="workspace"><div className="workspace-shell">
      <div className="workspace-heading"><div><span className="kicker">YOUR WORKSPACE</span><h2>{activeTool.name}<span className="workspace-dot">.</span></h2><p>{activeTool.description}</p></div><span className="local-processing"><LockKeyhole/> Private on your device</span></div>
      {recent.length > 0 && <div className="recent-tools"><span>Pick up where you left off</span>{recent.slice(0, 4).map((id) => { const tool = tools.find((item) => item.id === id); return tool && <button type="button" key={id} disabled={busy} onClick={() => selectTool(tool)} className={id === activeTool.id ? "active" : ""}>{tool.name}</button>; })}</div>}
      <div className="workspace-card"><fieldset className="processing-fields" disabled={busy}>
        <div className="input-pane"><div className={`dropzone ${dragging ? "dragging" : ""} ${files.length ? "has-files" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles([...event.dataTransfer.files]); }}>
          <input ref={fileInput} type="file" accept={activeTool.accept} multiple={!isSingleFileTool} capture={activeTool.id === "scan" ? "environment" : undefined} hidden onChange={(event) => { addFiles([...(event.target.files ?? [])]); event.currentTarget.value = ""; }}/>
          <span className="upload-icon"><UploadCloud/></span><h3>{files.length ? isSingleFileTool ? "Your file is ready." : "Room for another?" : `Drop ${inputNoun} here.`}</h3><p>{files.length ? isSingleFileTool ? "Continue below or choose a replacement file." : "Add more files or continue with your selection." : "A simple drop. A little less work."}</p><button type="button" className="secondary-button" onClick={() => fileInput.current?.click()}><Plus/>{activeTool.id === "scan" ? "Capture or choose photos" : files.length ? isSingleFileTool ? "Replace file" : "Add files" : "Choose files"}</button><small><LockKeyhole/>{activeTool.id === "compare" ? "2 PDFs" : isSingleFileTool ? activeTool.id === "html-pdf" ? "1 HTML file" : "1 PDF" : "Up to 20 files"} · never uploaded</small>
        </div>
        {activeTool.id === "html-pdf" && <label className="option-field html-input"><span>Or paste your HTML</span><textarea aria-label="HTML source" rows={7} placeholder="<h1>Hello, world.</h1>" value={options.html} onChange={(event) => setOptions((current) => ({ ...current, html: event.target.value }))}/><small>Local HTML and embedded data images only. External websites and resources are not fetched.</small></label>}
        {files.length > 0 && <div className="selected-files"><div className="file-list-heading"><strong>{files.length} {files.length === 1 ? "file" : "files"} ready</strong><span>{formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</span></div><div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}><span className="file-type">{file.name.split(".").pop()?.slice(0, 4).toUpperCase()}</span><span className="file-name"><strong>{file.name}</strong><small>{formatBytes(file.size)} · stays on your device</small></span>{activeTool.multiple && <span className="order-buttons"><button type="button" onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label={`Move ${file.name} up`}><ArrowUp/></button><button type="button" onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`}><ArrowDown/></button></span>}<button type="button" className="remove-button" onClick={() => { setFiles((current) => current.filter((_, position) => position !== index)); setMarks([]); setResult(null); }} aria-label={`Remove ${file.name}`}><X/></button></div>)}</div></div>}
        {activeTool.id === "organize" && files[0] && <PageOrganizer file={files[0]} sequence={pageRange} onChange={setPageRange} basePath={publicBasePath} disabled={busy}/>}
        {canPreview && <DocumentStudio key={`${activeTool.id}-${files[0].name}-${files[0].lastModified}-${signatureMode}`} file={files[0]} tool={activeTool.id} marks={marks} setMarks={setMarks} disabled={busy} basePath={publicBasePath} signatureImage={signatureImage} formValues={options.formValues}/>}
        </div>
        <div className={`job-panel ${hasInput ? "ready" : "waiting"}`}><div className="settings-heading"><span className="settings-icon"><activeTool.Icon/></span><div><h3>{hasInput ? "Make it just right." : "A fresh start awaits."}</h3><p>{hasInput ? "A few options. Then you’re on your way." : "Your options will be ready when your file is."}</p></div><span className="step-number">02</span></div>
        {hasInput ? <>
            {["extract", "organize", "duplicate", "delete"].includes(activeTool.id) && <label className="option-field"><span>{rangeLabel}</span><input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-3, 6, 9-12" /><small>{rangeHelp}</small></label>}
            {activeTool.id === "rotate" && <fieldset className="option-field"><legend>Rotate every page</legend><div className="choice-row">{[90, 180, 270].map((angle) => <button type="button" className={rotation === angle ? "choice active" : "choice"} key={angle} onClick={() => setRotation(angle)}>{angle}°</button>)}</div></fieldset>}
            {activeTool.id === "number" && <label className="option-field"><span>Number position</span><select value={numberPosition} onChange={(event) => setNumberPosition(event.target.value)}><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option></select></label>}
            {activeTool.id === "watermark" && <div className="options-grid"><label className="option-field"><span>Watermark text</span><input value={watermark} maxLength={40} onChange={(event) => setWatermark(event.target.value)} /></label><label className="option-field"><span>Opacity: {Math.round(watermarkOpacity * 100)}%</span><input type="range" min="0.08" max="0.5" step="0.02" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></label></div>}
            {activeTool.id === "watermark" && <div className="watermark-image-option"><label className="image-upload"><ImagePlus/><span>{watermarkImage ? "Replace image watermark" : "Or choose an image watermark"}</span><input type="file" accept="image/png,image/jpeg" onChange={(event) => readImageFile(event.target.files?.[0], setWatermarkImage)}/></label>{watermarkImage && <button type="button" className="subtle-button" onClick={() => setWatermarkImage("")}>Use text instead</button>}</div>}
            {activeTool.id === "images" && <div className="options-grid"><label className="option-field"><span>Page orientation</span><select value={options.imageOrientation} onChange={(e) => setOptions((current) => ({ ...current, imageOrientation: e.target.value }))}><option value="original">Fit each image</option><option value="portrait">A4 portrait</option><option value="landscape">A4 landscape</option></select></label><label className="option-field"><span>Margin: {options.imageMargin} pt</span><input type="range" min="0" max="48" step="4" value={options.imageMargin} onChange={(e) => setOptions((current) => ({ ...current, imageMargin: Number(e.target.value) }))}/></label></div>}
            {activeTool.id === "crop" && <label className="option-field"><span>Crop margin: {cropMargin} pt</span><input type="range" min="0" max="72" step="2" value={cropMargin} onChange={(event) => setCropMargin(Number(event.target.value))} /><small>Without a visual selection, this margin trims all four sides of every page. Draw a crop on the preview to crop only that page.</small></label>}
            {activeTool.id === "sign" && <><div className="segmented-control signature-modes" aria-label="Signature method">{["type", "draw", "upload"].map((mode) => <button type="button" key={mode} className={signatureMode === mode ? "active" : ""} onClick={() => { setSignatureMode(mode); setMarks([]); }}>{mode === "type" ? "Type" : mode === "draw" ? "Draw" : "Upload"}</button>)}</div>{signatureMode === "type" ? <label className="option-field"><span>Signature name</span><input value={signature} maxLength={60} onChange={(event) => setSignature(event.target.value)} placeholder="Type your name"/><small>Placed at the bottom-right of the final page.</small></label> : <>{signatureMode === "draw" ? <SignaturePad onChange={setSignatureImage} disabled={busy}/> : <label className="image-upload"><ImagePlus/><span>Choose a signature image</span><input type="file" accept="image/png,image/jpeg" onChange={(event) => readImageFile(event.target.files?.[0], setSignatureImage)}/></label>}{signatureImage && <div className="signature-preview"><img src={signatureImage} alt="Your signature"/><p>Placed on the last page. Use Add image in the preview to choose a different position.</p></div>}<p className="inline-note">A visual signature, not a certificate-based digital signature. Image and drawing exports are flattened.</p></>}</>}
            {activeTool.id === "metadata" && <div className="metadata-grid"><label className="option-field"><span>Document title</span><input value={meta.title} onChange={(event) => setMeta({ ...meta, title: event.target.value })} /></label><label className="option-field"><span>Author</span><input value={meta.author} onChange={(event) => setMeta({ ...meta, author: event.target.value })} /></label><label className="option-field"><span>Subject</span><input value={meta.subject} onChange={(event) => setMeta({ ...meta, subject: event.target.value })} /></label><label className="option-field"><span>Keywords</span><input value={meta.keywords} onChange={(event) => setMeta({ ...meta, keywords: event.target.value })} placeholder="invoice, final, 2026" /></label></div>}
            {["word-pdf", "powerpoint-pdf", "excel-pdf"].includes(activeTool.id) && <p className="inline-note">Images, text, and supported layout are rendered locally. Complex Office effects and unavailable fonts may look different.</p>}
            {["pdf-word", "pdf-powerpoint"].includes(activeTool.id) && <><label className="option-field"><span>Output mode</span><select value={options.officeMode} onChange={(event) => setOptions((current) => ({ ...current, officeMode: event.target.value }))}><option value="appearance">Keep appearance · page images</option><option value="editable">Editable text · simpler layout</option></select></label><p className="inline-note">{options.officeMode === "appearance" ? "Each PDF page becomes an image. Appearance is preserved; the text is not editable." : "Creates editable text and simple tables or slide text boxes. Original images, fonts, and complex layouts are not reproduced. Use OCR first for scans."}</p></>}
            {activeTool.id === "optimize" && <p className="inline-note"><Gauge /> GHOST PDF will rebuild the file using compact object streams. Results vary depending on the source PDF.</p>}

          <AdvancedToolOptions id={activeTool.id} options={options} setOptions={setOptions} pageRange={pageRange} setPageRange={setPageRange} translationSupport={translationSupport} summarySupport={summarySupport}/>
          {!["protect", "pdfa", "forms", "pdf-images", "split", "markdown", "summarize", "translate", "pdf-word", "pdf-excel", "pdf-powerpoint"].includes(activeTool.id) && <details className="workflow-panel"><summary><Workflow/><span>Do a little more. In one go.</span><ChevronDown/></summary><div className="workflow-content"><label className="check-option"><input type="checkbox" checked={workflowEnabled} onChange={(event) => setWorkflowEnabled(event.target.checked)}/><span>Apply a finishing workflow</span></label>{workflowEnabled && <><label className="option-field"><span>Then rotate every page</span><select value={options.workflow.rotate} onChange={(event) => setOptions((current) => ({ ...current, workflow: { ...current.workflow, rotate: Number(event.target.value) } }))}><option value="0">Keep orientation</option><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></label><label className="check-option"><input type="checkbox" checked={options.workflow.number} onChange={(event) => setOptions((current) => ({ ...current, workflow: { ...current.workflow, number: event.target.checked } }))}/><span>Add page numbers</span></label><label className="option-field"><span>Then add a watermark</span><input value={options.workflow.watermark} maxLength={40} placeholder="Optional text" onChange={(event) => setOptions((current) => ({ ...current, workflow: { ...current.workflow, watermark: event.target.value } }))}/></label><label className="check-option"><input type="checkbox" checked={options.workflow.compress} onChange={(event) => setOptions((current) => ({ ...current, workflow: { ...current.workflow, compress: event.target.checked } }))}/><span>Finish with visual compression (flattens pages)</span></label></>}<div className="recipe-actions"><button type="button" className="subtle-button" onClick={saveRecipe}>Save workflow</button><button type="button" className="subtle-button" onClick={loadRecipe}>Use saved workflow</button></div><small>Only this recipe is saved. Your documents and passwords are never stored.</small></div></details>}
          {error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status"><Check/>{message}</p>}
          <button type="button" className="process-button" onClick={() => void processFiles()} disabled={busy || (activeTool.id === "translate" && ["unavailable", "checking"].includes(translationSupport))}>{busy ? <><span className="spinner"/><span>{progress || "Processing on your device…"}</span></> : <><span>{activeTool.id === "edit" || activeTool.id === "forms" || activeTool.id === "redact" ? "Save your PDF" : activeTool.name}</span><ArrowRight/></>}</button>
          <p className="processing-promise"><LockKeyhole/> Made here. Downloaded here. Never uploaded.</p>
        </> : <div className="workspace-empty"><div className="empty-orbit"><FileOutput/><Sparkles/></div><span className="empty-step">01 / Choose your file</span><h4>Good things start<br/>with a simple drop.</h4><p>Choose a file on the left.<br/>We’ll take it from there.</p><span><ShieldCheck/> Private. Free. Yours.</span></div>}
        {!hasInput && error && <p className="feedback error" role="alert">{error}</p>}
        {result && <div className="result-card"><div className="result-heading"><span><Check/></span><div><strong>Ready for what’s next.</strong><small>{result.filename} · {formatBytes(result.output.length)}</small></div></div><button type="button" className="download-again" onClick={() => downloadBytes(result.output, result.filename, result.mime)}><Download/> Download again</button>{result.text && <details className="text-output"><summary>Read the result <ChevronDown/></summary><pre>{result.text}</pre></details>}{result.preview && <div className="comparison-preview">{result.preview.map((src, index) => <figure key={index}><figcaption>{index ? "After · changes highlighted" : "Before"}</figcaption><img src={src} alt={index ? "Comparison after with changes highlighted" : "Comparison before"}/></figure>)}</div>}</div>}
        </div>
      </fieldset></div>
    </div></section>
    <section className="trust-section" id="privacy"><div className="trust-heading"><span className="kicker">BUILT AROUND YOU</span><h2>Your files.<br/><em>Your business.</em></h2><p>Powerful tools shouldn’t come at the cost of your privacy. Your documents are processed right in your browser, on your own device.</p></div><div className="trust-grid"><article className="trust-card trust-card-large"><div className="privacy-illustration"><div className="privacy-ring"/><span><ShieldCheck/></span><i/><i/></div><div><span className="kicker">PRIVATE BY DEFAULT</span><h3>What’s yours<br/>stays yours.</h3><p>No document uploads. No conversion server. Just you and your browser.</p></div></article><article className="trust-card"><span className="trust-icon"><Zap/></span><h3>Less friction.<br/>More flow.</h3><p>No sign-up. No daily usage cap. Save favorite tools and reusable workflows on this device.</p><span className="micro-label"><Check/> Ready when you are</span></article><article className="trust-card"><span className="trust-icon"><Workflow/></span><h3>A little smarter.<br/>A lot simpler.</h3><p>Live previews, visual editing, and clear options help you get it right the first time.</p><a href="#tools" className="text-link">Find your next tool <ArrowRight/></a></article></div></section>
    <section className="closing-note"><span className="brand-mark"><Ghost/></span><h2>Make room for<br/>what matters.</h2><a className="primary-button" href="#tools">Let’s get it done <ArrowRight/></a><p>{tools.length} tools. One less thing to worry about.</p></section>
    <footer><div className="footer-top"><a className="brand" href="#top"><span className="brand-mark"><Ghost/></span><span>GHOST <b>PDF</b></span></a><p>A clearer way to work with documents.</p><div><a href="#tools">All tools</a><a href="#workspace">Workspace</a><a href="#privacy">Privacy</a></div></div><div className="footer-bottom"><small>© {new Date().getFullYear()} GHOST PDF</small><span><span className="status-dot"/> Thoughtfully made. Privately processed.</span><a href={`${publicBasePath}/third-party-notices.txt`}>Acknowledgements</a></div></footer>
  </main>;
}
