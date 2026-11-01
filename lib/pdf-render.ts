import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function openLocalPdf(file: File, basePath = "", password = "") {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password,
    cMapUrl: `${basePath}/pdfjs/cmaps/`, standardFontDataUrl: `${basePath}/pdfjs/standard_fonts/`,
    wasmUrl: `${basePath}/pdfjs/wasm/`, iccUrl: `${basePath}/pdfjs/iccs/` });
  try { return { document: await task.promise, close: () => task.destroy() }; }
  catch (error) { await task.destroy().catch(() => undefined); throw error; }
}
export async function renderLocalPage(page: PDFPageProxy, edge = 1600) {
  const original = page.getViewport({ scale: 1 });
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
    pages.push(text.trim());
  }
  return pages;
}
