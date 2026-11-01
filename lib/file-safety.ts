import type { ToolId } from "./tools";

export const FILE_LIMITS = Object.freeze({ fileBytes: 50 * 1024 * 1024, batchBytes: 150 * 1024 * 1024, files: 20, pages: 500, outputPages: 1000, imagePixels: 40_000_000, imageEdge: 16384, archiveBytes: 150 * 1024 * 1024, archiveEntryBytes: 32 * 1024 * 1024, xmlBytes: 16 * 1024 * 1024, archiveEntries: 5000, htmlBytes: 1024 * 1024, htmlPages: 100 });
const checked = new WeakMap<File, Set<string>>();
const fail = (message: string): never => { throw new Error(message); };
const canceled = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("File checking canceled.", "AbortError"); };
export function assertFileSize(file: Pick<File, "size" | "name">, html = false) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) fail("Choose a non-empty file.");
  if (file.size > (html ? FILE_LIMITS.htmlBytes : FILE_LIMITS.fileBytes)) fail(html ? "HTML input is limited to 1 MB." : "Each file must be 50 MB or smaller.");
}
export function assertBatchSize(files: Pick<File, "size" | "name">[]) {
  if (files.length > FILE_LIMITS.files) fail("Choose up to 20 files at a time.");
  files.forEach((file) => assertFileSize(file));
  if (files.reduce((n, file) => n + file.size, 0) > FILE_LIMITS.batchBytes) fail("The combined file size must be 150 MB or smaller.");
}
export function assertPageCount(count: number, limit: number = FILE_LIMITS.pages) {
  if (!Number.isSafeInteger(count) || count < 1 || count > limit) fail(`This operation supports 1–${limit} pages. Split a larger document into smaller parts first.`);
}
export function assertPageGeometry(width: number, height: number) {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 14400)) fail("This document has invalid or unsupported page dimensions.");
}
export function assertImageDimensions(width: number, height: number) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= FILE_LIMITS.imageEdge) || width * height > FILE_LIMITS.imagePixels) fail("Choose an image up to 40 megapixels and 16,384 pixels per side.");
}
export async function validateImageFile(file: File) {
  assertFileSize(file);
  const data = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => data[i] === n)) {
    if (view.getUint32(12) !== 0x49484452) fail("This PNG has an invalid image header.");
    assertImageDimensions(view.getUint32(16), view.getUint32(20)); return;
  }
  if (data[0] === 255 && data[1] === 216) {
    let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 255) fail("This JPEG has an invalid image header.");
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > data.length) break;
      const length = view.getUint16(offset); if (length < 2 || offset + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) break;
        assertImageDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3)); return;
      }
      offset += length;
    }
  }
  fail("Choose a valid JPG or PNG image with a readable header.");
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function xmlAttribute(value: string) {
  return value.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (_, hex, dec, name) => {
    if (name) return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[name.toLowerCase()];
    const code = Number.parseInt(hex || dec, hex ? 16 : 10); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}
function inspectXml(data: Uint8Array) {
  const encoding = data[0] === 0xff && data[1] === 0xfe || data[0] === 0x3c && data[1] === 0 ? "utf-16le" : data[0] === 0xfe && data[1] === 0xff || data[0] === 0 && data[1] === 0x3c ? "utf-16be" : "utf-8";
  const text = new TextDecoder(encoding).decode(data);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) fail("Office files with XML document types or entity declarations are not supported.");
  for (const tag of text.match(/<(?:[\w.-]+:)?Relationship\b[^>]*>/gi) || []) {
    const attr = (name: string) => xmlAttribute(tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "is"))?.[2] || "");
    if (attr("TargetMode").trim().toLowerCase() === "external" && !attr("Type").endsWith("/hyperlink")) fail("This Office file links to external resources. Embed the linked content before converting.");
  }
  for (const attr of text.matchAll(/\b(?:[\w.-]+:)?(?:src|href)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    if (/^(?:https?:|file:|ftp:|\/\/)/i.test(xmlAttribute(attr[2]).trim())) fail("This Office file links to external resources. Embed the linked content before converting.");
  }
}
export async function inspectOfficeArchive(file: File, requiredPart: string, signal?: AbortSignal) {
  assertFileSize(file); canceled(signal);
  const bytes = new Uint8Array(await file.arrayBuffer()); const view = new DataView(bytes.buffer);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  if (end < Math.max(0, bytes.length - 65557)) fail("This Office file is not a complete ZIP archive.");
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint32(end + 4, true) || view.getUint16(end + 8, true) !== count || count > FILE_LIMITS.archiveEntries || start + size > end || start < 0 || count === 0) fail("This Office archive has unsupported or excessive entries.");
  const names = new Set<string>(); let offset = start, declaredTotal = 0, actualTotal = 0;
  for (let i = 0; i < count; i++) {
    canceled(signal);
    if (offset + 46 > start + size || view.getUint32(offset, true) !== 0x02014b50) fail("This Office archive has an invalid directory.");
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true), crc = view.getUint32(offset + 16, true), compressed = view.getUint32(offset + 20, true), expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true), local = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength + extra + comment > start + size || nameLength > 1024 || flags & 1 || ![0, 8].includes(method) || local + 30 > start) fail("This Office archive has unsupported entries.");
    const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength), name = new TextDecoder().decode(rawName);
    if (!name || /[\\\x00\ufffd]/u.test(name) || name.startsWith("/") || /^[a-z]:/i.test(name) || name.split("/").some((p, n, a) => p === ".." || p === "." || !p && n < a.length - 1) || names.has(name)) fail("This Office archive contains unsafe or duplicate paths.");
    names.add(name); declaredTotal += expanded;
    if (expanded > FILE_LIMITS.archiveEntryBytes || declaredTotal > FILE_LIMITS.archiveBytes || compressed > file.size || expanded > Math.max(1, compressed) * 1000) fail("This Office archive expands beyond the supported safety limits.");
    if (/vbaProject\.bin$|(?:^|\/)activeX\//i.test(name)) fail("Macro and ActiveX content is not supported.");
    if (view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== method || view.getUint16(local + 6, true) !== flags) fail("This Office archive has inconsistent local headers.");
    const localNameLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true), dataStart = local + 30 + localNameLength + localExtra;
    if (localNameLength !== nameLength || dataStart + compressed > start || !rawName.every((n, j) => n === bytes[local + 30 + j])) fail("This Office archive has inconsistent entry paths or sizes.");
    const xml = /\.(?:xml|rels|vml|svg)$/i.test(name);
    const image = /\.(?:png|jpe?g)$/i.test(name); let headerBytes = 0;
    if (xml && expanded > FILE_LIMITS.xmlBytes) fail("An XML part exceeds the 16 MB safety limit.");
    let readOffset = dataStart;
    const input = new ReadableStream<Uint8Array>({ pull(controller) { if (readOffset >= dataStart + compressed) controller.close(); else { const next = Math.min(readOffset + 4096, dataStart + compressed); controller.enqueue(bytes.subarray(readOffset, next)); readOffset = next; } } });
    let output: ReadableStream<Uint8Array> = input;
    if (method === 8) {
      let transform: DecompressionStream;
      try { transform = new DecompressionStream("deflate-raw"); }
      catch { throw new Error("Update your browser to check and convert Office files securely."); }
      // DOM and Workers declarations differ on BufferSource; the actual input
      // here is always an ArrayBuffer-backed Uint8Array from the selected file.
      output = input.pipeThrough(transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
    }
    const reader = output.getReader(); const chunks: Uint8Array[] = []; let actual = 0, checksum = 0xffffffff;
    const abort = () => { void reader.cancel().catch(() => undefined); }; signal?.addEventListener("abort", abort, { once: true });
    try {
      while (true) {
        canceled(signal); const part = await reader.read(); if (part.done) break;
        actual += part.value.length; actualTotal += part.value.length;
        if (actual > expanded || actualTotal > FILE_LIMITS.archiveBytes) fail("This Office archive exceeds its declared expanded size.");
        for (const value of part.value) checksum = crcTable[(checksum ^ value) & 255] ^ (checksum >>> 8);
        if (xml) chunks.push(part.value);
        else if (image && headerBytes < 1024 * 1024) { const chunk = part.value.subarray(0, 1024 * 1024 - headerBytes); chunks.push(chunk); headerBytes += chunk.length; }
      }
      canceled(signal);
      if (actual !== expanded || ((checksum ^ 0xffffffff) >>> 0) !== crc) fail("This Office archive has corrupted entry data.");
      if (xml) { const data = new Uint8Array(actual); let at = 0; for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; } inspectXml(data); }
      else if (image) { const data = new Uint8Array(headerBytes); let at = 0; for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; } await validateImageFile(new File([data], name)); }
    } finally { signal?.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); }
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== start + size || !names.has("[Content_Types].xml") || !names.has(requiredPart)) fail("This archive is not the expected Office document type.");
}
export async function validateInputFile(file: File, tool: ToolId, signal?: AbortSignal) {
  const kind = ["images", "scan"].includes(tool) ? "image" : tool === "html-pdf" ? "html" : tool === "word-pdf" ? "docx" : tool === "powerpoint-pdf" ? "pptx" : tool === "excel-pdf" ? file.name.split(".").pop()?.toLowerCase() || "xlsx" : "pdf";
  assertFileSize(file, kind === "html"); canceled(signal);
  if (checked.get(file)?.has(kind)) return;
  if (kind === "image") await validateImageFile(file);
  else if (["docx", "pptx", "xlsx"].includes(kind)) await inspectOfficeArchive(file, kind === "docx" ? "word/document.xml" : kind === "pptx" ? "ppt/presentation.xml" : "xl/workbook.xml", signal);
  else if (kind === "pdf") {
    const header = new TextDecoder("latin1").decode(await file.slice(0, 1024).arrayBuffer());
    if (!header.includes("%PDF-")) fail("This file does not have a valid PDF header.");
  } else if (kind === "xls") {
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (![208, 207, 17, 224, 161, 177, 26, 225].every((n, i) => header[i] === n)) fail("Choose an XLS workbook, or save this spreadsheet as XLSX or CSV.");
  } else if (kind !== "csv" && kind !== "html") fail("This file type is not supported.");
  canceled(signal); const kinds = checked.get(file) || new Set<string>(); kinds.add(kind); checked.set(file, kinds);
}
