export function parsePageSequence(input: string, total: number, unique = true) {
  if (!Number.isSafeInteger(total) || total < 1 || total > 1000 || input.length > 4096) throw new Error("The page selection exceeds the supported limits.");
  if (!input.trim()) throw new Error("Enter a page range, for example 1-3, 6.");
  const pages: number[] = [];
  for (const part of input.split(",").map((value) => value.trim())) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`“${part}” is not a valid page range.`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || start > total || end < 1 || end > total) {
      throw new Error(`“${part}” is outside pages 1–${total}.`);
    }
    const step = start <= end ? 1 : -1;
    for (let page = start; ; page += step) {
      if (pages.length >= 1000) throw new Error("Select up to 1,000 output pages per operation.");
      pages.push(page - 1);
      if (page === end) break;
    }
  }
  return unique ? [...new Set(pages)] : pages;
}

type TextItem = { str: string; transform: number[]; width: number; height: number };

// PDF text is positioned geometrically; spaces alone do not identify columns.
export function pdfTextRows(items: TextItem[]): string[][] {
  if (items.length > 100_000 || items.reduce((n, item) => n + item.str.length, 0) > 2_000_000) throw new Error("This page exceeds the text extraction safety limit.");
  const rows: Array<{ y: number; items: TextItem[] }> = [];
  for (const item of [...items].sort((a, b) => b.transform[5] - a.transform[5])) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    let row = rows[rows.length - 1];
    if (!row || Math.abs(row.y - y) > 3) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  const table = rows.map((row) => {
    const cells: Array<{ x: number; text: string }> = [];
    let right = -Infinity;
    for (const item of row.items.sort((a, b) => a.transform[4] - b.transform[4])) {
      const gap = item.transform[4] - right;
      if (!cells.length || gap > Math.max(10, item.height * 0.8)) {
        cells.push({ x: item.transform[4], text: item.str.trim() });
      } else {
        const separator = gap > 1 ? " " : "";
        cells[cells.length - 1].text += separator + item.str;
      }
      right = item.transform[4] + item.width;
    }
    return cells;
  });
  const anchors = table.reduce((best, row) => row.length > best.length ? row : best, [] as Array<{ x: number; text: string }>);
  return table.map((cells) => {
    const values: string[] = [];
    let previousColumn = -1;
    for (const cell of cells) {
      let nearest = 0;
      for (let index = 1; index < anchors.length; index++) {
        if (Math.abs(anchors[index].x - cell.x) < Math.abs(anchors[nearest].x - cell.x)) nearest = index;
      }
      const column = Math.max(previousColumn + 1, nearest);
      while (values.length < column) values.push("");
      values[column] = cell.text;
      previousColumn = column;
    }
    return values;
  });
}

export function insetCropBox(box: { x: number; y: number; width: number; height: number }, requestedMargin: number) {
  const margin = Math.min(Math.max(0, requestedMargin), Math.min(box.width, box.height) / 4);
  return { x: box.x + margin, y: box.y + margin, width: box.width - margin * 2, height: box.height - margin * 2 };
}

export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 500 && measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    // Break long tokens by their measured width without discarding any characters.
    for (const character of word) {
      if (current && (current.length >= 500 || measure(current + character) > maxWidth)) {
        lines.push(current);
        current = "";
      }
      current += character;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
