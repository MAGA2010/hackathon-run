#!/usr/bin/env node
// cli.mjs — reads JSON from stdin, pretty-prints with an ISO timestamp prefix.
// Exit 0 on valid JSON, 1 on parse error, 2 on usage error.

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function usage() {
  process.stderr.write("usage: demo-cli [--no-ts] < input.json\n");
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) usage();
  const noTs = args.includes("--no-ts");
  const raw = await readStdin();
  if (!raw.trim()) usage();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    process.stderr.write("error: " + e.message + "\n");
    process.exit(1);
  }
  const out = JSON.stringify(parsed, null, 2);
  if (noTs) {
    process.stdout.write(out + "\n");
  } else {
    const ts = new Date().toISOString();
    process.stdout.write("[" + ts + "]\n" + out + "\n");
  }
}

main().catch((e) => {
  process.stderr.write("fatal: " + (e && e.stack || e) + "\n");
  process.exit(1);
});
