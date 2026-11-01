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
