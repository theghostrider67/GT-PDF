"use client";

import {
  ArrowDown, ArrowRight, ArrowUp, Check, Copy, Crop, Crown, Download,
  FileImage, FileOutput, FilePenLine, Files, Gauge, Hash, Layers3,
  ListRestart, LockKeyhole, LogOut, Menu, Minimize2, Plus, RotateCw,
  ShieldCheck, Signature, Sparkles, Split, Stamp, Trash2, UploadCloud,
  UserCircle2, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ToolId = "merge" | "extract" | "organize" | "rotate" | "optimize" | "number" | "watermark" | "images" | "duplicate" | "delete" | "blank" | "reverse" | "crop" | "sign" | "metadata";
type Tool = {
  id: ToolId;
  name: string;
  short: string;
  description: string;
  Icon: typeof Files;
  color: string;
  accept: string;
  multiple: boolean;
  pro?: boolean;
};

const tools: Tool[] = [
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
  { id: "crop", name: "Crop PDF", short: "Trim page margins", description: "Apply a consistent crop margin to every page.", Icon: Crop, color: "pro", accept: "application/pdf,.pdf", multiple: false, pro: true },
  { id: "sign", name: "Sign PDF", short: "Add a text signature", description: "Place your typed signature on the final page.", Icon: Signature, color: "pro", accept: "application/pdf,.pdf", multiple: false, pro: true },
  { id: "metadata", name: "Edit metadata", short: "Title, author & topic", description: "Update document title, author, subject, and keywords.", Icon: FilePenLine, color: "pro", accept: "application/pdf,.pdf", multiple: false, pro: true },
];

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};
const safeBaseName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "document";
const downloadBytes = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function parsePageSequence(input: string, total: number, unique = true) {
  if (!input.trim()) throw new Error("Enter a page range, for example 1-3, 6.");
  const pages: number[] = [];
  for (const part of input.split(",").map((value) => value.trim()).filter(Boolean)) {
    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page < 1 || page > total) throw new Error(`Page ${page} is outside this ${total}-page PDF.`);
      pages.push(page - 1);
      continue;
    }
    const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!match) throw new Error(`“${part}” is not a valid page range.`);
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start < 1 || start > total || end < 1 || end > total) throw new Error(`“${part}” is outside pages 1–${total}.`);
    const step = start <= end ? 1 : -1;
    for (let page = start; ; page += step) {
      pages.push(page - 1);
      if (page === end) break;
    }
  }
  return unique ? [...new Set(pages)] : pages;
}

type User = { displayName: string; email: string } | null;

