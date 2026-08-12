import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoots = ["extension", "scripts", "test"];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(target)));
    else files.push(target);
  }
  return files;
}

const files = (
  await Promise.all(
    sourceRoots.map((directory) => listFiles(path.join(root, directory))),
  )
).flat();
const javascriptFiles = files.filter(
  (file) => file.endsWith(".js") || file.endsWith(".mjs"),
);

for (const file of javascriptFiles) {
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

const manifest = JSON.parse(
  await readFile(path.join(root, "extension/manifest.json"), "utf8"),
);
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.permissions.includes("activeTab"));
assert.ok(
  !manifest.host_permissions.some((origin) =>
    origin.includes("127.0.0.1") || origin.includes("localhost"),
  ),
);
assert.ok(manifest.host_permissions.includes("https://api.openai.com/*"));
assert.ok(manifest.host_permissions.includes("https://api.ai.tosky.top/*"));
assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
assert.ok(manifest.optional_host_permissions.includes("http://*/*"));

for (const relativePath of [
  "extension/background.js",
  "extension/content.js",
  "extension/options.js",
]) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  assert.ok(
    !source.includes("OPENAI_API_KEY"),
    `${relativePath} references the API key`,
  );
  assert.ok(
    !/sk-[A-Za-z0-9_-]{20,}/.test(source),
    `${relativePath} contains a secret-like value`,
  );
}

console.log(
  `Project checks passed: ${javascriptFiles.length} JavaScript files and MV3 manifest validated.`,
);
