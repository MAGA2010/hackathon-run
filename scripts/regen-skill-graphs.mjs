#!/usr/bin/env node
// scripts/regen-skill-graphs.mjs - regenerate docs/skills/{dependencies,state-writes}.md
// from the live Format v2 frontmatter via `hackathon skills graph --format md`.
//
// Usage: node scripts/regen-skill-graphs.mjs [--out <dir>]
//
// Requires the project to be built (`npm run build`) so `dist/cli/index.js` exists.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = pathJoin(HERE, "..");
const cli = pathJoin(ROOT, "dist", "cli", "index.js");
const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : pathJoin(ROOT, "docs", "skills");

if (!existsSync(cli)) {
  console.error("missing dist/cli/index.js - run `npm run build` first");
  process.exit(1);
}

function regen(type, file) {
  const r = spawnSync("node", [cli, "skills", "graph", "--format", "md", "--type", type], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(`graph (type=${type}) exited ${r.status}`);
    if (r.stderr) console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  const target = pathJoin(outDir, file);
  writeFileSync(target, r.stdout);
  console.log(`wrote ${target} (${r.stdout.length} bytes)`);
}

regen("deps", "dependencies.md");
regen("effects", "state-writes.md");

