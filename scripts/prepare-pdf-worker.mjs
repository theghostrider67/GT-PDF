import { copyFileSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Serve the worker from our own origin and keep its version aligned with PDF.js.
const publicDirectory = new URL("../public/", import.meta.url);
mkdirSync(publicDirectory, { recursive: true });
copyFileSync(
  fileURLToPath(new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)),
  fileURLToPath(new URL("pdf.worker.min.mjs", publicDirectory)),
);

// PDF.js also fetches these resources for built-in fonts, CJK text, color
// profiles, and image decoding. Keep every resource local and version-matched.
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url),
    new URL(`pdfjs/${directory}/`, publicDirectory), { recursive: true });
}

// Serve the Office parsers locally as well; do not rely on external CDNs.
for (const format of ["docx", "pptx", "xlsx"]) {
  const name = `${format}_parser_bg.wasm`;
  mkdirSync(new URL("office/", publicDirectory), { recursive: true });
  copyFileSync(new URL(`../node_modules/@silurus/ooxml/dist/${name}`, import.meta.url),
    new URL(`office/${name}`, publicDirectory));
}

// OCR is served from the same origin, including both language models.
mkdirSync(new URL("ocr/core/", publicDirectory), { recursive: true });
mkdirSync(new URL("ocr/lang/", publicDirectory), { recursive: true });
copyFileSync(new URL("../node_modules/tesseract.js/dist/worker.min.js", import.meta.url), new URL("ocr/worker.min.js", publicDirectory));
for (const name of readdirSync(new URL("../node_modules/tesseract.js-core/", import.meta.url))) {
  if (name.endsWith(".wasm") || name.endsWith(".wasm.js")) copyFileSync(new URL(`../node_modules/tesseract.js-core/${name}`, import.meta.url), new URL(`ocr/core/${name}`, publicDirectory));
}
for (const language of ["eng", "ben"]) copyFileSync(new URL(`../node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`, import.meta.url), new URL(`ocr/lang/${language}.traineddata.gz`, publicDirectory));
