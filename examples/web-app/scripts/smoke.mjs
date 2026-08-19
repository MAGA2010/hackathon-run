#!/usr/bin/env node
// Cross-platform smoke test for the web-app example. Boots the dev server,
// hits each step in the plan, and tears it down.
//
// This is the canonical way to run the smoke test; the .sh version is kept
// for users on Linux/macOS who prefer shell.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const PORT = Number(process.env.PORT || 3210);
const BASE = `http://localhost:${PORT}`;

const server = spawn('node', ['src/dev-server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stderr.write(`[dev] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[dev!] ${d}`));

async function shutdown() {
  try {
    server.kill('SIGTERM');
  } catch {}
  await sleep(50);
}
process.on('SIGINT', () => shutdown().then(() => process.exit(130)));
process.on('exit', () => {
  try {
    server.kill('SIGTERM');
  } catch {}
});

async function expect(cond, label) {
  if (!cond) {
    console.error(`FAIL ${label}`);
    await shutdown();
    process.exit(1);
  }
  console.log(`ok   ${label}`);
}

await sleep(800);

try {
  const r1 = await fetch(`${BASE}/`);
  await expect(r1.status === 200, 'step 1: landing page returns 200');

  const r2 = await fetch(`${BASE}/signup`);
  await expect(r2.status === 200, 'step 2: signup page returns 200');

  const r3 = await fetch(`${BASE}/notes`);
  await expect(r3.status === 200, 'step 3: notes page returns 200');

  const r4 = await fetch(`${BASE}/api/notes`, {
    method: 'POST',
    body: 'hello from web-app example',
  });
  const note = await r4.json();
  await expect(
    note && note.body === 'hello from web-app example',
    'step 4: POST /api/notes echoes body',
  );

  const r5 = await fetch(`${BASE}/api/health`);
  const health = await r5.json();
  await expect(health.ok === true, 'step 5: /api/health reports ok=true');

  console.log('\nALL DEMO STEPS PASS');
} finally {
  await shutdown();
}
