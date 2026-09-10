# PDF Harbor

A privacy-first PDF web product. The current release performs all document work in the visitor's browser; selected files are not uploaded to an application server.

## Working tools

- Merge PDFs and reorder inputs
- Extract selected pages with page/range syntax
- Rotate all pages
- Add page numbers in six positions
- Add a text watermark with adjustable opacity
- Convert ordered JPG/PNG images into a PDF

## Local development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

The local site runs at `http://localhost:5173`.

## Validation

```bash
npm run test:pdf
npm run build
npm audit --omit=dev
```

## Deploy to Netlify

The included `netlify.toml` configures the deployment automatically:

- Build command: `npm run build`
- Publish directory: `dist/client`
- Node version: `22`

Connect this directory's Git repository in Netlify and publish. The output is static, so PDF files remain in the visitor's browser and do not pass through Netlify Functions.

## Before charging customers

1. Confirm a final product name, domain, and trademark availability.
2. Replace the beta pricing copy with real entitlements and add a payment provider such as Stripe.
3. Add authentication and a small backend for subscription status; keep PDF processing client-side where possible.
4. Publish operator-specific Terms, Privacy, Refund, and Acceptable Use policies and obtain local legal/tax advice.
5. Add privacy-respecting analytics, error monitoring, customer support, and automated end-to-end tests.
6. Upgrade the hosting plan before meaningful production traffic and configure usage alerts.

## Licensing

Application code can be commercialized by its owner. The PDF engine is `pdf-lib`, licensed under MIT. Its required notice is published at `/third-party-notices.txt` and retained in the repository.
