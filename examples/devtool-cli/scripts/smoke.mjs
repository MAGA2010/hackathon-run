#!/usr/bin/env node
// smoke.mjs — pipes fixtures/sample.json into cli.mjs and asserts exit 0 + output has ISO timestamp.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const cli = join(root, "src/cli.mjs");
const input = readFileSync(join(root, "fixtures/sample.json"), "utf8");
const r = spawnSync(process.execPath, [cli], { input, encoding: "utf8" });
console.log("stdout:", r.stdout);
console.log("stderr:", r.stderr);
if (r.status !== 0) {
  console.error("FAIL: exit", r.status);
  process.exit(1);
}
if (!/^\[\d{4}-\d{2}-\d{2}T/.test(r.stdout)) {
  console.error("FAIL: no ISO timestamp in stdout");
  process.exit(1);
}
console.log("smoke ok");
