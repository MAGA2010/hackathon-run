// v2 enrich: read each SKILL.md, insert Format v2 fields after `when_to_use:` block, before closing ---
const fs = require("node:fs");
const path = require("node:path");
const skillsRoot = path.join(process.cwd(), "skills");
const skills = fs.readdirSync(skillsRoot);
const metadata = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let updated = 0;
let skipped = 0;
for (const skill of skills) {
  const dir = path.join(skillsRoot, skill);
  if (!fs.statSync(dir).isDirectory()) continue;
  const fp = path.join(dir, "SKILL.md");
  if (!fs.existsSync(fp)) continue;
  const meta = metadata[skill];
  if (!meta) { skipped++; console.log("SKIP " + skill + " (no metadata)"); continue; }
  let raw = fs.readFileSync(fp, "utf8");
  const fm = raw.split("---");
  if (fm.length < 3) { console.log("SKIP " + skill + " (bad frontmatter)"); continue; }
  if (/^version: /m.test(fm[1])) { skipped++; console.log("SKIP " + skill + " (already v2)"); continue; }
  const fmEnd = raw.indexOf("---", raw.indexOf("---") + 3);
  if (fmEnd < 0) { console.log("SKIP " + skill + " (no closing ---)"); continue; }
  const lines = ["", "version: " + (meta.version || "1.0")];
  if (meta.category) lines.push("category: " + meta.category);
  if (meta.tags) lines.push("tags: [" + meta.tags.map(function (t) { return "\"" + t + "\""; }).join(", ") + "]");
  if (meta.dependencies && meta.dependencies.length) lines.push("dependencies: [" + meta.dependencies.map(function (d) { return "\"" + d + "\""; }).join(", ") + "]");
  if (meta.side_effects && meta.side_effects.length) lines.push("side_effects: [" + meta.side_effects.map(function (s) { return "\"" + s + "\""; }).join(", ") + "]");
  if (meta.triggers && meta.triggers.length) lines.push("triggers: [" + meta.triggers.map(function (t) { return "\"" + t + "\""; }).join(", ") + "]");
  const block = "\n" + lines.join("\n");
  raw = raw.slice(0, fmEnd) + block + "\n" + raw.slice(fmEnd);
  fs.writeFileSync(fp, raw);
  console.log("OK " + skill);
  updated++;
}
console.log("Done. " + updated + " updated, " + skipped + " skipped.");

