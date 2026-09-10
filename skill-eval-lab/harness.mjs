#!/usr/bin/env node
/**
 * harness.mjs - repeatable evaluation lab for hackathon-run.
 *
 * Usage:
 *   node skill-eval-lab/harness.mjs \
 *     --scenarios skill-eval-lab/scenarios \
 *     --out skill-eval-lab/results \
 *     --judge skill-eval-lab/judge.json
 *
 * With --skip-runs, it reads an existing aggregate and only finalizes
 * the report (useful after filling in judge.json).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEvalPrompt,
  extractUsage,
  percentile,
  renderAgentCommand,
  resolveAgentCommand,
  summarizeRuns,
} from './runner.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, '..');
const nodePath = process.execPath;
const cliPath = resolve(argValue('--cli', join(skillRoot, 'dist', 'cli', 'index.js')));
const noStatic = process.argv.includes('--no-static');
const skillLabel = argValue('--skill-label', 'hackathon-run');
const packageVersion = JSON.parse(readFileSync(join(skillRoot, 'package.json'), 'utf8')).version;
const skillVersion = argValue('--skill-version', packageVersion);
const staticDir = argValue('--static-dir', null);

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const scenariosDir = resolve(argValue('--scenarios', join(here, 'scenarios')));
const outRoot = resolve(argValue('--out', join(here, 'results')));
const runs = Number(argValue('--runs', '1'));
const judgePath = argValue('--judge', null);
const minGrade = argValue('--min-grade', null);
const failOnP1 = process.argv.includes('--fail-on-p1');
const skipRuns = process.argv.includes('--skip-runs');
const abMode = process.argv.includes('--ab');
const runnerMode = argValue('--runner', 'steps');
const runnerPreset = argValue('--runner-preset', null);
const agentCommand = resolveAgentCommand({
  preset: runnerPreset,
  command: argValue('--agent-command', process.env.HACKATHON_EVAL_AGENT_COMMAND ?? null),
});
const controlCommand =
  argValue('--control-command', process.env.HACKATHON_EVAL_CONTROL_COMMAND ?? null) ?? agentCommand;
const baselinePath = argValue('--baseline', null);
const minDelta = Number(argValue('--min-delta', '0'));
const aggregatePath = resolve(argValue('--aggregate', join(outRoot, 'runs', 'aggregate.json')));

if (!['steps', 'command'].includes(runnerMode)) {
  throw new Error(`unsupported --runner ${runnerMode}; expected steps or command`);
}
if (runnerMode === 'command' && !agentCommand) {
  throw new Error('--runner command requires --agent-command or --runner-preset');
}
if (abMode && (!agentCommand || !controlCommand)) {
  throw new Error('--ab requires both --agent-command and --control-command');
}

function pythonPath() {
  if (process.env.PYTHON) return process.env.PYTHON;
  for (const candidate of ['python3', 'python']) {
    const r = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return candidate;
  }
  throw new Error(
    'Python not found. Set PYTHON to the python executable before running the harness.',
  );
}

const py = skipRuns ? null : pythonPath();

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function replaceTokens(value, cwd) {
  return String(value).replaceAll('{cwd}', cwd).replaceAll('{skillRoot}', skillRoot);
}

function runCommand(command, cwd) {
  const started = Date.now();
  const env = {
    ...process.env,
    PATH: [dirname(nodePath), process.env.PATH].join(';'),
    AI_TIME_RUN_DIST: dirname(cliPath),
  };
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180000,
  });
  return {
    exit_code: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    duration_ms: Date.now() - started,
  };
}

function runStep(step, cwd) {
  if (step.kind === 'write') {
    const file = join(cwd, replaceTokens(step.file, cwd));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, step.content, 'utf8');
    return {
      id: step.id,
      kind: 'write',
      exit_code: 0,
      duration_ms: 0,
      stdout: `wrote ${file}`,
      stderr: '',
      expected_exit: step.expect_exit ?? 0,
    };
  }

  let command;
  if (step.kind === 'cli') {
    command = [nodePath, cliPath, ...step.args.map((a) => replaceTokens(a, cwd))];
  } else if (step.kind === 'node') {
    command = [
      nodePath,
      join(cwd, replaceTokens(step.script, cwd)),
      ...step.args.map((a) => replaceTokens(a, cwd)),
    ];
  } else if (step.kind === 'python') {
    command = [py, join(skillRoot, step.script), ...step.args.map((a) => replaceTokens(a, cwd))];
  } else {
    command = step.args.map((a) => replaceTokens(a, cwd));
  }

  const result = runCommand(command, cwd);
  if (step.capture) {
    const target = join(cwd, replaceTokens(step.capture, cwd));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, result.stdout, 'utf8');
  }
  return {
    id: step.id,
    kind: step.kind,
    command: command.join(' '),
    ...result,
    expected_exit: step.expect_exit ?? 0,
  };
}

function runShellCommand(command, cwd) {
  const started = Date.now();
  const result = spawnSync(command, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: Number(process.env.HACKATHON_EVAL_TIMEOUT_MS ?? 600000),
    shell: true,
  });
  return {
    exit_code: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    duration_ms: Date.now() - started,
  };
}

function runAgentStep(scenario, cwd, variant) {
  const prompt = buildEvalPrompt(scenario, variant);
  const promptFile = join(cwd, '.hackathon-eval-prompt.txt');
  writeFileSync(promptFile, prompt, 'utf8');
  const template = variant === 'control' ? controlCommand : agentCommand;
  const command = renderAgentCommand(template, {
    cwd,
    prompt,
    prompt_file: promptFile,
    scenario_id: scenario.id,
    variant,
  });
  const result = runShellCommand(command, cwd);
  try {
    unlinkSync(promptFile);
  } catch {
    // The agent may have removed or replaced its own prompt file.
  }
  return {
    id: `agent-${variant}`,
    kind: 'agent',
    command,
    prompt,
    ...result,
    usage: extractUsage(result.stdout),
    expected_exit: 0,
  };
}

function getByPath(data, path) {
  if (!path) return data;
  return path.split('.').reduce((acc, part) => {
    if (acc == null) return undefined;
    if (/^\d+$/.test(part)) return acc[Number(part)];
    return acc[part];
  }, data);
}

function checkJson(file, check, cwd) {
  const data = readJson(join(cwd, file));
  if (!data) return { ok: false, reason: `cannot parse ${file}` };
  const actual = getByPath(data, check.path);
  const value = check.value;
  switch (check.op) {
    case 'equals':
      return { ok: actual === value, actual };
    case 'not_equals':
      return { ok: actual != null && actual !== value, actual };
    case 'is_true':
      return { ok: actual === true, actual };
    case 'is_false':
      return { ok: actual === false, actual };
    case 'is_null':
      return { ok: actual === null, actual };
    case 'gte':
      return { ok: Number(actual) >= Number(value), actual };
    case 'lte':
      return { ok: Number(actual) <= Number(value), actual };
    case 'gt':
      return { ok: Number(actual) > Number(value), actual };
    case 'lt':
      return { ok: Number(actual) < Number(value), actual };
    case 'contains':
      return { ok: String(actual).includes(String(value)), actual };
    case 'not_contains':
      return { ok: !String(actual).includes(String(value)), actual };
    case 'length_gte':
      return { ok: Array.isArray(actual) && actual.length >= Number(value), actual };
    case 'length_lte':
      return { ok: Array.isArray(actual) && actual.length <= Number(value), actual };
    case 'each_has_fields': {
      const ok = Array.isArray(actual)
        ? actual.every((item) => value.every((field) => Object.hasOwn(item, field)))
        : actual != null && value.every((field) => Object.hasOwn(actual, field));
      return { ok, actual: actual?.length };
    }
    case 'object_true_count_gte': {
      const count =
        actual != null && typeof actual === 'object'
          ? Object.values(actual).filter(Boolean).length
          : 0;
      return { ok: count >= Number(value), actual: count };
    }
    case 'some_where': {
      const ok =
        Array.isArray(actual) &&
        actual.some((item) =>
          Object.entries(value).every(([key, expected]) => item[key] === expected),
        );
      return { ok, actual };
    }
    case 'sum_field_lte': {
      const sum = Array.isArray(actual)
        ? actual.reduce((acc, item) => acc + Number(item[check.field] ?? 0), 0)
        : 0;
      return { ok: sum <= Number(value), actual: sum };
    }
    default:
      return { ok: false, reason: `unsupported op ${check.op}` };
  }
}

function checkText(file, check, cwd) {
  const target = join(cwd, file);
  if (!existsSync(target)) return { ok: false, reason: `missing ${file}` };
  const text = readFileSync(target, 'utf8');
  switch (check.op) {
    case 'contains':
      return { ok: text.includes(String(check.value)) };
    case 'not_contains':
      return { ok: !text.includes(String(check.value)) };
    case 'regex':
      return { ok: new RegExp(check.value).test(text) };
    default:
      return { ok: false, reason: `unsupported text op ${check.op}` };
  }
}

function checkLedger(file, check, cwd) {
  const target = join(cwd, file);
  if (!existsSync(target)) return { ok: false, reason: `missing ${file}` };
  const lines = readFileSync(target, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  let events;
  try {
    events = lines.map((line) => JSON.parse(line));
  } catch (e) {
    return { ok: false, reason: `invalid JSONL: ${e.message}` };
  }
  switch (check.op) {
    case 'event_count_gte':
      return { ok: events.length >= Number(check.value), actual: events.length };
    case 'has_event_type':
      return { ok: events.some((e) => e.type === check.value) };
    case 'no_event_type':
      return { ok: !events.some((e) => e.type === check.value) };
    case 'has_event_scope':
      return {
        ok: events.some((e) => e.type === check.event_type && e.payload?.scope === check.value),
      };
    case 'no_event_scope':
      return {
        ok: !events.some((e) => e.type === check.event_type && e.payload?.scope === check.value),
      };
    case 'all_passes_have_evidence':
      return {
        ok: events
          .filter((e) => e.type === 'feature.updated' && e.payload?.passes === true)
          .every((e) => Boolean(e.payload?.evidenceEventId)),
      };
    case 'all_events_parse':
      return { ok: true };
    default:
      return { ok: false, reason: `unsupported ledger op ${check.op}` };
  }
}

function runAssertions(scenario, cwd, steps) {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const results = [];
  for (const check of scenario.assertions) {
    let outcome;
    if (check.type === 'json_valid') {
      outcome = { ok: readJson(join(cwd, check.file)) !== null };
    } else if (check.type === 'file_exists') {
      outcome = { ok: existsSync(join(cwd, check.file)) };
    } else if (check.type === 'file_absent') {
      outcome = { ok: !existsSync(join(cwd, check.file)) };
    } else if (check.type === 'json') {
      outcome = checkJson(check.file, check, cwd);
    } else if (check.type === 'text') {
      outcome = checkText(check.file, check, cwd);
    } else if (check.type === 'ledger') {
      outcome = checkLedger(check.file, check, cwd);
    } else if (check.type === 'cli_result') {
      const step = stepById.get(check.step);
      outcome = {
        ok: step?.exit_code === check.value,
        actual: step?.exit_code,
      };
    } else {
      outcome = { ok: false, reason: `unsupported assertion type ${check.type}` };
    }
    results.push({
      id: check.id,
      description: check.description,
      critical: check.critical === true,
      severity: check.severity ?? 'P3',
      ...outcome,
    });
  }
  return results;
}

function stateFiles(cwd, stateDir) {
  if (!existsSync(stateDir)) return {};
  const out = {};
  for (const name of readdirSync(stateDir)) {
    if (name.endsWith('.jsonl')) {
      const raw = readFileSync(join(stateDir, name), 'utf8');
      const lines = raw.split(/\r?\n/).filter((line) => line.trim());
      out[name] = lines.every((line) => JSON.parse(line)) ? lines.length : null;
    } else if (name.endsWith('.json')) {
      out[name] = readJson(join(stateDir, name));
    }
  }
  return out;
}

function scenarioScore(assertionResults) {
  const total = assertionResults.length;
  const passed = assertionResults.filter((a) => a.ok).length;
  const criticalFailures = assertionResults.filter((a) => !a.ok && a.critical).length;
  const samplePassed = assertionResults.every((a) => a.ok);
  const passRate = total ? Math.round((passed / total) * 100) : 0;
  const executionScore = criticalFailures ? Math.min(passRate, 70) : passRate;
  return {
    passed,
    total,
    passRate,
    executionScore,
    criticalFailures,
    samplePassed,
  };
}

async function runScenario(scenario, run, outDir, variant = 'steps') {
  const variantDir = variant === 'steps' ? 'steps' : variant;
  const cwd = join(outDir, 'runs', scenario.id, `run-${run}`, variantDir);
  const resolvedCwd = resolve(cwd);
  if (!resolvedCwd.startsWith(resolve(outDir) + sep)) {
    throw new Error(`refusing to clean outside out dir: ${resolvedCwd}`);
  }
  rmSync(resolvedCwd, { recursive: true, force: true });
  mkdirSync(cwd, { recursive: true });
  for (const [file, content] of Object.entries(scenario.project.files ?? {})) {
    const target = join(cwd, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }

  const steps = [];
  const started = Date.now();
  if (runnerMode === 'command') {
    steps.push(runAgentStep(scenario, cwd, variant));
  } else {
    for (const step of scenario.steps) {
      const result = runStep(step, cwd);
      steps.push(result);
    }
  }
  const durationMs = Date.now() - started;
  const assertions = runAssertions(scenario, cwd, steps);
  const score = scenarioScore(assertions);
  const usage = steps.reduce(
    (sum, step) => {
      const stepUsage = step.usage ?? {};
      sum.input_tokens += Number(stepUsage.input_tokens ?? 0);
      sum.output_tokens += Number(stepUsage.output_tokens ?? 0);
      sum.total_tokens += Number(stepUsage.total_tokens ?? 0);
      sum.cost_usd += Number(stepUsage.cost_usd ?? 0);
      return sum;
    },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 },
  );
  return {
    id: scenario.id,
    title: scenario.title,
    run,
    variant,
    cwd,
    steps,
    assertions,
    duration_ms: durationMs,
    usage,
    ...score,
    state: stateFiles(cwd, join(cwd, scenario.state_dir ?? join('.hackathon', 'state'))),
  };
}

function validateSkills() {
  if (noStatic) {
    if (!staticDir) return [];
    const results = [];
    const skillMd = join(staticDir, 'SKILL.md');
    results.push({
      name: 'SKILL.md-frontmatter',
      ok:
        existsSync(skillMd) &&
        /^name:\s*ai-time-run/m.test(readFileSync(skillMd, 'utf8')) &&
        /^description:/m.test(readFileSync(skillMd, 'utf8')),
    });
    const pkg = join(staticDir, 'package.json');
    results.push({
      name: 'package-test-script',
      ok: existsSync(pkg) && /"test"\s*:/.test(readFileSync(pkg, 'utf8')),
    });
    results.push({
      name: 'readme-exists',
      ok: existsSync(join(staticDir, 'README.md')),
    });
    results.push({
      name: 'openai-evals-doc',
      ok: existsSync(join(staticDir, 'docs', '10-openai-evals.md')),
    });
    return results;
  }
  const results = [];
  const skillsDir = join(skillRoot, 'skills');
  for (const name of readdirSync(skillsDir)) {
    const dir = join(skillsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, 'SKILL.md'))) continue;
    const r = runCommand([nodePath, cliPath, 'validate-skill', dir], skillRoot);
    results.push({
      name,
      ok: r.exit_code === 0,
      exit_code: r.exit_code,
      tail: r.stdout.slice(-400),
    });
  }
  return results;
}

function aggregateStatic(results, scenarioResults) {
  const staticPass =
    results.length === 0 ? 100 : (results.filter((r) => r.ok).length / results.length) * 100;
  const s5 = scenarioResults.find((s) => s.id === 's5-adversarial-boundary');
  const dispatchChecks = (s5?.assertions ?? []).filter(
    (a) => a.id.startsWith('match-') || a.id === 'no-false-positive',
  );
  const dispatchPass =
    dispatchChecks.length === 0
      ? 100
      : (dispatchChecks.filter((a) => a.ok).length / dispatchChecks.length) * 100;
  return { staticPass, dispatchPass, skillChecks: results };
}

function computeFinal(aggregate, judge) {
  const contract = 0.5 * aggregate.contract.staticPass + 0.5 * aggregate.contract.dispatchPass;
  const execution = aggregate.executionScore;
  const quality = judge ? aggregate.quality.score : null;
  const robustness = aggregate.robustnessScore;
  const efficiency = aggregate.efficiencyScore;
  const overall =
    quality == null
      ? null
      : Math.round(
          (0.2 * contract +
            0.3 * execution +
            0.25 * quality +
            0.15 * robustness +
            0.1 * efficiency) *
            10,
        ) / 10;
  const grade =
    overall == null
      ? 'PENDING'
      : overall >= 90
        ? 'A'
        : overall >= 80
          ? 'B'
          : overall >= 70
            ? 'C'
            : overall >= 60
              ? 'D'
              : 'F';
  const hasP1 = (aggregate.failures ?? []).some((f) => f.severity === 'P1');
  const cappedGrade = hasP1 && grade === 'A' ? 'B' : grade;
  return {
    contract,
    execution,
    quality,
    robustness,
    efficiency,
    overall,
    grade: cappedGrade,
    grade_cap: hasP1 && grade === 'A' ? 'capped to B due to P1 findings' : null,
  };
}

const GRADE_RANK = { F: 0, D: 1, C: 2, B: 3, A: 4 };

function evaluateGate(final, failuresList, minimumGrade, requireNoP1) {
  const normalizedMinimum = minimumGrade ? String(minimumGrade).toUpperCase() : null;
  if (normalizedMinimum && !(normalizedMinimum in GRADE_RANK)) {
    throw new Error(`unsupported --min-grade ${minimumGrade}; expected A, B, C, D, or F`);
  }
  const grade = final.grade;
  const criticalFailures = failuresList.filter((failure) => failure.critical).length;
  const p1Failures = failuresList.filter((failure) => failure.severity === 'P1').length;
  const gradeOk =
    normalizedMinimum == null ||
    (grade in GRADE_RANK && GRADE_RANK[grade] >= GRADE_RANK[normalizedMinimum]);
  const criticalOk = criticalFailures === 0;
  const p1Ok = !requireNoP1 || p1Failures === 0;
  return {
    ok: gradeOk && criticalOk && p1Ok,
    minimum_grade: normalizedMinimum,
    grade,
    critical_failures: criticalFailures,
    p1_failures: p1Failures,
  };
}

function reportGate(gate) {
  if (gate.minimum_grade) {
    console.log(
      `gate: grade>=${gate.minimum_grade} critical=${gate.critical_failures} p1=${gate.p1_failures} -> ${gate.ok ? 'PASS' : 'FAIL'}`,
    );
  }
  if (!gate.ok) process.exitCode = 1;
}

function loadJudge() {
  if (!judgePath) return null;
  const judge = readJson(resolve(judgePath));
  if (!judge || !judge.scores) return null;
  const all = Object.values(judge.scores).flatMap((s) => [
    s.goal_alignment,
    s.specificity,
    s.actionability,
    s.risk_awareness,
    s.consistency,
  ]);
  const avg = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  return {
    source: judge.source ?? 'expert-rubric',
    average_1_5: Math.round(avg * 100) / 100,
    score: Math.round(avg * 20),
    entries: judge.scores,
  };
}

function failures(scenarioResults) {
  const out = [];
  const seen = new Set();
  for (const s of scenarioResults) {
    for (const a of s.assertions) {
      if (!a.ok) {
        const key = `${s.id}:${a.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          scenario: s.id,
          assertion: a.id,
          description: a.description,
          critical: a.critical,
          severity: a.severity,
          reason: a.reason ?? `actual=${JSON.stringify(a.actual)}`,
        });
      }
    }
  }
  return out;
}

function reportMarkdown(aggregate, final, judge, scenarioResults, failuresList) {
  const lines = [];
  const label = aggregate.meta.skill_label ?? 'Hackathon Run';
  lines.push(`# ${label} Skill Evaluation Report`);
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Skill under test: ${label} v${aggregate.meta.skill_version ?? '?'}`);
  lines.push(`- Runs per scenario: ${aggregate.meta.runs}`);
  lines.push(`- Judge: ${judge ? judge.source : 'not provided'}`);
  lines.push('');
  lines.push('## Final Score');
  lines.push('');
  lines.push(`| Dimension | Score | Weight |`);
  lines.push(`| --- | --- | --- |`);
  const rows = [
    ['Contract & Dispatch', final.contract, 20],
    ['Execution & State (pass@1)', final.execution, 30],
    ['Output Quality', final.quality, 25],
    ['Robustness', final.robustness, 15],
    ['Efficiency & Reproducibility', final.efficiency, 10],
  ];
  for (const [name, score, weight] of rows) {
    lines.push(`| ${name} | ${score == null ? 'N/A' : score} | ${weight}% |`);
  }
  lines.push(`| **Overall** | **${final.overall}** | **100%** |`);
  lines.push(
    `| **Grade** | **${final.grade}${final.grade_cap ? ` (${final.grade_cap})` : ''}** | |`,
  );
  if (aggregate.pass_at_k != null) {
    lines.push(`| **Pass@${aggregate.meta.runs}** | **${aggregate.pass_at_k}%** | |`);
  }
  const primaryStability =
    aggregate.stability?.[aggregate.meta.primary_variant ?? aggregate.meta.variants?.[0]] ?? null;
  if (aggregate.meta.runner === 'command') {
    lines.push(`| **Runner** | **${aggregate.meta.runner_preset ?? 'command'}** | |`);
  }
  if (primaryStability) {
    lines.push(`| **Run stddev** | **${primaryStability.run_stddev}%** | |`);
    lines.push(`| **Reliability** | **${primaryStability.reliability}%** | |`);
    lines.push(`| **Total tokens** | **${aggregate.usage?.total_tokens ?? 0}** | |`);
    lines.push(`| **Cost** | **$${Number(aggregate.usage?.cost_usd ?? 0).toFixed(4)}** | |`);
  }
  if (aggregate.experiment) {
    lines.push(
      `| **Harness delta** | **${aggregate.experiment.delta_sample_pass_rate >= 0 ? '+' : ''}${aggregate.experiment.delta_sample_pass_rate}%** | |`,
    );
  }
  lines.push('');
  lines.push('## Scenario Results');
  lines.push('');
  lines.push(`| Scenario | Variant | Sample | Criteria Pass Rate | Critical Failures | Duration |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  const byScenario = new Map();
  for (const s of scenarioResults) {
    const key = `${s.id}:${s.variant}`;
    if (!byScenario.has(key)) byScenario.set(key, []);
    byScenario.get(key).push(s);
  }
  for (const runsForScenario of byScenario.values()) {
    const first = runsForScenario.find((s) => s.run === 1) ?? runsForScenario[0];
    const criteriaAvg = Math.round(
      runsForScenario.reduce((a, s) => a + s.passRate, 0) / Math.max(1, runsForScenario.length),
    );
    const passCount = runsForScenario.filter((s) => s.samplePassed).length;
    const maxDuration = Math.max(...runsForScenario.map((s) => s.duration_ms));
    lines.push(
      `| ${first.id} | ${first.variant} | ${first.samplePassed ? 'PASS' : 'FAIL'} | ${criteriaAvg}% (${passCount}/${runsForScenario.length} runs) | ${Math.max(...runsForScenario.map((s) => s.criticalFailures))} | ${Math.round(maxDuration / 100) / 10}s |`,
    );
  }
  lines.push('');
  lines.push('## Static Skill Validation');
  lines.push('');
  if (aggregate.contract.skillChecks.length > 0) {
    lines.push(
      `Valid SKILL.md files: ${aggregate.contract.skillChecks.filter((s) => s.ok).length}/${aggregate.contract.skillChecks.length}`,
    );
  } else {
    lines.push('Static skill validation skipped (--no-static).');
  }
  lines.push('');
  if (aggregate.test_suite) {
    lines.push('## Own Test Suite');
    lines.push('');
    lines.push('| Suite | Pass | Fail |');
    lines.push('| --- | --- | --- |');
    for (const [name, stats] of Object.entries(aggregate.test_suite)) {
      lines.push(`| ${name} | ${stats.pass} | ${stats.fail} |`);
    }
    lines.push('');
  }
  lines.push('## Findings');
  lines.push('');
  if (failuresList.length === 0) {
    lines.push('No failing assertions.');
  } else {
    for (const f of failuresList) {
      const severity = { P1: 'HIGH', P2: 'MEDIUM', P3: 'MINOR' }[f.severity] ?? 'MINOR';
      const reason =
        typeof f.reason === 'string' && f.reason.length > 220
          ? f.reason.slice(0, 220) + '...'
          : f.reason;
      lines.push(`- **[${severity}] ${f.scenario}: ${f.description}** - ${reason}`);
    }
  }
  lines.push('');
  lines.push('## Method Note');
  lines.push('');
  lines.push(
    'Scoring follows OpenAI Evals semantics: every grader returns a score in [0,1], a sample passes only when all criteria pass, and pass@1 is the run-level score. Deterministic checks use threshold 1.0; model/rubric graders use 0.7-0.8. Trace and state files are graded together, not just the final text.',
  );
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  const recommendations = aggregate.recommendations ?? [];
  if (recommendations.length === 0) {
    lines.push('No recommendations provided.');
  } else {
    recommendations.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
  }
  return lines.join('\n') + '\n';
}

function compareBaseline(final, path, requiredDelta) {
  if (!path) return null;
  const baseline = readJson(resolve(path));
  if (!baseline) throw new Error(`baseline file not found or invalid: ${path}`);
  const baselineOverall =
    baseline.final?.overall ?? baseline.overall ?? baseline.executionScore ?? null;
  if (baselineOverall == null) {
    throw new Error(`baseline file has no comparable overall score: ${path}`);
  }
  const delta = Math.round((final.overall - Number(baselineOverall)) * 10) / 10;
  return {
    path: resolve(path),
    baseline_overall: Number(baselineOverall),
    overall_delta: delta,
    required_delta: requiredDelta,
    ok: delta >= requiredDelta,
  };
}

async function main() {
  mkdirSync(outRoot, { recursive: true });
  const scenarios = readdirSync(scenariosDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson(join(scenariosDir, f)));

  if (skipRuns) {
    const aggregate = readJson(aggregatePath);
    if (!aggregate) {
      console.error(`aggregate not found: ${aggregatePath}`);
      process.exit(1);
    }
    const judge = loadJudge();
    aggregate.test_suite = readJson(join(outRoot, 'test-suite.json')) ?? null;
    aggregate.recommendations = readJson(join(outRoot, 'recommendations.json'))?.items ?? [];
    const seen = new Set();
    aggregate.failures = (aggregate.failures ?? []).filter((f) => {
      const key = `${f.scenario}:${f.assertion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (judge) aggregate.quality = judge;
    const final = computeFinal(aggregate, judge);
    const baseline = compareBaseline(final, baselinePath, minDelta);
    const report = reportMarkdown(aggregate, final, judge, aggregate.scenarios, aggregate.failures);
    const reportPath = join(outRoot, 'report.md');
    writeFileSync(reportPath, report, 'utf8');
    const finalAggregate = { ...aggregate, final, baseline, report_path: reportPath };
    writeJson(join(outRoot, 'final.json'), finalAggregate);
    const gate = evaluateGate(final, aggregate.failures, minGrade, failOnP1);
    if (baseline && !baseline.ok) {
      gate.ok = false;
      gate.baseline_ok = false;
    }
    finalAggregate.gate = gate;
    writeJson(join(outRoot, 'final.json'), finalAggregate);
    console.log(`wrote ${reportPath}`);
    reportGate(gate);
    return;
  }

  const variants = abMode
    ? ['control', 'harness']
    : runnerMode === 'command'
      ? ['harness']
      : ['steps'];
  const primaryVariant = abMode ? 'harness' : variants[0];
  const scenarioResults = [];
  const allSteps = [];
  for (const scenario of scenarios) {
    for (let run = 1; run <= runs; run++) {
      for (const variant of variants) {
        const result = await runScenario(scenario, run, outRoot, variant);
        scenarioResults.push(result);
        allSteps.push(...result.steps);
      }
    }
  }

  const skillChecks = validateSkills();
  const contract = aggregateStatic(skillChecks, scenarioResults);
  const primaryResults = scenarioResults.filter((s) => s.variant === primaryVariant);
  const firstRunResults = primaryResults.filter((s) => s.run === 1);
  const samplePassRate =
    firstRunResults.filter((s) => s.samplePassed).length / Math.max(1, firstRunResults.length);
  const stabilityByVariant = Object.fromEntries(
    variants.map((variant) => [variant, summarizeRuns(scenarioResults, variant)]),
  );
  const stability = stabilityByVariant[primaryVariant];
  const passAtK = stability?.pass_at_k ?? null;
  const criteriaPassRate =
    primaryResults.reduce((a, s) => a + s.passRate, 0) / Math.max(1, primaryResults.length);
  const executionScore = Math.round(samplePassRate * 100);

  const robustnessIds = new Set([
    's5-adversarial-boundary',
    's4-tamper-detection',
    's6-boundary',
    's3-failure-attribution',
  ]);
  const robustnessChecks = primaryResults
    .filter((s) => robustnessIds.has(s.id))
    .flatMap((s) => s.assertions);
  const robustnessScore =
    robustnessChecks.length > 0
      ? (robustnessChecks.filter((a) => a.ok).length / robustnessChecks.length) * 100
      : 0;

  const allDurationMs = allSteps.reduce((a, s) => a + (s.duration_ms ?? 0), 0);
  const avgSeconds = allDurationMs / Math.max(1, allSteps.length) / 1000;
  const durationScore = Math.max(
    30,
    Math.min(100, Math.round(100 - Math.max(0, avgSeconds - 1) * 5)),
  );
  const stateFilesParsed = primaryResults.reduce(
    (a, s) => a + Object.values(s.state).filter((v) => v !== null).length,
    0,
  );
  const stateFilesTotal = primaryResults.reduce((a, s) => a + Object.keys(s.state).length, 0);
  const machineReadableScore =
    stateFilesTotal > 0 ? Math.round((stateFilesParsed / stateFilesTotal) * 100) : 0;
  const reproducibilityScore =
    runs > 1 && stability
      ? Math.round(80 + Math.max(0, stability.reliability) * 0.15)
      : runs > 1
        ? 90
        : 80;
  const latencies = allSteps
    .map((step) => Number(step.duration_ms ?? 0))
    .filter((value) => value >= 0);
  const efficiencyScore = Math.round(
    0.4 * durationScore + 0.4 * machineReadableScore + 0.2 * reproducibilityScore,
  );
  const usage = stability?.usage ?? {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
  };

  const aggregate = {
    meta: {
      generated_at: new Date().toISOString(),
      skill_root: skillRoot,
      skill_label: skillLabel,
      skill_version: skillVersion,
      scenarios: scenarios.length,
      runs,
      runner: runnerMode,
      runner_preset: runnerPreset,
      mode: abMode ? 'ab' : 'single',
      variants,
      primary_variant: primaryVariant,
      python: py,
      node: nodePath,
    },
    contract,
    criteriaPassRate: Math.round(criteriaPassRate * 10) / 10,
    executionScore,
    pass_at_1: executionScore,
    pass_at_k: passAtK,
    stability: stabilityByVariant,
    usage,
    latency_ms: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      total: latencies.reduce((sum, value) => sum + value, 0),
    },
    experiment: abMode
      ? {
          primary: primaryVariant,
          baseline: 'control',
          delta_sample_pass_rate:
            Math.round(
              ((stabilityByVariant.harness?.sample_pass_rate ?? 0) -
                (stabilityByVariant.control?.sample_pass_rate ?? 0)) *
                10,
            ) / 10,
        }
      : null,
    robustnessScore: Math.round(robustnessScore * 10) / 10,
    efficiencyScore,
    scenarios: scenarioResults,
    failures: failures(scenarioResults),
  };

  const aggregateOut = join(outRoot, 'runs', 'aggregate.json');
  writeJson(aggregateOut, aggregate);

  const judge = loadJudge();
  if (judge) {
    aggregate.quality = judge;
    const final = computeFinal(aggregate, judge);
    const baseline = compareBaseline(final, baselinePath, minDelta);
    const report = reportMarkdown(aggregate, final, judge, scenarioResults, aggregate.failures);
    const reportPath = join(outRoot, 'report.md');
    writeFileSync(reportPath, report, 'utf8');
    const gate = evaluateGate(final, aggregate.failures, minGrade, failOnP1);
    if (baseline && !baseline.ok) {
      gate.ok = false;
      gate.baseline_ok = false;
    }
    writeJson(join(outRoot, 'final.json'), {
      ...aggregate,
      final,
      baseline,
      gate,
      report_path: reportPath,
    });
    console.log(`wrote ${aggregateOut}`);
    console.log(`wrote ${reportPath}`);
    console.log(`overall=${final.overall} grade=${final.grade}`);
    reportGate(gate);
  } else {
    console.log(`wrote ${aggregateOut}`);
    console.log('No judge.json yet; run with --judge to finalize.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
