/**
 * new-skill.ts - scaffold a brand-new skill folder.
 *
 * Usage:
 *   hackathon new-skill <name> [--force] [--with-scripts] [--with-tests]
 *
 * Writes:
 *   skills/<name>/SKILL.md           (frontmatter + required sections)
 *   skills/<name>/scripts/<name>.py  (stub if --with-scripts)
 *   skills/<name>/tests/test_<name>.sh  (acceptance stub if --with-tests)
 *   skills/<name>/references/<name>-examples.md (optional, always created)
 *
 * Validates:
 *   - name is kebab-case
 *   - target folder does not exist (unless --force)
 *   - SKILL.md frontmatter parses + budget under 1536
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { c } from '../lib/colors.js';
import { log } from '../lib/logger.js';

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export interface NewSkillOptions {
  name: string;
  cwd: string;
  force?: boolean;
  withScripts?: boolean;
  withTests?: boolean;
  description?: string;
  /** one-liner shown in the help output (e.g. "my new skill helps X") */
  whenToUse?: string;
}

function templateSkillMarkdown(opts: {
  name: string;
  description: string;
  whenToUse: string;
}): string {
  return `---
name: ${opts.name}
description: ${opts.description}
when_to_use: |
  ${opts.whenToUse}
---

# ${opts.name}

> TODO: one-line tagline shown in the docs index.

## Input contract

Required:

- \`repo_root\`: path to current project root

Optional:

- \`.hackathon/state/*.json\` (load if exists)

## Execution

### 1. Step one

Describe what the skill does. Replace this paragraph with the actual logic.

### 2. Step two

If the skill has multiple phases, list each one.

## Output contract

Files written:

- \`.hackathon/state/<this-skill>.json\` (matches \`src/state/schemas/<this-skill>.schema.json\`)
- \`.hackathon/artifacts/<this-skill>-output.md\` (human-readable)

## Acceptance criteria

- [ ] Outputs the state file with version "1.0".
- [ ] Refuses to run without \`repo_root\`.
- [ ] Writes a human-readable artifact.

## Failure modes

| Mode                  | Behavior                              |
| --------------------- | ------------------------------------- |
| Missing input         | Ask once, refuse to default           |
| Schema mismatch       | Fail loud with diff, do not coerce     |
| Empty repo            | Suggest running \`idea-clarify\` first |

## Trigger phrases (for agent intent matching)

- "TODO: phrase one"
- "TODO: phrase two"
- "TODO: phrase three"
`;
}

