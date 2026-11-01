export type MarkKind = "text" | "highlight" | "rectangle" | "draw" | "image" | "redact" | "crop" | "text-field" | "checkbox" | "dropdown";
export type Mark = { id: string; page: number; kind: MarkKind; x: number; y: number; width: number; height: number;
  text?: string; color?: string; size?: number; dataUrl?: string; points?: Array<{ x: number; y: number }>; name?: string; options?: string[] };
export type FormValue = { name: string; kind: "text" | "check" | "choice"; value: string | boolean; options?: string[] };
export type AdvancedOptions = { officeMode: string; pageRange: string; splitMode: string; quality: number; imageFormat: string; password: string;
  newPassword: string; marks: Mark[]; formValues: FormValue[]; flatten: boolean; ocrLanguage: string; summaryMode: string;
  sourceLanguage: string; targetLanguage: string; html: string; scanMode: string; scanContrast: number;
  imageOrientation: string; imageMargin: number; workflow: { rotate: number; number: boolean; watermark: string; compress: boolean } };
export type ToolResult = { output: Uint8Array; filename: string; mime: string; detail?: string; text?: string; preview?: string[] };
