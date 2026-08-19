/**
 * logger.ts — uniform output for the CLI. Honors NO_COLOR if set.
 */

import { c } from './colors.js';

const useColor = !process.env.NO_COLOR && process.stdout.isTTY !== false;

function apply(s: string, fn: (x: string) => string): string {
  return useColor ? fn(s) : s;
}

export const log = {
  info: (msg: string) => console.log(apply(msg, c.cyan)),
  ok: (msg: string) => console.log(apply(`[OK] ${msg}`, c.green)),
  warn: (msg: string) => console.warn(apply(`[!] ${msg}`, c.yellow)),
  err: (msg: string) => console.error(apply(`[ERR] ${msg}`, c.red)),
  dim: (msg: string) => console.log(apply(msg, c.dim)),
  bold: (msg: string) => console.log(apply(msg, c.bold)),
};
