/**
 * runner.mjs - pure helpers for model-backed skill evaluation runs.
 *
 * The default harness still executes deterministic CLI steps. These helpers
 * add a command-backed runner for Codex, Claude Code, or any other agent CLI
 * without putting vendor-specific logic into the scoring code.
 */

export const AGENT_RUNNER_PRESETS = {
  codex: 'codex exec --json --full-auto --cd "{cwd}" "{prompt}"',
  'claude-code': 'claude -p "{prompt}" --output-format json --permission-mode acceptEdits',
};

function escapeDoubleQuotes(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function renderAgentCommand(template, values) {
  return String(template).replace(
    /\{(cwd|prompt|prompt_file|scenario_id|variant)\}/g,
    (match, key) => {
      const value = values[key];
      return value == null ? match : escapeDoubleQuotes(value);
    },
  );
}

export function resolveAgentCommand({ preset, command }) {
  if (command) return command;
  if (preset && AGENT_RUNNER_PRESETS[preset]) return AGENT_RUNNER_PRESETS[preset];
  if (preset) {
    throw new Error(
      `unknown runner preset "${preset}"; expected ${Object.keys(AGENT_RUNNER_PRESETS).join(', ')}`,
    );
  }
  return null;
}

export function buildEvalPrompt(scenario, variant = 'harness') {
  const brief = scenario.agent_prompt ?? scenario.brief ?? scenario.title ?? scenario.id;
  if (variant === 'control') {
    return [
      brief,
      '',
      'Work independently in the current repository.',
      'Do not assume any external workflow or helper is available.',
      'Finish the requested work in the repository before responding.',
    ].join('\n');
  }
  return [
    brief,
    '',
    'You are evaluated as an agent using the hackathon-run harness.',
    'Use the available hackathon-run skills and CLI when they improve the result.',
    'Leave machine-readable state and evidence in .hackathon/state when the workflow calls for it.',
    'Verify the demo path before declaring completion.',
  ].join('\n');
}

function findUsage(value) {
  if (!value || typeof value !== 'object') return null;
  const record = value;
  const input =
    record.input_tokens ?? record.prompt_tokens ?? record.inputTokens ?? record.promptTokens;
  const output =
    record.output_tokens ?? record.completion_tokens ?? record.outputTokens ?? record.completionTokens;
  const total = record.total_tokens ?? record.totalTokens;
  const cost = record.cost_usd ?? record.total_cost_usd ?? record.costUsd;
  if (input != null || output != null || total != null || cost != null) {
    return {
      input_tokens: Number(input ?? 0) || 0,
      output_tokens: Number(output ?? 0) || 0,
      total_tokens: Number(total ?? 0) || (Number(input ?? 0) || 0) + (Number(output ?? 0) || 0),
      cost_usd: Number(cost ?? 0) || 0,
    };
  }
  for (const child of Object.values(record)) {
    const found = findUsage(child);
    if (found) return found;
  }
  return null;
}

export function extractUsage(stdout) {
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const usage = findUsage(JSON.parse(trimmed));
      if (usage) return usage;
    } catch {
      // Ignore non-JSON progress lines emitted by an agent CLI.
    }
  }
  return { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 };
}

export function summarizeRuns(results, variant) {
  const selected = results.filter((result) => result.variant === variant);
  const byScenario = new Map();
  for (const result of selected) {
    const current = byScenario.get(result.id) ?? [];
    current.push(result);
    byScenario.set(result.id, current);
  }
  const scenarioRuns = [...byScenario.values()];
  const runRates = scenarioRuns.map(
    (runs) => runs.filter((run) => run.samplePassed).length / Math.max(1, runs.length),
  );
  const mean = runRates.reduce((sum, value) => sum + value, 0) / Math.max(1, runRates.length);
  const variance =
    runRates.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    Math.max(1, runRates.length);
  const stddev = Math.sqrt(variance);
  const confidenceInterval =
    runRates.length > 1 ? (1.96 * stddev) / Math.sqrt(runRates.length) : null;
  const passAtK =
    selected.length > 0
      ? Math.round(
          (runRates.reduce((sum, rate, index) => {
            const runs = scenarioRuns[index]?.length ?? 1;
            return sum + (1 - Math.pow(1 - rate, runs));
          }, 0) /
            Math.max(1, runRates.length)) *
            1000,
        ) / 10
      : null;
  const usage = selected.reduce(
    (sum, result) => {
      const stepUsage = result.usage ?? {};
      sum.input_tokens += Number(stepUsage.input_tokens ?? 0);
      sum.output_tokens += Number(stepUsage.output_tokens ?? 0);
      sum.total_tokens += Number(stepUsage.total_tokens ?? 0);
      sum.cost_usd += Number(stepUsage.cost_usd ?? 0);
      return sum;
    },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 },
  );
  return {
    scenarios: byScenario.size,
    runs: selected.length,
    sample_pass_rate: Math.round(mean * 1000) / 10,
    pass_at_k: passAtK,
    run_stddev: Math.round(stddev * 1000) / 10,
    confidence_interval_95:
      confidenceInterval == null ? null : Math.round(confidenceInterval * 1000) / 10,
    reliability: Math.round(Math.max(0, 1 - stddev) * 1000) / 10,
    usage,
  };
}

export function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}
