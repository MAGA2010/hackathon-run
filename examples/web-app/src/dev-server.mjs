#!/usr/bin/env node
// Minimal dev server for the example. The real Next.js app is what teams would
// build during a hackathon; this stub just serves the bare minimum so
// `npm run dev` actually responds and the demo_path can be smoke-tested.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const PORT = Number(process.env.PORT || 3000);

const ROUTES = {
  '/': 'public/index.html',
  '/signup': 'public/signup.html',
  '/notes': 'public/notes.html',
  '/api/notes': null,
  '/api/health': null,
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = ROUTES[url.pathname];

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
    return;
  }
  if (url.pathname === '/api/notes' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const note = {
        id: Date.now().toString(36),
        body: String(body).slice(0, 5000),
        createdAt: new Date().toISOString(),
      };
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(note));
    });
    return;
  }
  if (route === undefined) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  if (route === null) {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    const html = await readFile(join(ROOT, route), 'utf-8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`template missing: ${route}`);
  }
});

server.listen(PORT, () => {
  console.log(`web-app example listening on http://localhost:${PORT}`);
});
