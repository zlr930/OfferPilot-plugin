import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const vendorDirectory = path.join(root, "extension", "vendor");
const cMapDirectory = path.join(vendorDirectory, "cmaps");

await mkdir(vendorDirectory, { recursive: true });
await rm(cMapDirectory, { recursive: true, force: true });
await Promise.all([
  copyFile(
    path.join(root, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.min.mjs"),
    path.join(vendorDirectory, "pdf.min.mjs"),
  ),
  copyFile(
    path.join(
      root,
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    ),
    path.join(vendorDirectory, "pdf.worker.min.mjs"),
  ),
  copyFile(
    path.join(root, "node_modules", "mammoth", "mammoth.browser.min.js"),
    path.join(vendorDirectory, "mammoth.browser.min.js"),
  ),
  cp(path.join(root, "node_modules", "pdfjs-dist", "cmaps"), cMapDirectory, {
    recursive: true,
  }),
]);

console.log("Extension parser libraries synchronized.");
