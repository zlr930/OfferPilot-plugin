import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distDirectory = path.join(root, "dist");
const output = path.join(distDirectory, "offerpilot.zip");

await mkdir(distDirectory, { recursive: true });
await rm(output, { force: true });
execFileSync("zip", ["-r", "-q", output, "."], {
  cwd: path.join(root, "extension"),
});

console.log(output);
