# GHOST PDF

<div align="center">
  <h1>🚀 <a href="https://gt-pdf.vercel.app/">OPEN GHOST PDF LIVE</a></h1>
  <p><strong><a href="https://gt-pdf.vercel.app/">gt-pdf.vercel.app</a></strong></p>
</div>

**38 thoughtful PDF tools. One beautifully simple workspace.**

Convert, edit, organize, and protect your documents with a glass-style interface built around clarity. Your documents are processed in your browser, on your own device.

## Main features

| What you need | Tools ready to help |
| --- | --- |
| **Convert documents** | PDF ↔ Word, PowerPoint, and Excel; PDF → JPG/PNG, Markdown, or PDF/A; HTML and images → PDF. |
| **Organize pages** | Merge, split, extract, duplicate, delete, reverse, and add blank pages. Drag page thumbnails into a new order. |
| **Edit and personalize** | Add text, pictures, shapes, freehand notes, highlights, page numbers, text/image watermarks, and typed/drawn/uploaded signatures. |
| **Optimize and recover** | Compress image-heavy PDFs, optimize file structure, repair readable damaged files, and crop pages visually. |
| **Protect your documents** | AES-256 password protection, password-based unlocking, permanent area redaction, and side-by-side visual comparison. |
| **Work with forms** | Fill existing fields or draw new text fields, checkboxes, and dropdowns. Keep them interactive or flatten the result. |
| **Make scans useful** | Capture document photos, clean their appearance, and recognize English or Bengali text with local OCR. |
| **Read a little faster** | Extract key-sentence digests, use on-device AI summaries where supported, and translate document text with compatible desktop browsers. |

## A workspace that feels effortless

- **Find your tool quickly:** search by task, browse categories, or bookmark your favorites.
- **See what you are doing:** live page previews, visual annotations, crop selections, form previews, and comparison highlights.
- **Make it yours:** responsive layouts, light/dark appearance, keyboard search with `⌘ K` or `Ctrl K`, and reduced-motion support.
- **Do more in one go:** process up to 20 files, download separate conversions as a ZIP, and save finishing workflows on your device.
- **Keep control:** download results again, inspect text outputs, and choose editable-text or appearance-preserving Office exports.

## How to use GHOST PDF

1. **Find a tool** using search, categories, or the everyday essentials shortcuts. Selecting a tool opens its own dedicated page, such as [PDF to Word](https://gt-pdf.vercel.app/tools/pdf-to-word/).
2. **Choose your files** or drop them into the workspace. For scans, use your camera or choose photos. For HTML, you can paste the markup directly.
3. **Make it just right:** adjust the settings, arrange page thumbnails, draw on the preview, or fill form fields.
4. **Run the tool** and download your result. Add a finishing workflow if you also want rotation, numbers, a watermark, or compression.

Use **All tools** to return to the catalog or choose a recent tool to open another workspace. Each tool page can be bookmarked, shared, or refreshed directly.

For page ranges, use `1-3, 6`. To split into separate groups, use `1-3; 4-6; 7`. To reorder pages, drag their thumbnails or enter an order such as `3, 1, 2`.

## Privacy, by design

PDF processing, Office rendering, OCR, and supported AI operations happen locally. Your documents are not sent to a conversion or translation service. Processing engines and OCR language data are served from this website. Compatible browsers may download their own AI models or language packs on first use.

Files are checked against browser safety limits before conversion: up to **50 MB per file**, **150 MB per selection**, and **500 input PDF pages**. Office archives are checked for excessive expansion, corrupted entries, XML entity declarations, macros, and external resource links. HTML conversion uses restricted formatting and embedded JPG/PNG images.

Only explicitly saved favorites, recent tool choices, appearance settings, and workflow recipes are stored on your device. Documents and passwords are not saved by GHOST PDF.

## Choose the right output

- **Word and PowerPoint:** choose page images to preserve appearance, or editable text for a simpler layout. Editable mode does not reproduce original images, fonts, or complex formatting. Scanned text needs OCR first.
- **Office → PDF:** supported images, tables, styling, and Unicode text are rendered locally. Complex Office effects and unavailable fonts can look different. Spreadsheet formulas use saved results; hidden worksheets are skipped.
- **Compression, editing, drawn/image signing, redaction, and PDF/A:** these tools can create flattened page images. Read the tool's note before exporting if you need searchable text, links, or interactive forms.
- **PDF/A:** produces a flattened PDF/A-2b archival copy with an embedded sRGB profile. The export pipeline has been independently checked with veraPDF.
- **OCR:** English and Bengali recognition run locally. Review recognized text for errors.
- **PDF → Excel and Markdown:** extraction is approximate. Original spreadsheet formulas, charts, and complex layouts cannot be reconstructed from a PDF.
- **Summaries:** key-sentence mode works without generative AI. On-device AI mode depends on browser and hardware support and may download a model.
- **Translation:** requires a compatible desktop Chrome or Edge browser and a supported language pair. It creates translated text in a new layout, rather than reproducing the original pictures and formatting.
- **HTML:** accepts local files or pasted markup with embedded images. It does not fetch arbitrary website URLs or external resources.
- **Signatures:** visual signatures are available locally. Certificate signing, remote signature requests, email reminders, and audit-trail services are not included.
- **Repair:** can rebuild readable structure; missing or destroyed content cannot be recreated.

## Security

The production website is published as static files with security headers and a strict script policy. Conversion runs locally; no document-upload API or conversion server is exposed. See [SECURITY.md](SECURITY.md) for the threat model, supported limits, and testing scope.

## Third-party acknowledgements

See the [third-party notices](public/third-party-notices.txt) for the libraries that help power GHOST PDF.
