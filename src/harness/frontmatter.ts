/**
 * frontmatter.ts — minimal YAML frontmatter parser for SKILL.md files.
 *
 * We intentionally do not depend on js-yaml. The frontmatter shape is
 * constrained (see SkillFrontmatter), and a hand-rolled parser keeps the
 * runtime zero-dep-friendly for downstream hackers.
 *
 * Supported features:
 *   - scalar keys: name: value
 *   - block-scalar values (description, when_to_use): either inline after
 *     the key or on subsequent indented lines until the next key
 *   - array values via YAML-ish "- item" under a key, or JSON-ish "[...]"
 *     inline. We need arrays for `paths` and `allowed_tools`.
 *
 * Not supported (and we don't need to): nested mappings, anchors, tags.
 */

import type { SkillFrontmatter } from './types.js';

interface ParseResult {
  frontmatter: SkillFrontmatter;
  body: string;
  triggerBudget: number;
}

const KEY_RE = /^([a-z_][a-z0-9_]*):\s*(.*)$/i;

function parseInline(value: string): unknown {
  const v = value.trim();
  if (!v) return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    try {
      // Best-effort JSON-ish array.
      const inner = v.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((s) => s.trim().replace(/^["'']|["'']$/g, ''));
    } catch {
      return v;
    }
  }
  if (v.startsWith('"') || v.startsWith("''")) {
    return v.slice(1, -1);
  }
  return v;
}

export function parseFrontmatter(raw: string): ParseResult {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    throw new Error('missing YAML frontmatter; SKILL.md must start with ---');
  }
  const fmText = m[1] ?? '';
  const body = (m[2] ?? '').replace(/^\n+/, '');

  const lines = fmText.split('\n');
  const fm: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let blockBuffer: string[] = [];
  // Tracks whether current key is collecting a list. Lines beginning with "- "
  // (indented to align with the key) are appended as list items.
  let currentList: string[] | null = null;

  const flushBlock = () => {
    if (!currentKey) return;
    if (currentList) {
      fm[currentKey] = currentList;
      currentList = null;
      return;
    }
    const text = blockBuffer.join('\n').trim();
    if (text) {
      // Block scalars under `when_to_use:` keep newlines; under other keys
      // we treat them as plain text.
      fm[currentKey] = currentKey === 'when_to_use' ? text : text.replace(/\s+/g, ' ').trim();
    }
    blockBuffer = [];
  };

  const isIndented = (line: string): boolean => line.startsWith(' ') || line.startsWith('\t');

  for (const line of lines) {
    const km = line.match(KEY_RE);
    if (km && !isIndented(line)) {
      flushBlock();
      const key = (km[1] ?? '').toLowerCase();
      const rest = (km[2] ?? '').trim();
      currentKey = key;
      blockBuffer = [];
      if (rest === '|' || rest === '>' || rest === '') {
        // Block scalar follows on subsequent lines.
        continue;
      }
      fm[key] = parseInline(rest);
    } else if (currentKey) {
      // Indented continuation of current block.
      const stripped = line.replace(/^\s+/, '');
      if (stripped.startsWith('- ')) {
        // YAML list item. Flush any prior block text for this key first.
        if (blockBuffer.length > 0) {
          // We had buffered scalar content; treat list start as boundary.
          const text = blockBuffer.join('\n').trim();
          if (text && !currentList) {
            fm[currentKey] = currentKey === 'when_to_use' ? text : text.replace(/\s+/g, ' ').trim();
          }
          blockBuffer = [];
        }
        if (!currentList) currentList = [];
        currentList.push(
          stripped
            .slice(2)
            .trim()
            .replace(/^["'']|["'']$/g, ''),
        );
      } else if (stripped === '') {
        // Blank indented line; skip but keep list state.
        continue;
      } else {
        // Non-list continuation: only valid for block scalars.
        blockBuffer.push(stripped);
      }
    }
  }
  flushBlock();

  if (!fm.name || typeof fm.name !== 'string') {
    throw new Error('frontmatter missing required field: name');
  }
  if (!fm.description || typeof fm.description !== 'string') {
    throw new Error('frontmatter missing required field: description');
  }

  const description = String(fm.description);
  const when_to_use = fm.when_to_use ? String(fm.when_to_use) : '';
  const triggerBudget = description.length + when_to_use.length;

  return {
    frontmatter: {
      name: String(fm.name),
      description,
      when_to_use: when_to_use || undefined,
      paths: Array.isArray(fm.paths) ? fm.paths.map(String) : undefined,
      allowed_tools: Array.isArray(fm.allowed_tools) ? fm.allowed_tools.map(String) : undefined,
      model: fm.model ? String(fm.model) : undefined,
    },
    body,
    triggerBudget,
  };
}

/** Hard ceiling: combined description + when_to_use cannot exceed 1536 chars. */
export const TRIGGER_BUDGET = 1536;

export function enforceTriggerBudget(parsed: ParseResult): void {
  if (parsed.triggerBudget > TRIGGER_BUDGET) {
    throw new Error(
      `trigger budget exceeded: ${parsed.triggerBudget} > ${TRIGGER_BUDGET} ` +
        `(description ${parsed.frontmatter.description.length} + ` +
        `when_to_use ${parsed.frontmatter.when_to_use?.length ?? 0})`,
    );
  }
}
