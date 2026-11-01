import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  "build", "--webpack",
], {
  stdio: "inherit",
  env: { ...process.env, GT_PDF_STATIC_EXPORT: "true" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (result.status === 0) {
  const { hardenStaticExport } = await import("./harden-static-export.mjs");
  await hardenStaticExport(fileURLToPath(new URL("../out/", import.meta.url)));
}
