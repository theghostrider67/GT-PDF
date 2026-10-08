import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Serve the worker from our own origin and keep its version aligned with PDF.js.
const publicDirectory = new URL("../public/", import.meta.url);
mkdirSync(publicDirectory, { recursive: true });
copyFileSync(
  fileURLToPath(new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)),
  fileURLToPath(new URL("pdf.worker.min.mjs", publicDirectory)),
);