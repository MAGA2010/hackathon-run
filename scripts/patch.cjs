// Helper to apply file edits from a JSON patch file.
// Usage: node scripts/patch.cjs <file> <patches.json>
// where patches.json is { markerName: { old, new } }
const fs = require("node:fs");
const file = process.argv[2];
const patchesFile = process.argv[3];
if (!file || !patchesFile) { console.error("usage: patch.cjs <file> <patches.json>"); process.exit(99); }
const patches = JSON.parse(fs.readFileSync(patchesFile, "utf8"));
let content = fs.readFileSync(file, "utf8");
let applied = 0;
for (const [name, p] of Object.entries(patches)) {
  if (!content.includes(p.old)) { console.error(`SKIP ${name} (not found)`); continue; }
  const count = content.split(p.old).length - 1;
  if (count > 1) { console.error(`SKIP ${name} (${count} matches)`); continue; }
  content = content.replace(p.old, p.new);
  applied++;
  console.log(`OK ${name}`);
}
fs.writeFileSync(file, content);
console.log(`Applied ${applied} / ${Object.keys(patches).length} patches to ${file}`);

