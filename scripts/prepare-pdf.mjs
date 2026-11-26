import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const root = dirname(
  createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
);
const output = new URL("../public/pdf-engine/", import.meta.url);
mkdirSync(output, { recursive: true });
for (const [source, target] of [
  ["legacy/build/pdf.min.mjs", "pdf.js"],
  ["legacy/build/pdf.worker.min.mjs", "worker.js"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["LICENSE", "LICENSE"],
])
  cpSync(join(root, source), new URL(target, output), { recursive: true });