export default function GTPdfClient({ user, signInPath, signOutPath }: { user: User; signInPath: string; signOutPath: string }) {
  const [activeTool, setActiveTool] = useState<Tool>(tools[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showLocked, setShowLocked] = useState(false);
  const [pageRange, setPageRange] = useState("1");
  const [rotation, setRotation] = useState(90);
  const [numberPosition, setNumberPosition] = useState("bottom-center");
  const [watermark, setWatermark] = useState("CONFIDENTIAL");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.18);
  const [cropMargin, setCropMargin] = useState(24);
  const [signature, setSignature] = useState("");
  const [meta, setMeta] = useState({ title: "", author: "", subject: "", keywords: "" });
  const fileInput = useRef<HTMLInputElement>(null);
  const freeCount = useMemo(() => tools.filter((tool) => !tool.pro).length, []);

  const selectTool = useCallback((tool: Tool) => {
    setActiveTool(tool);
    setFiles([]);
    setMessage("");
    setError("");
    setShowLocked(Boolean(tool.pro && !user));
    setMobileMenu(false);
    setPageRange(tool.id === "organize" ? "3, 1, 2" : "1");
    requestAnimationFrame(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [user]);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: { toolId?: string }) => Promise<object> }, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(modelContext.registerTool({
        name: "choose_gt_pdf_tool",
        title: "Choose a GT PDF tool",
        description: "Open one of GT PDF's visible local document tools so the user can add files.",
        inputSchema: { type: "object", properties: { toolId: { type: "string", enum: tools.map((tool) => tool.id) } }, required: ["toolId"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const selected = tools.find((tool) => tool.id === input.toolId);
          if (!selected) throw new Error("Unknown PDF tool.");
          selectTool(selected);
          return { selectedTool: selected.id, status: selected.pro && !user ? "sign_in_required" : "ready_for_local_files" };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* WebMCP is optional. */ }
    return () => lifecycle.abort();
  }, [selectTool, user]);

  const addFiles = (incoming: File[]) => {
    setError("");
    setMessage("");
    const valid = incoming.filter((file) => activeTool.id === "images"
      ? ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name)
      : file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    if (!valid.length) {
      setError(activeTool.id === "images" ? "Choose JPG or PNG images." : "Choose a PDF file.");
      return;
    }
    if (!activeTool.multiple) setFiles([valid[0]]);
    else setFiles((current) => [...current, ...valid].slice(0, 20));
  };
  const moveFile = (index: number, direction: -1 | 1) => setFiles((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const processFiles = async () => {
    if (!files.length || (activeTool.pro && !user)) return;
    if (activeTool.id === "merge" && files.length < 2) {
      setError("Add at least two PDFs to merge.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { degrees, PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      let output: Uint8Array;
      let filename = `${safeBaseName(files[0].name)}-${activeTool.id}.pdf`;
      if (activeTool.id === "merge") {
        const result = await PDFDocument.create();
        for (const file of files) {
          const source = await PDFDocument.load(await file.arrayBuffer());
          const copied = await result.copyPages(source, source.getPageIndices());
          copied.forEach((page) => result.addPage(page));
        }
        output = await result.save({ useObjectStreams: true });
        filename = "merged-document.pdf";
      } else if (activeTool.id === "images") {
        const result = await PDFDocument.create();
        for (const file of files) {
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
        const source = await PDFDocument.load(await files[0].arrayBuffer());
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
            const { width, height } = page.getSize();
            const margin = Math.min(cropMargin, Math.max(0, Math.min(width, height) / 4));
            page.setCropBox(margin, margin, width - margin * 2, height - margin * 2);
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
      downloadBytes(output, filename);
      setMessage(`Done — ${filename} has been downloaded.`);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "The file could not be processed.";
      setError(detail.toLowerCase().includes("encrypt") ? "This PDF is password-protected. Unlock it before processing." : detail);
    } finally {
      setBusy(false);
    }
  };

  const rangeLabel = activeTool.id === "organize" ? "New page order" : activeTool.id === "delete" ? "Pages to remove" : activeTool.id === "duplicate" ? "Pages to copy" : "Pages to keep";
  const rangeHelp = activeTool.id === "organize" ? "Use any order, including reverse ranges: 5-1, 8, 10." : "Use commas and ranges, for example 1-3, 6.";

  return <main id="top">
    <header className="site-header">
      <a className="brand" href="#top" aria-label="GT PDF home"><span className="brand-mark"><FileOutput size={22} /></span><span>GT <b>PDF</b></span></a>
      <nav className={mobileMenu ? "nav-links open" : "nav-links"} aria-label="Main navigation">
        <a href="#tools" onClick={() => setMobileMenu(false)}>All tools</a>
        <a href="#privacy" onClick={() => setMobileMenu(false)}>Privacy</a>
        <a href="#pro" onClick={() => setMobileMenu(false)}>Pro access</a>
        {user ? <div className="account-chip"><span>{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>Pro tools unlocked</small></div><a href={signOutPath} target="_top" aria-label="Sign out"><LogOut /></a></div> : <a className="login-button" href={signInPath} target="_top"><UserCircle2 /> Sign in</a>}
      </nav>
      <button className="menu-button" onClick={() => setMobileMenu((value) => !value)} aria-label="Toggle navigation" aria-expanded={mobileMenu}>{mobileMenu ? <X /> : <Menu />}</button>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow"><ShieldCheck /> Files never leave your device</span>
        <h1>PDF jobs done.<br /><em>Right here.</em></h1>
        <p>Fast, private PDF tools for everyday work. Choose a task below and finish in a few clicks.</p>
        <div className="hero-actions"><a className="primary-button" href="#tools">Explore all tools <ArrowDown /></a><span><b>{freeCount}</b> free tools · no upload</span></div>
      </div>
      <div className="hero-panel" aria-label="GT PDF product summary">
        <div className="hero-panel-top"><span className="live-pill"><i /> Ready in your browser</span><Sparkles /></div>
        <div className="floating-docs" aria-hidden="true"><div className="doc-card back"><span /><span /><span /></div><div className="doc-card front"><b>PDF</b><span /><span /><span /></div><div className="spark spark-one">✦</div><div className="spark spark-two">✦</div></div>
        <div className="hero-stats"><div><strong>15</strong><span>total tools</span></div><div><strong>100%</strong><span>local processing</span></div><div><strong>0</strong><span>files stored</span></div></div>
      </div>
    </section>

    <section className="tools-section" id="tools">
      <div className="section-heading"><div><span className="kicker">Everything up front</span><h2>What do you need to do?</h2></div><div className="legend"><span><i className="free-dot" /> {freeCount} free</span><span><Crown /> 3 Pro with sign-in</span></div></div>
      <div className="tool-grid">{tools.map((tool, index) => <button key={tool.id} className={`tool-card ${activeTool.id === tool.id ? "active" : ""}`} onClick={() => selectTool(tool)}>
        <span className={`tool-icon ${tool.color}`}><tool.Icon /></span>
        <span className="tool-card-copy"><span className="tool-title"><strong>{tool.name}</strong>{tool.pro && <span className="pro-badge"><Crown /> Pro</span>}</span><small>{tool.short}</small></span>
        <span className="tool-index">{String(index + 1).padStart(2, "0")}</span>
      </button>)}</div>
    </section>

    <section className="workspace-wrap" id="workspace"><div className="workspace-shell">
      <div className="workspace-heading"><span className={`tool-icon ${activeTool.color}`}><activeTool.Icon /></span><div><span className="kicker">Active tool {activeTool.pro && "· Pro"}</span><h2>{activeTool.name}</h2><p>{activeTool.description}</p></div></div>
      <div className="workspace-card">
        {showLocked ? <div className="locked-panel"><span className="locked-icon"><LockKeyhole /></span><span className="pro-badge"><Crown /> Pro access</span><h3>Sign in to unlock this tool</h3><p>Your account unlocks 3 of 15 tools — exactly 20% of GT PDF — at no charge during beta.</p><a className="primary-button" href={signInPath} target="_top"><UserCircle2 /> Sign in with ChatGPT</a><small>The other {freeCount} tools stay free without an account.</small></div> : <>
          <div className={dragging ? "dropzone dragging" : "dropzone"} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles([...event.dataTransfer.files]); }}>
            <input ref={fileInput} type="file" accept={activeTool.accept} multiple={activeTool.multiple} hidden onChange={(event) => addFiles([...(event.target.files ?? [])])} />
            <span className="upload-icon"><UploadCloud /></span><h3>Drop {activeTool.id === "images" ? "images" : activeTool.multiple ? "PDFs" : "a PDF"} here</h3><p>or choose from your device</p><button className="secondary-button" onClick={() => fileInput.current?.click()}><Plus /> Choose {activeTool.id === "images" ? "images" : "files"}</button><small><LockKeyhole /> Processed locally in this browser</small>
          </div>
          {files.length > 0 && <div className="job-panel">
            <div className="file-list-heading"><strong>{files.length} {files.length === 1 ? "file" : "files"} ready</strong><span>{formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</span></div>
            <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}><span className="file-type">{activeTool.id === "images" ? "IMG" : "PDF"}</span><span className="file-name"><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>{activeTool.multiple && <span className="order-buttons"><button onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label={`Move ${file.name} up`}><ArrowUp /></button><button onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`}><ArrowDown /></button></span>}<button className="remove-button" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))} aria-label={`Remove ${file.name}`}><Trash2 /></button></div>)}</div>
            {["extract", "organize", "duplicate", "delete"].includes(activeTool.id) && <label className="option-field"><span>{rangeLabel}</span><input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-3, 6, 9-12" /><small>{rangeHelp}</small></label>}
            {activeTool.id === "rotate" && <fieldset className="option-field"><legend>Rotate every page</legend><div className="choice-row">{[90, 180, 270].map((angle) => <button type="button" className={rotation === angle ? "choice active" : "choice"} key={angle} onClick={() => setRotation(angle)}>{angle}°</button>)}</div></fieldset>}
            {activeTool.id === "number" && <label className="option-field"><span>Number position</span><select value={numberPosition} onChange={(event) => setNumberPosition(event.target.value)}><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option></select></label>}
            {activeTool.id === "watermark" && <div className="options-grid"><label className="option-field"><span>Watermark text</span><input value={watermark} maxLength={40} onChange={(event) => setWatermark(event.target.value)} /></label><label className="option-field"><span>Opacity: {Math.round(watermarkOpacity * 100)}%</span><input type="range" min="0.08" max="0.5" step="0.02" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></label></div>}
            {activeTool.id === "crop" && <label className="option-field"><span>Crop margin: {cropMargin} pt</span><input type="range" min="0" max="72" step="2" value={cropMargin} onChange={(event) => setCropMargin(Number(event.target.value))} /><small>Applied evenly to all four sides.</small></label>}
            {activeTool.id === "sign" && <label className="option-field"><span>Signature name</span><input value={signature} maxLength={60} onChange={(event) => setSignature(event.target.value)} placeholder="Type your name" /><small>Placed at the bottom-right of the final page.</small></label>}
            {activeTool.id === "metadata" && <div className="metadata-grid"><label className="option-field"><span>Document title</span><input value={meta.title} onChange={(event) => setMeta({ ...meta, title: event.target.value })} /></label><label className="option-field"><span>Author</span><input value={meta.author} onChange={(event) => setMeta({ ...meta, author: event.target.value })} /></label><label className="option-field"><span>Subject</span><input value={meta.subject} onChange={(event) => setMeta({ ...meta, subject: event.target.value })} /></label><label className="option-field"><span>Keywords</span><input value={meta.keywords} onChange={(event) => setMeta({ ...meta, keywords: event.target.value })} placeholder="invoice, final, 2026" /></label></div>}
            {activeTool.id === "optimize" && <p className="inline-note"><Gauge /> GT PDF will rebuild the file using compact object streams. Results vary depending on the source PDF.</p>}
            {error && <p className="feedback error" role="alert">{error}</p>}{message && <p className="feedback success" role="status"><Check /> {message}</p>}
            <button className="process-button" onClick={processFiles} disabled={busy}>{busy ? <><span className="spinner" /> Processing on your device…</> : <><activeTool.Icon /> {activeTool.name} <Download /></>}</button>
          </div>}
          {!files.length && error && <p className="feedback error standalone" role="alert">{error}</p>}
        </>}
      </div>
    </div></section>

    <section className="trust-section" id="privacy"><div className="trust-copy"><span className="eyebrow"><ShieldCheck /> Privacy built in</span><h2>Your document stays yours.</h2><p>GT PDF processes files in browser memory. Your documents are not uploaded, stored, or inspected by us.</p></div><div className="trust-steps"><div><span>01</span><strong>Choose locally</strong><p>Your browser reads the file from your device.</p></div><div><span>02</span><strong>Process privately</strong><p>The change happens in temporary browser memory.</p></div><div><span>03</span><strong>Download directly</strong><p>The finished PDF returns straight to you.</p></div></div></section>

    <section className="pro-section" id="pro"><div className="pro-copy"><span className="pro-badge"><Crown /> GT PDF Pro access</span><h2>Sign in. Unlock 20% more.</h2><p>Get Crop PDF, Sign PDF, and Edit metadata — 3 of the 15 tools — while every core tool stays available without an account.</p>{user ? <div className="unlocked"><Check /> Pro tools are unlocked for {user.displayName}</div> : <a className="light-button" href={signInPath} target="_top">Unlock 3 Pro tools <ArrowRight /></a>}</div><div className="pro-list">{tools.filter((tool) => tool.pro).map((tool) => <button key={tool.id} onClick={() => selectTool(tool)}><span className="tool-icon pro"><tool.Icon /></span><span><strong>{tool.name}</strong><small>{tool.short}</small></span><ArrowRight /></button>)}</div></section>

    <footer><a className="brand" href="#top"><span className="brand-mark"><FileOutput /></span><span>GT <b>PDF</b></span></a><p>Private PDF tools that work right where you are.</p><div><a href="#tools">Tools</a><a href="#privacy">Privacy</a><a href="#pro">Pro</a></div><small>© {new Date().getFullYear()} GT PDF. Files are processed locally in your browser.</small></footer>
  </main>;
}
