import { Copy, Crop, FileImage, FileOutput, FilePenLine, FileSpreadsheet, FileText, Files, Hash, Layers3, ListRestart, Minimize2, Presentation, RotateCw, Signature, Sparkles, Split, Stamp, Table2, Trash2 } from "lucide-react";
import { Archive, Braces, FileCode2, GitCompareArrows, Image, Languages, ListChecks, Lock, Pencil, ScanLine, ScanText, Shield, Unlock, WandSparkles } from "lucide-react";
export type ToolId = "merge" | "extract" | "organize" | "rotate" | "optimize" | "number" | "watermark" | "images" | "duplicate" | "delete" | "blank" | "reverse" | "crop" | "sign" | "metadata" | "pdf-excel" | "excel-pdf" | "pdf-powerpoint" | "powerpoint-pdf" | "pdf-word" | "word-pdf" | "split" | "compress" | "pdf-images" | "html-pdf" | "pdfa" | "scan" | "repair" | "ocr" | "edit" | "forms" | "unlock" | "protect" | "redact" | "compare" | "summarize" | "translate" | "markdown";
export type Tool = {
  id: ToolId;
  name: string;
  short: string;
  description: string;
  Icon: typeof Files;
  color: string;
  accept: string;
  multiple: boolean;
};

const originalTools: Tool[] = [
  { id: "pdf-word", name: "PDF to Word", short: "Layout or editable text", description: "Choose a page-faithful Word document or editable text and simple tables.", Icon: FileText, color: "word", accept: "application/pdf,.pdf", multiple: false },
  { id: "word-pdf", name: "Word to PDF", short: "DOCX to PDF pages", description: "Render Word pages, including images and tables, into a PDF.", Icon: FileText, color: "word", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", multiple: false },
  { id: "pdf-powerpoint", name: "PDF to PowerPoint", short: "Pictures or editable slides", description: "Create slide images or editable text boxes from PDF pages.", Icon: Presentation, color: "powerpoint", accept: "application/pdf,.pdf", multiple: false },
  { id: "powerpoint-pdf", name: "PowerPoint to PDF", short: "Slides to PDF pages", description: "Convert slides, pictures, and text into PDF pages.", Icon: Presentation, color: "powerpoint", accept: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation", multiple: false },
  { id: "pdf-excel", name: "PDF to Excel", short: "Extract pages to sheets", description: "Extract page text into an editable Excel workbook.", Icon: FileSpreadsheet, color: "excel", accept: "application/pdf,.pdf", multiple: false },
  { id: "excel-pdf", name: "Excel to PDF", short: "Sheets to printable pages", description: "Convert styled worksheets into PDF pages, including pictures and tables.", Icon: Table2, color: "excel", accept: ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv", multiple: false },
  { id: "merge", name: "Merge PDF", short: "Combine PDFs", description: "Combine several PDFs in the exact order you choose.", Icon: Files, color: "coral", accept: "application/pdf,.pdf", multiple: true },
  { id: "extract", name: "Extract pages", short: "Keep selected pages", description: "Create a new PDF with only the pages you need.", Icon: Split, color: "blue", accept: "application/pdf,.pdf", multiple: false },
  { id: "organize", name: "Organize PDF", short: "Reorder any pages", description: "Rebuild a document in a custom page order.", Icon: Layers3, color: "violet", accept: "application/pdf,.pdf", multiple: false },
  { id: "rotate", name: "Rotate PDF", short: "Turn every page", description: "Rotate every page clockwise or upside down.", Icon: RotateCw, color: "mint", accept: "application/pdf,.pdf", multiple: false },
  { id: "optimize", name: "Optimize PDF", short: "Clean file structure", description: "Rewrite the PDF with compact object streams for a leaner file.", Icon: Minimize2, color: "yellow", accept: "application/pdf,.pdf", multiple: false },
  { id: "number", name: "Page numbers", short: "Add clean numbering", description: "Place page numbers at the top or bottom of every page.", Icon: Hash, color: "cyan", accept: "application/pdf,.pdf", multiple: false },
  { id: "watermark", name: "Watermark PDF", short: "Text or image stamps", description: "Add custom text or an image watermark across every page.", Icon: Stamp, color: "pink", accept: "application/pdf,.pdf", multiple: false },
  { id: "images", name: "Images to PDF", short: "JPG & PNG to PDF", description: "Turn up to 20 JPG or PNG images into one PDF.", Icon: FileImage, color: "orange", accept: "image/jpeg,image/png,.jpg,.jpeg,.png", multiple: true },
  { id: "duplicate", name: "Duplicate pages", short: "Copy selected pages", description: "Append copies of selected pages to your document.", Icon: Copy, color: "indigo", accept: "application/pdf,.pdf", multiple: false },
  { id: "delete", name: "Delete pages", short: "Remove page ranges", description: "Remove unwanted pages and keep everything else.", Icon: Trash2, color: "red", accept: "application/pdf,.pdf", multiple: false },
  { id: "blank", name: "Add blank page", short: "Append a clean page", description: "Add a fresh A4 page to the end of a PDF.", Icon: FileOutput, color: "slate", accept: "application/pdf,.pdf", multiple: false },
  { id: "reverse", name: "Reverse pages", short: "Flip page order", description: "Reverse the complete page order in one click.", Icon: ListRestart, color: "lime", accept: "application/pdf,.pdf", multiple: false },
  { id: "crop", name: "Crop PDF", short: "Visual page cropping", description: "Draw a crop on a page preview or trim every page by a consistent margin.", Icon: Crop, color: "yellow", accept: "application/pdf,.pdf", multiple: false },
  { id: "sign", name: "Sign PDF", short: "Type, draw, or upload", description: "Add a typed signature or place a drawn or uploaded signature image.", Icon: Signature, color: "cyan", accept: "application/pdf,.pdf", multiple: false },
  { id: "metadata", name: "Edit metadata", short: "Title, author & topic", description: "Update document title, author, subject, and keywords.", Icon: FilePenLine, color: "pink", accept: "application/pdf,.pdf", multiple: false },
];


const addedTools: Tool[] = [
  { id: "split", name: "Split PDF", short: "A file for every page", description: "Split every page or custom page groups into separate PDF files.", Icon: Split, color: "blue", accept: "application/pdf,.pdf", multiple: false },
  { id: "compress", name: "Compress PDF", short: "Smaller files. Clear pages.", description: "Reduce image-heavy PDFs with adjustable visual compression.", Icon: Minimize2, color: "coral", accept: "application/pdf,.pdf", multiple: false },
  { id: "pdf-images", name: "PDF to JPG", short: "Pages, picture perfect", description: "Export selected pages as high-quality JPG or PNG images.", Icon: Image, color: "orange", accept: "application/pdf,.pdf", multiple: false },
  { id: "html-pdf", name: "HTML to PDF", short: "From markup to pages", description: "Turn a local HTML file or pasted HTML into a PDF. No website upload needed.", Icon: FileCode2, color: "cyan", accept: "text/html,.html,.htm", multiple: false },
  { id: "pdfa", name: "PDF to PDF/A", short: "Ready for the long term", description: "Create a flattened PDF/A-2b archival copy with an embedded color profile.", Icon: Archive, color: "indigo", accept: "application/pdf,.pdf", multiple: false },
  { id: "scan", name: "Scan to PDF", short: "Your camera. A scanner.", description: "Capture or choose document photos and clean them into a PDF.", Icon: ScanLine, color: "mint", accept: "image/jpeg,image/png,.jpg,.jpeg,.png", multiple: true },
  { id: "repair", name: "Repair PDF", short: "Give your file a fresh start", description: "Recover readable pages and rebuild damaged PDF structure when possible.", Icon: WandSparkles, color: "yellow", accept: "application/pdf,.pdf", multiple: false },
  { id: "ocr", name: "OCR PDF", short: "Make scans searchable", description: "Recognize English or Bengali text in scanned pages, entirely on your device.", Icon: ScanText, color: "violet", accept: "application/pdf,.pdf", multiple: false },
  { id: "edit", name: "Edit PDF", short: "Make it your own", description: "Add text, pictures, highlights, shapes, and freehand notes with a visual editor.", Icon: Pencil, color: "violet", accept: "application/pdf,.pdf", multiple: false },
  { id: "forms", name: "PDF Forms", short: "Fill it. Build it. Send it.", description: "Fill existing fields or draw new text fields, checkboxes, and dropdowns.", Icon: ListChecks, color: "cyan", accept: "application/pdf,.pdf", multiple: false },
  { id: "unlock", name: "Unlock PDF", short: "Your password. Your access.", description: "Remove password protection using the document's password.", Icon: Unlock, color: "mint", accept: "application/pdf,.pdf", multiple: false },
  { id: "protect", name: "Protect PDF", short: "A little more peace of mind", description: "Encrypt your PDF with an AES-256 password before you share it.", Icon: Lock, color: "indigo", accept: "application/pdf,.pdf", multiple: false },
  { id: "redact", name: "Redact PDF", short: "Private means private", description: "Select areas and permanently remove their contents from a flattened copy.", Icon: Shield, color: "red", accept: "application/pdf,.pdf", multiple: false },
  { id: "compare", name: "Compare PDF", short: "Spot what changed", description: "Compare two PDFs side by side with visual differences and a downloadable report.", Icon: GitCompareArrows, color: "blue", accept: "application/pdf,.pdf", multiple: true },
  { id: "summarize", name: "Summarize PDF", short: "Get to the good parts", description: "Create a local key-sentence digest, or use on-device AI in a supported browser.", Icon: Sparkles, color: "pink", accept: "application/pdf,.pdf", multiple: false },
  { id: "translate", name: "Translate PDF", short: "Let language open doors", description: "Translate document text privately with your desktop browser's on-device language models.", Icon: Languages, color: "word", accept: "application/pdf,.pdf", multiple: false },
  { id: "markdown", name: "PDF to Markdown", short: "Ready for notes and docs", description: "Extract readable text, headings, and simple tables into a Markdown file.", Icon: Braces, color: "slate", accept: "application/pdf,.pdf", multiple: false },
];
export const tools: Tool[] = [...originalTools, ...addedTools];
export const categories = [
  { id: "all", label: "All tools" }, { id: "convert", label: "Convert" },
  { id: "organize", label: "Organize" }, { id: "edit", label: "Edit & optimize" },
  { id: "security", label: "Security" }, { id: "smart", label: "Smart tools" },
] as const;
export type Category = typeof categories[number]["id"];
export function toolCategory(id: ToolId): Category {
  if (["merge", "split", "extract", "organize", "duplicate", "delete", "blank", "reverse"].includes(id)) return "organize";
  if (["unlock", "protect", "redact", "sign", "compare"].includes(id)) return "security";
  if (["ocr", "summarize", "translate", "markdown"].includes(id)) return "smart";
  if (["edit", "rotate", "crop", "number", "watermark", "metadata", "optimize", "compress", "repair", "forms"].includes(id)) return "edit";
  return "convert";
}
export const popularTools: ToolId[] = ["merge", "compress", "pdf-word", "edit", "pdf-images", "protect"];
export const advancedTools = new Set<ToolId>(addedTools.map((tool) => tool.id));
