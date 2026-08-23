/**
 * server.ts — minimal Model Context Protocol (MCP) server that exposes the
 * Hackathon Run harness to any MCP-compatible agent (Codex, Claude Code,
 * Cursor, etc.).
 *
 * The server speaks JSON-RPC 2.0 over stdio (per the MCP spec). It exposes
 * four tools:
 *
 *   list_skills        - enumerate every bundled skill
 *   get_skill          - read a SKILL.md by name
 *   match_skill        - find the best skill for an utterance
 *   status             - read all 5 state files and return the lifecycle summary
 *
 * Transport: line-delimited JSON over stdio.
 *
 * Usage:
 *   node dist/mcp/server.js
 *
 * We deliberately keep this minimal: no third-party SDK, no schema files,
 * no capability negotiation beyond the four tools above. The harness is
 * the value; the MCP wrapper is a thin transport.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { loadAllSkills } from '../harness/loader.js';
import { matchSkill } from '../harness/trigger.js';
import { matchSkillWithBackend } from '../harness/embed.js';
import { status } from '../cli/commands/status.js';
import { validateSkill } from '../cli/commands/validate-skill.js';
import { replay } from '../cli/commands/replay.js';
import { report } from '../cli/commands/report.js';
import { resume } from '../cli/commands/resume.js';
import { sprint } from '../cli/commands/sprint.js';
import { trace } from '../cli/commands/trace.js';
import { runChain } from '../cli/commands/run.js';
import { skills as skillsCommand } from '../cli/commands/skills.js';

// Resolve the package version once at startup. Falls back to '0.0.0' if package.json
// is unreachable (e.g. when the package is installed globally and bundled differently).
const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveVersion(): string {
  for (const candidate of [
    join(__dirname, '..', '..', 'package.json'),
    join(__dirname, '..', 'package.json'),
    join(__dirname, 'package.json'),
  ]) {
    try {
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8'));
        if (typeof pkg.version === 'string') return pkg.version;
      }
    } catch {
      // ignore; try next candidate
    }
  }
  return '0.0.0';
}
const PKG_VERSION = resolveVersion();

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_skills',
    description: 'List every bundled skill, with its description and trigger budget usage.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_skill',
    description:
      'Read a single SKILL.md by name. Returns the frontmatter, trigger budget, and full body.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', description: 'kebab-case skill name' } },
      additionalProperties: false,
    },
  },
  {
    name: 'match_skill',
    description:
      'Given a user utterance, find the best matching skill. Returns the top candidate plus a short list of alternatives.',
    inputSchema: {
      type: 'object',
      required: ['utterance'],
      properties: {
        utterance: {
          type: 'string',
          description: 'what the user said or what the agent is trying to do',
        },
        debug: { type: 'boolean', description: 'include per-candidate scoring reasons' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'status',
    description:
      'Read all 5 state files in .hackathon/state/ and return the lifecycle stage + per-file highlights.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'repo root; defaults to CWD' } },
      additionalProperties: false,
    },
  },
  {
    name: 'resume',
    description:
      'Read the harness handoff brief from session.json and return the compact state a fresh agent needs to continue.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'repo root; defaults to CWD' } },
      additionalProperties: false,
    },
  },
  {
    name: 'sprint_new',
    description:
      'Create a default-FAIL sprint contract from the first unpassed KEEP feature in plan.json.',
    inputSchema: {
      type: 'object',
      properties: {
        feature: { type: 'string', description: 'feature name from plan.json' },
        name: { type: 'string', description: 'sprint name' },
        goal: { type: 'string', description: 'sprint goal' },
        minutes: { type: 'number', description: 'time budget in minutes' },
        max_iterations: { type: 'number', description: 'iteration cap' },
        force: { type: 'boolean', description: 'overwrite an existing active sprint' },
        cwd: { type: 'string', description: 'repo root; defaults to CWD' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'sprint_review',
    description:
      'Emit the read-only evaluator handoff for the active sprint and write the eval.json skeleton.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'repo root; defaults to CWD' } },
      additionalProperties: false,
    },
  },
  {
    name: 'sprint_accept',
    description:
      'Apply the evaluator verdict from eval.json back to plan.json, sprint.json, and session.json.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'owner to record on a passing feature' },
        cwd: { type: 'string', description: 'repo root; defaults to CWD' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'trace',
    description: 'Read the append-only harness event log at .hackathon/traces/events.jsonl.',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'repo root; defaults to CWD' },
        last: { type: 'number', description: 'only return the last N events' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'validate_skill',
    description:
      'Lint a skill directory against the Hackathon Run skill protocol. ' +
      'Returns findings with severity and message; non-zero exit code on errors.',
    inputSchema: {
      type: 'object',
      required: ['target'],
      properties: {
        target: {
          type: 'string',
          description: 'absolute path to the skill directory containing SKILL.md',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'apply_skill_advice',
    description:
      'Write a structured skill advice payload (e.g. from scope-knife, judge-sim) to the matching state file. ' +
      'Validates the payload against the relevant schema before writing; refuses to overwrite without merge=true.',
    inputSchema: {
      type: 'object',
      required: ['state_file', 'payload'],
      properties: {
        state_file: {
          type: 'string',
          description:
            'basename without extension, e.g. "plan", "verify", "review", "demo", "ship"',
        },
        payload: {
          type: 'object',
          description: 'state-file body to write (must conform to the schema)',
        },
        merge: {
          type: 'boolean',
          description: 'if true, deep-merge into the existing file instead of replacing',
        },
        cwd: {
          type: 'string',
          description: 'repo root; defaults to CWD',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_examples',
    description:
      'List every bundled example project under examples/. Each entry has a name, a stack summary, and the stage it best demos.',
    inputSchema: {
      type: 'object',
      properties: {
        stack: {
          type: 'string',
          description: 'optional stack filter (e.g. "node", "python", "react-native")',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_recovery_plan',
    description:
      'Return the recovery-runbook 30-second fallback script + decision tree for a failing demo path. ' +
      'Use this when fast-verify reports a failure and the team needs a Plan B on stage.',
    inputSchema: {
      type: 'object',
      properties: {
        failing_step: {
          type: 'string',
          description: 'short label for the step that broke (e.g. "login", "checkout", "render")',
        },
        time_remaining_minutes: {
          type: 'number',
          description: 'minutes until the live demo (>= 0)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'replay',
    description:
      'Reconstruct the team timeline from .hackathon/state/ files, ordered by generated_at / started_at. Returns the same JSON as `hackathon replay --json`.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'repo root; defaults to CWD' } },
      additionalProperties: false,
    },
  },
  {
    name: 'report',
    description:
      'Generate the post-hackathon report from state files. Returns the machine-readable payload (states, verdict, timeline).',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'repo root; defaults to CWD' } },
      additionalProperties: false,
    },
  },
  {
    name: 'skills_pin',
    description:
      'Pin every bundled skill into .hackathon/skills.json with name + version + sha256 checksum. Returns the pin path.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'repo root; defaults to CWD' } },
      additionalProperties: false,
    },
  },
  {
    name: 'skills_diff',
    description:
      'Compare the pinned .hackathon/skills.json against the current bundled skills. Returns lines describing added / removed / changed entries.',
    inputSchema: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'repo root; defaults to CWD' } },
      additionalProperties: false,
    },
  },
  {
    name: 'find_skills',
    description:
      'Filter the skill catalog by Format v2 metadata. Multiple filters are AND-combined; no filters returns every skill with its v2 metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'match skills with this tag' },
        category: {
          type: 'string',
          enum: [
            'scoping',
            'building',
            'verifying',
            'demoing',
            'judging',
            'shipping',
            'recovering',
            'lifecycle',
          ],
        },
        writes: {
          type: 'string',
          description: 'match skills that write .hackathon/state/<writes>.json',
        },
        depends_on: {
          type: 'string',
          description: 'match skills that pair with / chain to this name',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'skill_chain',
    description:
      'Return the dependency-ordered list of skills that should run before a target skill, following Format v2 "dependencies". ' +
      'Use this when the agent needs to chain multiple skills (e.g. idea-clarify -> stack-picker) without invoking each one manually.',
    inputSchema: {
      type: 'object',
      required: ['target'],
      properties: {
        target: { type: 'string', description: 'kebab-case target skill name' },
      },
      additionalProperties: false,
    },
  },
];

function captureJsonCommand(fn: () => number): unknown {
  const captured: string[] = [];
  const orig = console.log;
  console.log = (...a) => {
    captured.push(a.join(' '));
  };
  try {
    const exitCode = fn();
    const raw = captured.join('\n');
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }
    return { exitCode, ...(payload && typeof payload === 'object' ? payload : { output: raw }) };
  } finally {
    console.log = orig;
  }
}

async function toolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  const cwd = process.cwd();
  const skills = loadAllSkills(cwd);
  switch (name) {
    case 'list_skills': {
      return {
        skills: skills.map((s) => ({
          name: s.frontmatter.name,
          description: s.frontmatter.description,
          triggerBudget: s.triggerBudget,
          budgetPercent: Math.round((s.triggerBudget / 1536) * 100),
        })),
      };
    }
    case 'get_skill': {
      const skillName = String(args.name ?? '');
      const skill = skills.find((s) => s.frontmatter.name === skillName);
      if (!skill) {
        throw new Error(
          'skill not found: ' +
            skillName +
            '; available: ' +
            skills.map((s) => s.frontmatter.name).join(', '),
        );
      }
      return {
        name: skill.frontmatter.name,
        description: skill.frontmatter.description,
        when_to_use: skill.frontmatter.when_to_use ?? null,
        triggerBudget: skill.triggerBudget,
        body: skill.body,
      };
    }
    case 'match_skill': {
      const utterance = String(args.utterance ?? '');
      const debug = Boolean(args.debug);
      const outcome = await matchSkillWithBackend(utterance, skills);
      const result = outcome.result;
      return {
        utterance,
        source: outcome.source,
        best: result.skill ? { name: result.skill.frontmatter.name, score: result.score } : null,
        candidates: result.candidates.slice(0, debug ? skills.length : 5),
      };
    }
    case 'status': {
      const captured: string[] = [];
      const orig = console.log;
      console.log = (...a) => {
        captured.push(a.join(' '));
      };
      try {
        const code = status({ cwd: String(args.cwd ?? cwd), json: true });
        const raw = captured.join('\n');
        const json = raw ? JSON.parse(raw) : {};
        return { exitCode: code, ...json };
      } finally {
        console.log = orig;
      }
    }
    case 'resume': {
      return captureJsonCommand(() => resume({ cwd: String(args.cwd ?? cwd), json: true }));
    }
    case 'sprint_new': {
      return captureJsonCommand(() =>
        sprint({
          subcommand: 'new',
          cwd: String(args.cwd ?? cwd),
          feature: args.feature ? String(args.feature) : undefined,
          name: args.name ? String(args.name) : undefined,
          goal: args.goal ? String(args.goal) : undefined,
          minutes: args.minutes != null ? Number(args.minutes) : undefined,
          maxIterations: args.max_iterations != null ? Number(args.max_iterations) : undefined,
          force: Boolean(args.force),
          json: true,
        }),
      );
    }
    case 'sprint_review': {
      return captureJsonCommand(() =>
        sprint({ subcommand: 'review', cwd: String(args.cwd ?? cwd), json: true }),
      );
    }
    case 'sprint_accept': {
      return captureJsonCommand(() =>
        sprint({
          subcommand: 'accept',
          cwd: String(args.cwd ?? cwd),
          owner: args.owner ? String(args.owner) : undefined,
          json: true,
        }),
      );
    }
    case 'trace': {
      return captureJsonCommand(() =>
        trace({
          cwd: String(args.cwd ?? cwd),
          json: true,
          last: args.last != null ? Number(args.last) : undefined,
        }),
      );
    }
    case 'validate_skill': {
      const target = String(args.target ?? '');
      if (!target) throw new Error('target is required');
      const captured: string[] = [];
      const orig = console.log;
      console.log = (...a) => {
        captured.push(a.join(' '));
      };
      try {
        const exitCode = validateSkill({ target, cwd });
        return { target, exitCode, findings: captured };
      } finally {
        console.log = orig;
      }
    }
    case 'apply_skill_advice': {
      const stateFile = String(args.state_file ?? '');
      if (!stateFile) throw new Error('state_file is required');
      const payload = (args.payload ?? {}) as Record<string, unknown>;
      const merge = Boolean(args.merge);
      const repoRoot = String(args.cwd ?? cwd);
      return applySkillAdvice(stateFile, payload, merge, repoRoot);
    }
    case 'list_examples': {
      const filterStack = args.stack ? String(args.stack).toLowerCase() : '';
      const examplesDir = join(__dirname, '..', '..', 'examples');
      if (!existsSync(examplesDir)) return { examples: [] };

      const entries = readdirSync(examplesDir).filter((d) =>
        statSync(join(examplesDir, d)).isDirectory(),
      );
      const out: Array<{ name: string; stack: string; stage: string; has_state: boolean }> = [];
      for (const d of entries) {
        const readme = join(examplesDir, d, 'README.md');
        const stateDir = join(examplesDir, d, '.hackathon', 'state');
        const hasState = existsSync(stateDir);
        let stack = 'unknown';
        let stage = 'unclear';
        if (existsSync(readme)) {
          const txt = readFileSync(readme, 'utf8').toLowerCase();
          if (/python|\.py\b/.test(txt)) stack = 'python';
          else if (/typescript|tsx|\.ts\b/.test(txt)) stack = 'typescript';
          else if (/javascript|\.js\b|node/.test(txt)) stack = 'node';
          else if (/react-native|swift|kotlin/.test(txt)) stack = 'mobile';
          else if (/chrome|extension|manifest\.json/.test(txt)) stack = 'browser-extension';
          else if (/cli/.test(txt)) stack = 'cli';
          if (/plan|scope/.test(txt)) stage = 'scope';
          else if (/verify|smoke/.test(txt)) stage = 'verify';
          else if (/demo|pitch/.test(txt)) stage = 'demo';
          else if (/review|judge/.test(txt)) stage = 'review';
          else if (/ship|submit/.test(txt)) stage = 'ship';
        }
        if (filterStack && !stack.includes(filterStack)) continue;
        out.push({ name: d, stack, stage, has_state: hasState });
      }
      return { examples: out };
    }
    case 'get_recovery_plan': {
      const failing = String(args.failing_step ?? 'unknown');
      const mins = Number(args.time_remaining_minutes ?? 30);
      return {
        failing_step: failing,
        time_remaining_minutes: mins,
        fallback_script: [
          'OPEN with: "Quick context before the demo — let me show you what we built in 30 seconds."',
          'SHOW the README screenshot (pre-rendered).',
          'NARRATE the value prop: problem -> insight -> demo.',
          'SKIP the live click-through if it failed; pivot to a recorded GIF.',
          'CLOSE with: "Happy to deep-dive after the time slot."',
        ],
        decision_tree: {
          live_failed_under_5min: 'Use fallback_script verbatim.',
          live_failed_with_recording: 'Play the pre-rendered demo GIF instead.',
          partial_failure: 'Demo the working parts; narrate the broken path.',
          no_fallback_material: 'Print the static README + architectural diagram.',
        },
        checklist: [
          'confirm microphone works before going on stage',
          'have the recovery script open in a second tab',
          'have a teammate on standby for hot-fixes',
        ],
      };
    }
    case 'replay': {
      return captureJsonCommand(() => replay({ cwd: String(args.cwd ?? cwd), json: true }));
    }
    case 'report': {
      return captureJsonCommand(() => report({ cwd: String(args.cwd ?? cwd), json: true }));
    }
    case 'skills_pin': {
      return captureJsonCommand(() =>
        skillsCommand({ subcommand: 'pin', cwd: String(args.cwd ?? cwd) }),
      );
    }
    case 'skills_diff': {
      return captureJsonCommand(() =>
        skillsCommand({ subcommand: 'diff', cwd: String(args.cwd ?? cwd) }),
      );
    }
    case 'find_skills': {
      const tag = args.tag ? String(args.tag) : undefined;
      const category = args.category ? String(args.category) : undefined;
      const writes = args.writes ? String(args.writes) : undefined;
      const depends_on = args.depends_on ? String(args.depends_on) : undefined;
      const matched = skills.filter((s) => {
        const fm = s.frontmatter;
        if (tag && !(fm.tags ?? []).includes(tag)) return false;
        if (category && fm.category !== category) return false;
        if (writes && !(fm.side_effects ?? []).includes(writes)) return false;
        if (depends_on && !(fm.dependencies ?? []).includes(depends_on)) return false;
        return true;
      });
      return {
        total: skills.length,
        matched: matched.length,
        filters: { tag, category, writes, depends_on },
        skills: matched.map((s) => ({
          name: s.frontmatter.name,
          version: s.frontmatter.version ?? null,
          category: s.frontmatter.category ?? null,
          tags: s.frontmatter.tags ?? [],
          dependencies: s.frontmatter.dependencies ?? [],
          side_effects: s.frontmatter.side_effects ?? [],
          trigger_phrases: s.frontmatter.triggers ?? [],
          author: s.frontmatter.author ?? null,
          license: s.frontmatter.license ?? null,
          homepage: s.frontmatter.homepage ?? null,
          repository: s.frontmatter.repository ?? null,
          compatibility: s.frontmatter.compatibility ?? null,
        })),
      };
    }
    case 'skill_chain': {
      const target = String(args.target ?? '');
      if (!target) throw new Error('target is required');
      return captureJsonCommand(() => runChain({ skillName: target, noBanner: true, cwd }));
    }
    default:
      throw new Error('unknown tool: ' + name);
  }
}

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  try {
    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'hackathon-run', version: PKG_VERSION },
            capabilities: { tools: {} },
          },
        };
      case 'notifications/initialized':
        // Client notification; no response needed.
        return null;
      case 'tools/list':
        return { jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } };
      case 'tools/call': {
        const params = req.params ?? {};
        const toolName = String(params.name ?? '');
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const result = await toolCall(toolName, args);
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        };
      }
      case 'ping':
        return { jsonrpc: '2.0', id: req.id, result: { ok: true } };
      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: 'method not found: ' + req.method },
        };
    }
  } catch (e) {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32603, message: (e as Error).message },
    };
  }
}

function deepMerge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const tv = out[k];
    if (
      pv &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      tv &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      out[k] = deepMerge(tv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      out[k] = pv;
    }
  }
  return out;
}

function applySkillAdvice(
  stateFile: string,
  payload: Record<string, unknown>,
  merge: boolean,
  repoRoot: string,
): unknown {
  const allowed = ['plan', 'verify', 'review', 'demo', 'ship', 'recovery'];
  if (!allowed.includes(stateFile)) {
    throw new Error('state_file must be one of ' + allowed.join(', ') + '; got ' + stateFile);
  }
  const schemaPath = join(
    __dirname,
    '..',
    '..',
    'src',
    'state',
    'schemas',
    stateFile + '.schema.json',
  );
  if (!existsSync(schemaPath)) {
    throw new Error('schema not found at ' + schemaPath);
  }

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

  const targetPath = join(repoRoot, '.hackathon', 'state', stateFile + '.json');
  let final = payload;
  if (merge && existsSync(targetPath)) {
    const existing = JSON.parse(readFileSync(targetPath, 'utf8'));
    final = deepMerge(existing, payload);
  }
  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(targetPath, JSON.stringify(final, null, 2) + '\n');
  return { wrote: targetPath, bytes: statSync(targetPath).size, schema: schema.title ?? stateFile };
}

export function startMcpServer() {
  let buffer = '';
  let pending = 0;
  let ended = false;
  const maybeExit = () => {
    if (ended && pending === 0) process.exit(0);
  };
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line);
      } catch (e) {
        process.stderr.write('[mcp] bad json: ' + (e as Error).message + '\n');
        continue;
      }
      pending++;
      Promise.resolve(handleRequest(req))
        .then((resp) => {
          pending--;
          if (resp && req.id !== undefined && req.id !== null) {
            process.stdout.write(JSON.stringify(resp) + '\n');
          }
        })
        .catch((e) => {
          pending--;
          process.stderr.write('[mcp] handler error: ' + (e as Error).message + '\n');
        })
        .finally(maybeExit);
    }
  });
  process.stdin.on('end', () => {
    ended = true;
    maybeExit();
  });
}

// Auto-start when invoked directly: `node dist/mcp/server.js` (or via the MCP test harness).
// Using pathToFileURL is the only reliable way to compare on Windows where process.argv[1] has backslashes + spaces.
import { pathToFileURL } from 'node:url';
const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) startMcpServer();
