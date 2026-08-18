/**
 * colors.ts — tiny ANSI color helpers. We avoid chalk to keep the
 * runtime zero-dep for downstream hackers; this file is the only place
 * that touches escape codes.
 */

const wrap = (open: number, close: number) => (s: string) =>
  `\x1b[${open}m${s}\x1b[${close}m`;

export const c = {
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  inverse: wrap(7, 27),
};

export const CUT = c.red;
export const DEFER = c.yellow;
export const KEEP = c.green;
export const P0 = c.red;
export const P1 = c.yellow;
export const P2 = c.gray;

/** Returns a string suitable for an 80-col terminal table. */
export function row(cols: string[], widths: number[]): string {
  const parts = cols.map((col, i) => {
    const w = widths[i] ?? 20;
    return col.padEnd(w).slice(0, w);
  });
  return parts.join("  ");
}
