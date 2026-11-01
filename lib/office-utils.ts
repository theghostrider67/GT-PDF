const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PRESENTATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error("This Office file contains invalid XML.");
  }
  return document;
}

export function wordParagraphs(xml: string): string[] {
  const document = parseXml(xml);
  return Array.from(document.getElementsByTagNameNS(WORD_NS, "p"))
    .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "t"))
      .map((node) => node.textContent ?? "").join(""))
    .filter(Boolean);
}

export function slideParagraphs(xml: string): string[] {
  const document = parseXml(xml);
  return Array.from(document.getElementsByTagNameNS(DRAWING_NS, "p"))
    .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS(DRAWING_NS, "t"))
      .map((node) => node.textContent ?? "").join(""))
    .filter((line) => line.trim());
}

export function presentationSlidePaths(presentationXml: string, relationshipsXml: string): string[] {
  const presentation = parseXml(presentationXml);
  const relationships = parseXml(relationshipsXml);
  const targets = new Map<string, string>();
  for (const relationship of Array.from(relationships.getElementsByTagNameNS("*", "Relationship"))) {
    if (relationship.getAttribute("TargetMode") === "External" ||
        !relationship.getAttribute("Type")?.endsWith("/slide")) continue;
    const target = relationship.getAttribute("Target");
    const id = relationship.getAttribute("Id");
    if (!target || !id) continue;
    const path = new URL(target, "https://office.invalid/ppt/presentation.xml");
    if (path.origin !== "https://office.invalid") continue;
    targets.set(id, decodeURIComponent(path.pathname.slice(1)));
  }
  return Array.from(presentation.getElementsByTagNameNS(PRESENTATION_NS, "sldId")).map((slide) => {
    const id = slide.getAttributeNS(OFFICE_REL_NS, "id");
    const path = id ? targets.get(id) : undefined;
    if (!path) throw new Error("This PPTX file contains a missing slide relationship.");
    return path;
  });
}