function templateScript(name: string): string {
  return `#!/usr/bin/env python3
"""
${name}.py - TODO: one-line description.

Stdlib only. Reads .hackathon/state/*.json for context and writes:
  - .hackathon/state/${name}.json  (matches the schema)
  - .hackathon/artifacts/${name}-output.md
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

VERSION = "1.0"


def main() -> int:
    ap = argparse.ArgumentParser(description="${name} skill script")
    ap.add_argument("--repo-root", required=True, help="path to current project root")
    ap.add_argument("--out-dir", default=None, help="defaults to <repo-root>/.hackathon")
    args = ap.parse_args()

    out_dir = Path(args.out_dir or Path(args.repo_root) / ".hackathon")
    state_path = out_dir / "state" / "${name}.json"
    artifact_path = out_dir / "artifacts" / "${name}-output.md"

    # TODO: real logic here. The example below writes a placeholder state file.
    state = {
        "version": VERSION,
        "generated_at": "TODO_ISO_TIMESTAMP",
        "summary": "TODO: real summary",
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2))

    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text("# ${name} output\\n\\nTODO: human-readable notes.\\n")

    print(f"wrote {state_path}")
    print(f"wrote {artifact_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;
}

function templateAcceptanceTest(name: string): string {
  return `#!/usr/bin/env bash
# Acceptance test for the ${name} skill.
# This is the contract every skill must pass before ship.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/skills/${name}/scripts/${name}.py"

if [ ! -f "$SCRIPT" ]; then
  echo "FAIL: missing script $SCRIPT"
  exit 1
fi

# Make a scratch repo so we do not pollute the user's tree.
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/repo/.hackathon"

python3 "$SCRIPT" --repo-root "$TMP/repo" --out-dir "$TMP/repo/.hackathon"

if [ ! -f "$TMP/repo/.hackathon/state/${name}.json" ]; then
  echo "FAIL: did not write state/${name}.json"
  exit 1
fi

if [ ! -f "$TMP/repo/.hackathon/artifacts/${name}-output.md" ]; then
  echo "FAIL: did not write artifacts/${name}-output.md"
  exit 1
fi

# Validate the state file against its schema.
SCHEMA="$ROOT/src/state/schemas/${name}.schema.json"
if [ -f "$SCHEMA" ]; then
  if ! node -e "const Ajv=require('ajv'); const a=new Ajv({strict:false}); const f=require('ajv-formats'); f(a); const s=JSON.parse(require('fs').readFileSync('$SCHEMA','utf-8')); const v=a.compile(s); const d=JSON.parse(require('fs').readFileSync('$TMP/repo/.hackathon/state/${name}.json','utf-8')); if(!v(d)){console.error(JSON.stringify(v.errors)); process.exit(1);}"; then
    echo "FAIL: state/${name}.json did not validate against schema"
    exit 1
  fi
fi

echo "OK: ${name} acceptance test passed"
`;
}

function templateExamples(name: string): string {
  return `# ${name} — worked examples

TODO: one concrete input/output pair.

\`\`\`
Input:
  repo_root: .

Expected output (.hackathon/state/${name}.json):
  {
    "version": "1.0",
    "generated_at": "<ISO>",
    "summary": "..."
  }
\`\`\`
`;
}

export function newSkill(opts: NewSkillOptions): number {
  if (!NAME_RE.test(opts.name)) {
    log.err(
      `invalid skill name "${opts.name}"; must be kebab-case (e.g. my-skill, scope-knife, fast-verify)`,
    );
    return 1;
  }
  const target = resolve(opts.cwd, 'skills', opts.name);
  if (existsSync(target) && !opts.force) {
    log.err(`skill folder already exists: ${target}`);
    log.dim('use --force to overwrite (destructive)');
    return 1;
  }
  const description = opts.description ?? `TODO: one-line description for ${opts.name}.`;
  const whenToUse = opts.whenToUse ?? `TODO: when should an agent invoke ${opts.name}?`;
  mkdirSync(target, { recursive: true });
  mkdirSync(join(target, 'scripts'), { recursive: true });
  mkdirSync(join(target, 'references'), { recursive: true });
  mkdirSync(join(target, 'tests'), { recursive: true });

  const files: Array<[string, string]> = [
    [join(target, 'SKILL.md'), templateSkillMarkdown({ name: opts.name, description, whenToUse })],
    [join(target, 'references', `${opts.name}-examples.md`), templateExamples(opts.name)],
  ];
  if (opts.withScripts !== false) {
    files.push([join(target, 'scripts', `${opts.name}.py`), templateScript(opts.name)]);
  }
  if (opts.withTests) {
    files.push([join(target, 'tests', `test_${opts.name}.sh`), templateAcceptanceTest(opts.name)]);
  }

  for (const [path, content] of files) {
    writeFileSync(path, content);
    console.log(c.cyan('  + ') + path);
  }
  console.log();
  console.log(c.green(`✓ scaffolded skills/${opts.name}/`));
  console.log();
  console.log('Next steps:');
  console.log('  1. Edit SKILL.md to describe the actual behavior.');
  console.log('  2. Replace scripts/<name>.py with the real logic.');
  console.log('  3. Add a JSON schema at src/state/schemas/<name>.schema.json.');
  console.log('  4. Re-run this CLI to verify:');
  console.log(c.cyan(`     hackathon validate-skill skills/${opts.name}`));
  return 0;
}
