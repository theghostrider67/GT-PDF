# GHOST PDF

Twenty-one document tools that process files locally in the browser. Selected documents are not uploaded to an application server.

## Tools

- Merge, extract, organize, rotate, optimize, duplicate, delete, reverse, and crop PDF pages
- Add page numbers, watermarks, a typed signature, blank pages, and document metadata
- Convert JPG/PNG images to PDF
- Convert between PDF and Word, Excel, and PowerPoint
- Process up to 20 files per job; separate conversions download together as a ZIP

### Conversion limits

PDF-to-Word and PDF-to-PowerPoint preserve the page appearance as images, so the text in those Office outputs is not editable. Word output retains the size and orientation of each page (scaled only if it exceeds Word's 22-inch page limit). PowerPoint uses the first page's aspect ratio; differently sized pages fit inside the shared slide size.

Word, Excel, and PowerPoint inputs are rendered locally with `@silurus/ooxml`, including supported pictures, tables, styling, and Unicode text. PDF output contains page images plus an invisible text layer for supported Latin characters. Pictures from a PDF-to-Office export can be converted back to PDF without OCR. Complex Office effects, unsupported objects, and unavailable fonts may render differently from Microsoft Office. Spreadsheet formulas use their saved cached results; they are not recalculated. Hidden sheets are skipped; large sheets are tiled into multiple pages.

PDF-to-Excel extracts selectable text and estimates columns from text positions. It does not reconstruct original spreadsheet formulas, charts, or styles. Scanned pages and image-only PDFs require OCR, which is not included.

## Local development

Requires Node.js **22.13 or newer**.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. PDF.js workers, fonts, CMaps, image decoders, and color profiles are copied from the installed dependency into `public/` when a build or dev configuration loads. The Office parser WASM files are prepared in `public/office/` as well. All processing engines are served locally, without a third-party CDN or conversion service.

## Validation

```bash
npm run test:regressions
npm run test:pdf
npm run test:office
npm run lint
npx tsc --noEmit
npm run build
```

For the browser conversion tests (all six conversion directions, round trips, edited outputs, slide order, wide/long spreadsheets, XLS/CSV, branding, and deployed CSP):

```bash
npm run build:static
npx playwright install chromium
npm run test:conversions
```

To use an existing Chrome executable instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its full path. The tests start and stop their own local server, use generated documents, and delete their temporary files afterward.

The regression tests cover invalid page selections, page order, existing crop origins, PDF text columns, long text wrapping, alternate XML prefixes, PowerPoint paragraph runs, and saved presentation order.

## Build and deployment

- **Vercel:** `vercel.json` uses `next build --webpack`. Run `npm run build:next` to check this build locally.
- **Netlify:** `netlify.toml` uses `npm run build:static` and publishes `out/`.
- **GitHub Pages:** the included workflow runs tests and exports `out/`, using the base path supplied by the Pages action. Enable GitHub Actions as the Pages publishing source in repository settings.
- **Vinext/Cloudflare:** `npm run build` produces the existing server/client build in `dist/`; it requires a server runtime. `npm start` starts the configured local Wrangler runtime.

For another host serving a subdirectory, set `NEXT_PUBLIC_BASE_PATH` at build time (for example, `/GT-PDF`) before running `npm run build:static`. This also prefixes the PDF worker and resource URLs.

## Licensing

The PDF engine is `pdf-lib`, licensed under MIT. Its notice is published at `/third-party-notices.txt` and retained in the repository.
