import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function hardenStaticExport(directory) {
  let pages = 0;
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith(".html")) {
        let html = await readFile(file, "utf8");
        const hashes = new Set();
        for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          if (!/\bsrc\s*=/i.test(script[1]) && script[2].trim()) hashes.add(`'sha256-${createHash("sha256").update(script[2]).digest("base64")}'`);
        }
        const policy = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${[...hashes].join(" ")}; script-src-attr 'none'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`;
        html = html.replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
        await writeFile(file, html); pages++;
      }
    }
  }
  await visit(directory);
  if (pages < 39) throw new Error("The static export is missing expected tool pages.");
  console.log(`Applied strict script hashes to ${pages} exported HTML pages.`);
}
