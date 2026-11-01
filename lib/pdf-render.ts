import { assertPageCount, assertPageGeometry, validateInputFile, FILE_LIMITS } from "./file-safety";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function openLocalPdf(file: File, basePath = "", password = "", signal?: AbortSignal) {
  await validateInputFile(file, "pdf-word", signal);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({ maxImageSize: FILE_LIMITS.imagePixels, canvasMaxAreaInBytes: 64 * 1024 * 1024, data: new Uint8Array(await file.arrayBuffer()), password,
    cMapUrl: `${basePath}/pdfjs/cmaps/`, standardFontDataUrl: `${basePath}/pdfjs/standard_fonts/`,
    wasmUrl: `${basePath}/pdfjs/wasm/`, iccUrl: `${basePath}/pdfjs/iccs/` });
  const abort = () => { void task.destroy().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) throw new DOMException("Preview canceled.", "AbortError");
    const document = await task.promise; assertPageCount(document.numPages);
    return { document, close: async () => { signal?.removeEventListener("abort", abort); await task.destroy(); } };
  } catch (error) { signal?.removeEventListener("abort", abort); await task.destroy().catch(() => undefined); throw error; }
}
export async function renderLocalPage(page: PDFPageProxy, edge = 1600) {
  const original = page.getViewport({ scale: 1 });
  assertPageGeometry(original.width, original.height);
  const viewport = page.getViewport({ scale: Math.min(3, edge / Math.max(original.width, original.height)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not create a document preview.");
  await page.render({ canvas, canvasContext: context, viewport, background: "white" }).promise;
  return { canvas, context, width: original.width, height: original.height, viewport: original };
}
export async function canvasBytes(canvas: HTMLCanvasElement, mime = "image/png", quality = 0.9) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export this page.")), mime, quality));
  return new Uint8Array(await blob.arrayBuffer());
}
export async function readDocumentText(document: PDFDocumentProxy) {
  const pages: string[] = [];
  for (let n = 1; n <= document.numPages; n++) {
    const content = await (await document.getPage(n)).getTextContent();
    let text = "";
    for (const item of content.items) if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
    if (text.length + pages.reduce((n, p) => n + p.length, 0) > 2_000_000) throw new Error("The extracted text exceeds the 2 million character safety limit.");
    pages.push(text.trim());
  }
  return pages;
}
