#!/usr/bin/env node
// Tiny stub build script. In a real Next.js project this is `next build`;
// here it just confirms every required source file exists.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const required = [
  'src/auth/index.ts',
  'src/notes/index.ts',
  'src/billing/index.ts',
  'public/index.html',
  'public/signup.html',
  'public/notes.html',
];

let missing = 0;
for (const f of required) {
  const ok = existsSync(join(ROOT, f));
  console.log((ok ? 'ok  ' : 'MISS ') + f);
  if (!ok) missing++;
}
if (missing > 0) {
  console.error('\n' + missing + ' file(s) missing');
  process.exit(1);
}
console.log('\nbuild stub: all required files present');
