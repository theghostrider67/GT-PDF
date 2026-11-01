# Security

GHOST PDF processes documents in the visitor's browser. The Vercel production deployment publishes a static export, including the 38 tool pages. It exposes no document-upload API, database-backed account system, server action, or image-optimization service.

## Defenses

- Patched framework, spreadsheet, image, and development dependencies. The lockfile pins resolved packages and integrity values; SheetJS comes from its official maintained distribution.
- Vercel and Netlify security headers restrict framing, content sniffing, resource origins, and form submission. Exported HTML also has a per-page CSP that permits exact hashes of required inline bootstrap scripts and blocks other inline scripts and event handlers. The broad HTTP script policy is narrowed by this additional meta policy.
- Selected files are checked before preview or conversion. Limits: 50 MB per file, 150 MB per selection, 20 files, 500 input PDF pages, and 1,000 selected/output pages. Images are limited to 40 megapixels and 16,384 pixels per side.
- Office ZIP preflight checks real streamed expanded byte counts and CRCs, directory/local-header consistency, duplicate/unsafe paths, and format parts. Limits: 5,000 entries, 150 MB expanded, 32 MB per part, and 16 MB per XML part. ZIP64, encryption, macros, ActiveX, XML entity declarations, and external resource relationships are rejected. Ordinary hyperlinks are allowed; embedded JPG/PNG dimensions are checked.
- HTML input is limited to 1 MB and 10,000 sanitized elements. It supports restricted presentation styles and embedded JPG/PNG images. Scripts, SVG/MathML, forms, frames, stylesheets, URL-bearing CSS and navigation attributes are removed. Rendering uses a script-disabled sandbox with a resource policy and a 100-page output limit.
- PDF/image rendering, spreadsheet pagination, and page-range expansion have limits. Preview workers and validation streams close on cancellation; extraction avoids unbounded range expansion and quadratic row grouping.
- Document passwords require 8–1,024 characters and are not persisted. Long, unique passwords are recommended. Redaction creates fresh flattened pages and drops the original metadata, attachments, fields, and document actions.
- CI runs input-safety fuzz/regression checks, browser security tests, conversion tests, the full toolkit tests, and a production dependency audit.

## Scope and limits

These checks reduce known risks. They do not certify the application or every document as safe. PDF/Office/image parsers still process untrusted formats; malformed or computationally expensive inputs can still stress a browser. This application does not provide antivirus scanning, guaranteed CPU/memory isolation, or a hard per-job time limit. Operations that preserve original document structure are not malware sanitizers.

Static hosting reduces server execution risk. Hosting/GitHub account compromise, dependency supply-chain compromise, browser extensions, and new browser/library vulnerabilities remain outside this code audit. Keep hosting access protected and dependencies maintained.

GitHub Pages does not support custom response headers from this repository; its mirror receives the exported meta CSP but cannot enforce the HTTP framing policy. Vercel is the primary deployment.

The dependency audit may retain moderate findings in development-only lint tooling where upstream packages require older glob APIs. These packages are not shipped as executable server code in the static production site. Do not run development servers publicly or process untrusted repository configuration in a privileged CI environment.

## Reporting a concern

Contact the repository owner through GitHub's private vulnerability reporting feature when available. Share a minimal, non-sensitive reproduction. Do not post passwords, confidential documents, credentials, or live exploit payloads in a public issue.
