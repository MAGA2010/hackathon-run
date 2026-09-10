#!/usr/bin/env node
// End-to-end judge calibration against an in-process HTTP backend.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { calibrateJudge } from '../dist/cli/commands/judge-calibrate.js';

const ROOT = resolve(import.meta.dirname, '..');
const golden = resolve(ROOT, 'tests', 'fixtures', 'judge-golden.json');
const cases = JSON.parse(readFileSync(golden, 'utf8')).cases;
let requestIndex = 0;

const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (body.protocol !== 'hackathon-run.judge.v2') {
        throw new Error(`unexpected protocol ${body.protocol}`);
      }
      const expected = cases[requestIndex % cases.length];
      requestIndex += 1;
      const dimensions = body.rubric.dimensions.map((dimension, index) => ({
        name: dimension.name,
        score: expected.expected[dimension.name] ?? index % 5,
        rationale: `Calibration fixture score for ${dimension.name}.`,
        evidence: [{ kind: 'test', value: 'judge-calibration-e2e' }],
        confidence: 0.9,
      }));
      const payload = {
        protocol: 'hackathon-run.judge.v2',
        request_id: body.request_id,
        model: 'calibration-e2e-judge',
        generated_at: '2026-09-10T00:00:00Z',
        dimensions,
        overall:
          dimensions.reduce((total, dimension) => total + dimension.score, 0) / dimensions.length,
      };
      const encoded = Buffer.from(JSON.stringify(payload));
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(encoded.length),
      });
      response.end(encoded);
    } catch (error) {
      const encoded = Buffer.from(JSON.stringify({ error: error.message }));
      response.writeHead(400, {
        'content-type': 'application/json',
        'content-length': String(encoded.length),
      });
      response.end(encoded);
    }
  });
});

await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});

try {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('judge calibration server did not expose a TCP port');
  }
  const code = await calibrateJudge({
    golden,
    backend: `http://127.0.0.1:${address.port}`,
    maxMae: 0,
    json: false,
  });
  if (code !== 0) throw new Error(`judge calibration exited ${code}`);
  if (requestIndex !== cases.length) {
    throw new Error(`expected ${cases.length} judge requests, received ${requestIndex}`);
  }
  console.log(`PASS judge calibration: ${cases.length} golden cases, zero MAE, real HTTP backend`);
} finally {
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}
