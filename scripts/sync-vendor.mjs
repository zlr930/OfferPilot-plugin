import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const vendorDirectory = path.join(root, "extension", "vendor");

await mkdir(vendorDirectory, { recursive: true });
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
]);

console.log("Extension parser libraries synchronized.");
