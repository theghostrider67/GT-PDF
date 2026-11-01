"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, Highlighter, ImagePlus, MousePointer2, Pencil, Square, Trash2, Type, Undo2, CheckSquare, List, ScanLine } from "lucide-react";
import { openLocalPdf, renderLocalPage } from "@/lib/pdf-render";
import type { Mark, MarkKind, FormValue } from "@/lib/studio-types";
import type { ToolId } from "@/lib/tools";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export function DocumentStudio({ file, tool, marks, setMarks, disabled, basePath, signatureImage, formValues }: { file: File; tool: ToolId; marks: Mark[]; setMarks: Dispatch<SetStateAction<Mark[]>>; disabled: boolean; basePath: string; signatureImage?: string; formValues?: FormValue[] }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState("");
  const [ratio, setRatio] = useState(1.414);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<MarkKind | "select">(tool === "redact" ? "redact" : tool === "crop" ? "crop" : tool === "forms" ? "text-field" : "select");
  const [text, setText] = useState("Your text");
  const [color, setColor] = useState("#6554e8");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Mark | null>(null);
  const [image, setImage] = useState("");
  const [imageRatio, setImageRatio] = useState(.3);
  useEffect(() => { if (!signatureImage) return; const img = new Image(); img.onload = () => setImageRatio(img.naturalHeight / img.naturalWidth); img.src = signatureImage; return () => { img.onload = null; }; }, [signatureImage]);
  const imageInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ start: { x: number; y: number }; mark?: Mark; moving?: Mark; points: Array<{ x: number; y: number }> } | null>(null);
  useEffect(() => {
    let cancelled = false; let close: (() => Promise<void>) | undefined;
    void openLocalPdf(file, basePath).then((opened) => {
      close = opened.close;
      if (cancelled) { void close(); return; }
      setPdf(opened.document); setPageIndex(tool === "sign" ? opened.document.numPages - 1 : 0);
    }).catch((caught) => { if (!cancelled) { setError(caught instanceof Error ? caught.message : "Could not preview this PDF."); setLoading(false); } });
    return () => { cancelled = true; void close?.(); };
  }, [file, basePath, tool]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    void pdf.getPage(pageIndex + 1).then(async (page) => {
      const rendered = await renderLocalPage(page, 1300);
      if (tool === "forms" && formValues?.length) {
        const viewport = page.getViewport({ scale: rendered.canvas.width / rendered.width });
        for (const annotation of await page.getAnnotations()) {
          const value = formValues.find((field) => field.name === annotation.fieldName);
          if (!value || !annotation.rect) continue;
          const first = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]); const second = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]); const rect = [...first, ...second];
          const x = Math.min(rect[0], rect[2]), y = Math.min(rect[1], rect[3]), width = Math.abs(rect[2] - rect[0]), height = Math.abs(rect[3] - rect[1]);
          const ctx = rendered.context; ctx.save(); ctx.fillStyle = "white"; ctx.fillRect(x + 2, y + 2, Math.max(0, width - 4), Math.max(0, height - 4)); ctx.fillStyle = "#172033"; ctx.font = `${Math.max(10, height * .6)}px Arial,sans-serif`; ctx.textBaseline = "middle";
          if (value.kind === "check") { if (value.value) { ctx.strokeStyle = "#172033"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + width * .2, y + height * .5); ctx.lineTo(x + width * .43, y + height * .73); ctx.lineTo(x + width * .8, y + height * .25); ctx.stroke(); } }
          else ctx.fillText(String(value.value), x + 4, y + height / 2, Math.max(1, width - 8));
          ctx.restore();
        }
      }
      return rendered;
    }).then((rendered) => {
      if (!cancelled) { setPreview(rendered.canvas.toDataURL("image/png")); setRatio(rendered.height / rendered.width); setLoading(false); }
      rendered.canvas.width = rendered.canvas.height = 0;
    }).catch((caught) => { if (!cancelled) { setLoading(false); setError(caught instanceof Error ? caught.message : "Could not preview this page."); } });
    return () => { cancelled = true; };
  }, [pdf, pageIndex, tool, formValues]);
  const editable = ["edit", "redact", "crop", "forms", "sign"].includes(tool);
  const updateMark = (id: string, patch: Partial<Mark>) => setMarks((current) => current.map((mark) => mark.id === id ? { ...mark, ...patch } : mark));
  const point = (event: React.PointerEvent<HTMLDivElement>) => { const box = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }; };
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || disabled || loading) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const start = point(event); const markId = (event.target as Element).closest("[data-mark]")?.getAttribute("data-mark");
    const existing = marks.find((mark) => mark.id === markId);
    if (existing) { setSelected(existing.id); drag.current = { start, moving: existing, points: [] }; return; }
    setSelected(null); if (mode === "select") return;
    const id = crypto.randomUUID();
    if (mode === "text" || mode === "image") {
      const dataUrl = image || signatureImage;
      if (mode === "image" && !dataUrl) { imageInput.current?.click(); return; }
      let width = .32, height = mode === "image" ? width * imageRatio / ratio : .05;
      if (height > .5) { width *= .5 / height; height = .5; }
      const mark: Mark = { id, page: pageIndex, kind: mode, x: Math.min(start.x, 1 - width), y: Math.min(start.y, 1 - height), width, height, text, color, size: .025, dataUrl };
      setMarks((current) => [...current, mark]); setSelected(id); return;
    }
    const mark: Mark = { id, page: pageIndex, kind: mode, x: start.x, y: start.y, width: 0, height: 0, color: mode === "highlight" ? "#ffc83d" : color, name: `Field ${marks.filter((mark) => mark.name).length + 1}`, options: ["Option 1", "Option 2"] };
    drag.current = { start, mark, points: [start] }; setDraft(mark);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current; if (!active) return; const current = point(event);
    if (active.moving) {
      const dx = current.x - active.start.x, dy = current.y - active.start.y;
      updateMark(active.moving.id, { x: Math.max(0, Math.min(1 - active.moving.width, active.moving.x + dx)), y: Math.max(0, Math.min(1 - active.moving.height, active.moving.y + dy)),
        ...(active.moving.points ? { points: active.moving.points.map((p) => ({ x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) })) } : {}) }); return;
    }
    if (!active.mark) return;
    active.points.push(current);
    const next = { ...active.mark, x: Math.min(active.start.x, current.x), y: Math.min(active.start.y, current.y), width: Math.abs(current.x - active.start.x), height: Math.abs(current.y - active.start.y), points: active.mark.kind === "draw" ? [...active.points] : undefined };
    if (active.mark.kind === "draw") { next.x = Math.min(...active.points.map((p) => p.x)); next.y = Math.min(...active.points.map((p) => p.y)); next.width = Math.max(...active.points.map((p) => p.x)) - next.x; next.height = Math.max(...active.points.map((p) => p.y)) - next.y; }
    setDraft(next);
  };
  const finish = () => {
    if (draft && (draft.kind === "draw" ? (draft.points?.length || 0) > 1 : draft.width > .006 && draft.height > .006)) {
      setMarks((current) => [...(draft.kind === "crop" ? current.filter((mark) => mark.kind !== "crop" || mark.page !== pageIndex) : current), draft]); setSelected(draft.id);
    }
    drag.current = null; setDraft(null);
  };
  const selectedMark = marks.find((mark) => mark.id === selected);
  const draw = (mark: Mark) => {
    const x = mark.x * 1000, y = mark.y * 1000 * ratio, w = mark.width * 1000, h = mark.height * 1000 * ratio;
    return <g key={mark.id} data-mark={mark.id} className={`studio-mark ${selected === mark.id ? "selected" : ""}`}>
      {mark.kind === "text" ? <><rect x={x} y={y} width={Math.max(80, w)} height={Math.max(35, h)} fill="transparent" stroke={selected === mark.id ? "#6554e8" : "none"} strokeDasharray="6 4"/><text x={x} y={y + 25} fontSize={(mark.size || .025) * 1000} fontFamily="Arial,sans-serif" fill={mark.color}>{mark.text}</text></>
        : mark.kind === "image" ? <image href={mark.dataUrl} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet"/>
        : mark.kind === "draw" ? <path d={mark.points?.map((p, index) => `${index ? "L" : "M"}${p.x * 1000},${p.y * 1000 * ratio}`).join(" ")} fill="none" stroke={mark.color} strokeWidth="3" strokeLinecap="round"/>
        : <><rect x={x} y={y} width={w} height={h} rx={mark.kind.includes("field") || mark.kind === "dropdown" ? 3 : 0} fill={mark.kind === "redact" ? "#000" : mark.kind === "highlight" ? "#ffd04a66" : mark.kind === "crop" ? "#6b5ceb18" : "#6554e80d"} stroke={mark.kind === "redact" ? "#000" : mark.color || "#6554e8"} strokeWidth="2" strokeDasharray={mark.kind === "crop" ? "8 5" : undefined}/>{["text-field", "checkbox", "dropdown"].includes(mark.kind) && <text x={x + 6} y={y + Math.min(22, h - 2)} fill="#6554e8" fontSize="16">{mark.kind === "checkbox" ? "✓" : mark.name}</text>}</>}
    </g>;
  };
  const suggestFields = async () => {
    if (!pdf) return; const page = await pdf.getPage(pageIndex + 1); const viewport = page.getViewport({ scale: 1 }); const content = await page.getTextContent(); const suggestions: Mark[] = [];
    for (const item of content.items) if ("str" in item && /\b(name|email|date|address|phone|company)\s*:/i.test(item.str)) {
      const xy = viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5]);
      suggestions.push({ id: crypto.randomUUID(), page: pageIndex, kind: "text-field", x: Math.min(.72, xy[0] / viewport.width + .01), y: Math.max(0, xy[1] / viewport.height - .025), width: .24, height: .035, name: `${item.str.replace(/[^a-z\s]/gi, "").trim()} ${suggestions.length + 1}` });
    }
    if (suggestions.length) setMarks((current) => [...current, ...suggestions]); else setError("No common labels were found on this page. Draw fields manually instead.");
  };
  return <div className="document-studio">
    <div className="studio-top"><span><span className="status-dot"/> Live page preview</span><div className="studio-pager"><button type="button" disabled={disabled || pageIndex === 0} onClick={() => { setLoading(true); setPageIndex((n) => n - 1); setSelected(null); }} aria-label="Previous page"><ChevronLeft/></button><span>{pageIndex + 1} <i>/ {pdf?.numPages || "–"}</i></span><button type="button" disabled={disabled || !pdf || pageIndex >= pdf.numPages - 1} onClick={() => { setLoading(true); setPageIndex((n) => n + 1); setSelected(null); }} aria-label="Next page"><ChevronRight/></button></div></div>
    {editable && <div className="studio-toolbar" role="toolbar" aria-label="Page editing tools">
      <button type="button" className={mode === "select" ? "selected" : ""} aria-label="Move or select" title="Move or select" disabled={disabled} onClick={() => setMode("select")}><MousePointer2/></button>
      {tool === "edit" && ([['text',Type,'Add text'],['highlight',Highlighter,'Highlight'],['rectangle',Square,'Shape'],['draw',Pencil,'Draw']] as const).map(([id,Icon,label]) => <button type="button" key={id} aria-label={label} title={label} className={mode === id ? "selected" : ""} disabled={disabled} onClick={() => setMode(id)}><Icon/></button>)}
      {(tool === "edit" || tool === "sign") && <button type="button" aria-label="Add image" title="Add image" disabled={disabled} onClick={() => { if (signatureImage) { setImage(signatureImage); setMode("image"); } else imageInput.current?.click(); }}><ImagePlus/></button>}
      {tool === "redact" && <button type="button" className={mode === "redact" ? "selected text-tool" : "text-tool"} disabled={disabled} onClick={() => setMode("redact")}><Square/> Redaction area</button>}
      {tool === "crop" && <button type="button" className="selected text-tool" disabled={disabled} onClick={() => setMode("crop")}><ScanLine/> Select crop</button>}
      {tool === "forms" && ([['text-field',Type,'Text field'],['checkbox',CheckSquare,'Checkbox'],['dropdown',List,'Dropdown']] as const).map(([id,Icon,label]) => <button type="button" key={id} className={mode === id ? "selected" : ""} aria-label={label} title={label} disabled={disabled} onClick={() => setMode(id)}><Icon/></button>)}
      <span className="toolbar-spacer"/><button type="button" aria-label="Undo annotation" title="Undo last mark" disabled={disabled || !marks.length} onClick={() => setMarks((current) => current.slice(0, -1))}><Undo2/></button><button type="button" aria-label="Delete selected annotation" title="Delete selected" disabled={disabled || !selected} onClick={() => { setMarks((current) => current.filter((mark) => mark.id !== selected)); setSelected(null); }}><Trash2/></button>
    </div>}
    {tool === "edit" && <div className="studio-inspector"><label><span>Text</span><input aria-label="Annotation text" value={selectedMark?.kind === "text" ? selectedMark.text || "" : text} onChange={(event) => selectedMark?.kind === "text" ? updateMark(selectedMark.id, { text: event.target.value }) : setText(event.target.value)}/></label><label className="color-field"><span>Color</span><input aria-label="Annotation color" type="color" value={selectedMark?.color || color} onChange={(event) => { setColor(event.target.value); if (selected) updateMark(selected, { color: event.target.value }); }}/></label></div>}
    {tool === "forms" && <button type="button" className="subtle-button detect-fields" disabled={disabled || !pdf} onClick={() => void suggestFields()}>Suggest fields near Name, Email, or Date labels</button>}
    {selectedMark?.name && tool === "forms" && <div className="studio-inspector"><label><span>Field name</span><input aria-label="Field name" value={selectedMark.name} onChange={(event) => updateMark(selectedMark.id, { name: event.target.value })}/></label>{selectedMark.kind === "dropdown" && <label><span>Options, comma separated</span><input aria-label="Dropdown options" value={selectedMark.options?.join(", ") || ""} onChange={(event) => updateMark(selectedMark.id, { options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })}/></label>}</div>}
    <div className="studio-desk"><div className={`studio-page ${editable ? "interactive" : ""} mode-${mode}`} style={{ aspectRatio: `1 / ${ratio}`, maxWidth: `${580 / ratio}px`, marginInline: "auto" }} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setDraft(null); }}>
      {preview && <img src={preview} alt={`Page ${pageIndex + 1} of ${file.name}`} draggable={false}/>}
      {preview && <svg className="studio-overlay" viewBox={`0 0 1000 ${1000 * ratio}`} aria-label="Page annotations">{marks.filter((mark) => mark.page === pageIndex).map(draw)}{draft && draw(draft)}</svg>}
      {loading && <div className="preview-loading"><span className="spinner"/> Preparing your page…</div>}
    </div></div>
    {error && <p className="studio-note" role="status">{error}</p>}
    {editable && <p className="studio-note">{mode === "select" ? "Select a mark to move it. Use the toolbar to add content." : mode === "text" || mode === "image" ? "Click the page to place it. Drag a placed item to move it." : "Drag on the page to select an area. Changes stay on your device."}</p>}
    <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) { const reader = new FileReader(); reader.onload = () => { setImage(String(reader.result)); const img = new Image(); img.onload = () => setImageRatio(img.naturalHeight / img.naturalWidth); img.src = String(reader.result); setMode("image"); }; reader.readAsDataURL(selected); } event.currentTarget.value = ""; }}/>
  </div>;
}
export function SignaturePad({ onChange, disabled }: { onChange: (image: string) => void; disabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 800, y: (event.clientY - rect.top) / rect.height * 240 }; };
  return <div className="signature-pad"><canvas ref={canvas} width={800} height={240} aria-label="Draw your signature" onPointerDown={(event) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); const ctx = event.currentTarget.getContext("2d")!; const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.strokeStyle = "#172033"; ctx.lineWidth = 4; ctx.lineCap = "round"; drawing.current = true; }} onPointerMove={(event) => { if (!drawing.current) return; const p = point(event); const ctx = event.currentTarget.getContext("2d")!; ctx.lineTo(p.x, p.y); ctx.stroke(); }} onPointerUp={() => { drawing.current = false; if (canvas.current) onChange(canvas.current.toDataURL("image/png")); }} onPointerCancel={() => { drawing.current = false; }}/><button type="button" className="subtle-button" disabled={disabled} onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, 800, 240); onChange(""); }}>Clear signature</button></div>;
}
