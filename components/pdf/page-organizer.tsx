"use client";
import { useEffect, useState } from "react";
import { Check, GripVertical, RotateCcw } from "lucide-react";
import { openLocalPdf, renderLocalPage } from "@/lib/pdf-render";
import { parsePageSequence } from "@/lib/pdf-utils";
export function PageOrganizer({ file, sequence, onChange, basePath, disabled }: { file: File; sequence: string; onChange: (value: string) => void; basePath: string; disabled: boolean }) {
  const [pages, setPages] = useState<string[]>([]); const [count, setCount] = useState(0); const [dragged, setDragged] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      const opened = await openLocalPdf(file, basePath, "", controller.signal);
      try {
        const total = opened.document.numPages;
        if (!cancelled) { setCount(total); onChange(Array.from({ length: total }, (_, i) => i + 1).join(", ")); }
        const previews: string[] = [];
        for (let n = 1; n <= Math.min(40, total); n++) { if (cancelled) break; const rendered = await renderLocalPage(await opened.document.getPage(n), 300); previews.push(rendered.canvas.toDataURL("image/jpeg", .7)); rendered.canvas.width = rendered.canvas.height = 0; }
        if (!cancelled) setPages(previews);
      } finally { await opened.close(); }
    })().catch(() => undefined);
    return () => { cancelled = true; controller.abort(); };
  }, [file, basePath, onChange]);
  let order: number[] = []; try { order = count && sequence ? parsePageSequence(sequence, count, false) : []; } catch { /* Keep the editable range available while it is incomplete. */ }
  const visible = [...new Set([...order.filter((index) => index < pages.length), ...pages.map((_, index) => index)])];
  return <div className="page-organizer"><div className="organizer-heading"><strong>Arrange your pages</strong><button type="button" className="subtle-button" disabled={disabled || !order.length} onClick={() => onChange([...order].reverse().map((n) => n + 1).join(", "))}><RotateCcw/> Reverse</button></div><p className="studio-note">Drag thumbnails to reorder. Click a page to include or exclude it.</p><div className="page-thumbnails">{visible.map((index) => <button type="button" key={index} className={`page-thumbnail ${order.includes(index) ? "included" : "excluded"}`} draggable={!disabled && order.includes(index)} disabled={disabled} aria-label={`Page ${index + 1}, ${order.includes(index) ? "included" : "excluded"}`} onClick={() => onChange((order.includes(index) ? order.filter((value) => value !== index) : [...order, index]).map((n) => n + 1).join(", "))} onDragStart={() => setDragged(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragged === null || dragged === index) return; const next = order.filter((n) => n !== dragged); const target = next.indexOf(index); next.splice(target < 0 ? next.length : target, 0, dragged); onChange(next.map((n) => n + 1).join(", ")); setDragged(null); }}><img src={pages[index]} alt={`Page ${index + 1}`}/><span><GripVertical/>{index + 1}{order.includes(index) && <Check/>}</span></button>)}</div>{count > 40 && <p className="studio-note">Previewing the first 40 pages. The page-order field supports all {count} pages.</p>}</div>;
}
