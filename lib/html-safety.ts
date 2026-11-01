import { FILE_LIMITS, validateImageFile } from "./file-safety";

// HTML conversion supports presentation, never scripts, embedded apps or URLs.
const presentationProperties = new Set("color background-color font-family font-size font-weight font-style line-height text-align text-decoration text-transform letter-spacing word-spacing white-space word-break overflow-wrap border border-top border-right border-bottom border-left border-color border-width border-style border-collapse border-spacing border-radius margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left width min-width max-width height min-height max-height vertical-align display list-style-type".split(" "));
export async function sanitizeDocumentHtml(source: string) {
  if (new TextEncoder().encode(source).length > FILE_LIMITS.htmlBytes) throw new Error("HTML input is limited to 1 MB.");
  let tags = 0; for (const char of source) if (char === "<" && ++tags > 20_000) throw new Error("This HTML contains too many elements.");
  const { default: DOMPurify } = await import("dompurify");
  const safe = DOMPurify.sanitize(source, { USE_PROFILES: { html: true }, ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "iframe", "form", "input", "button", "video", "audio", "link", "meta", "base", "object", "embed", "template"],
    FORBID_ATTR: ["id", "name", "srcset", "href", "xlink:href", "background", "action", "formaction", "poster"] });
  const parsed = new DOMParser().parseFromString(safe, "text/html");
  const elements = parsed.body.querySelectorAll<HTMLElement>("*");
  if (elements.length > 10_000) throw new Error("This HTML contains too many elements.");
  for (const element of elements) {
    for (const property of Array.from(element.style)) {
      const value = element.style.getPropertyValue(property);
      if (!presentationProperties.has(property) || value.length > 256 || /url\s*\(|@|\\|expression|(?:var|env|attr)\s*\(|\d{5,}|\d[eE][+-]?\d/i.test(value) || property === "display" && !/^(?:block|inline|inline-block|none|table|table-row|table-cell|list-item)$/.test(value)) element.style.removeProperty(property);
    }
    for (const name of ["width", "height"]) {
      const value = element.getAttribute(name); if (value && (!/^\d{1,4}$/.test(value) || Number(value) > 5000)) element.removeAttribute(name);
    }
  }
  for (const image of Array.from(parsed.images)) {
    const src = image.getAttribute("src") || "";
    const match = /^data:image\/(png|jpeg);base64,([a-z0-9+/=\r\n]+)$/i.exec(src);
    if (!match) { image.remove(); continue; }
    try {
      const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
      await validateImageFile(new File([bytes], `embedded.${match[1] === "png" ? "png" : "jpg"}`));
    } catch { image.remove(); }
  }
  return parsed.body.innerHTML;
}
