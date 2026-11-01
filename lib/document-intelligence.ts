const stop = new Set("the a an and or to of in is it that for with as by on at from this be are was were has have will can not your you we our they their its but than into more also".split(" "));
export function keySentenceDigest(text: string, limit = 6) {
  const sentences = (text.match(/[^.!?\n]+[.!?]+|[^\n]+/gu) ?? []).map((s) => s.trim()).filter((s) => s.length > 25);
  if (!sentences.length) return text.trim();
  const frequencies = new Map<string, number>();
  const words = (sentence: string) => (sentence.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((word) => !stop.has(word));
  for (const sentence of sentences) for (const word of words(sentence)) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const ranked = sentences.map((sentence, index) => ({ sentence, index, score: words(sentence).reduce((sum, word) => sum + (frequencies.get(word) ?? 0), 0) / Math.sqrt(Math.max(1, words(sentence).length)) }));
  const seen = new Set<string>();
  return ranked.sort((a, b) => b.score - a.score).filter(({ sentence }) => { if (seen.has(sentence)) return false; seen.add(sentence); return true; }).slice(0, limit).sort((a, b) => a.index - b.index).map(({ sentence }) => `- ${sentence}`).join("\n\n");
}
export type LocalTranslator = { translate: (text: string) => Promise<string>; destroy: () => void };
export type LocalSummarizer = { summarize: (text: string) => Promise<string>; destroy: () => void };
export type BrowserIntelligence = typeof globalThis & {
  Translator?: { availability: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<string>; create: (options: { sourceLanguage: string; targetLanguage: string; monitor?: (monitor: EventTarget) => void }) => Promise<LocalTranslator> };
  Summarizer?: { availability: () => Promise<string>; create: (options: { type: string; format: string; length: string; monitor?: (monitor: EventTarget) => void }) => Promise<LocalSummarizer> };
};
