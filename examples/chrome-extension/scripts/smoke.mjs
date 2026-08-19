#!/usr/bin/env node
// smoke.mjs — asserts every required file exists. Exits 0 on success.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const required = [
  "manifest.json",
  "src/background.js",
  "src/content.js",
  "src/popup.html",
  "icons/icon.svg",
];
let ok = true;
for (const f of required) {
  const full = join(root, f);
  const present = existsSync(full);
  console.log((present ? "✓" : "✗") + " " + f);
  if (!present) ok = false;
}
process.exit(ok ? 0 : 1);
