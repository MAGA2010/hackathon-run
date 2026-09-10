import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_RUNNER_PRESETS,
  buildEvalPrompt,
  extractUsage,
  renderAgentCommand,
  resolveAgentCommand,
  summarizeRuns,
} from '../../skill-eval-lab/runner.mjs';

describe('v1.4 agent eval runner', () => {
  it('renders command placeholders for agent CLIs', () => {
    const command = renderAgentCommand('agent --cd "{cwd}" --prompt "{prompt}"', {
      cwd: 'D:\\repo',
      prompt: 'ship "the" demo',
    });
    assert.match(command, /agent --cd "D:\\\\repo"/);
    assert.match(command, /ship \\"the\\" demo/);
  });

  it('resolves presets without hiding an explicit command', () => {
    assert.equal(resolveAgentCommand({ preset: null, command: 'custom' }), 'custom');
    assert.equal(
      resolveAgentCommand({ preset: 'codex', command: null }),
      AGENT_RUNNER_PRESETS.codex,
    );
    assert.throws(
      () => resolveAgentCommand({ preset: 'missing', command: null }),
      /unknown runner preset/,
    );
  });

  it('builds distinct control and harness prompts', () => {
    const scenario = { id: 's1', brief: 'Build a demo.' };
    assert.match(buildEvalPrompt(scenario, 'control'), /Work independently/);
    assert.match(buildEvalPrompt(scenario, 'harness'), /hackathon-run harness/);
  });

  it('extracts token usage and aggregates repeated runs', () => {
    const usage = extractUsage(
      '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":4,"cost_usd":0.02}}',
    );
    assert.equal(usage.total_tokens, 14);
    assert.equal(usage.cost_usd, 0.02);

    const summary = summarizeRuns(
      [
        { id: 's1', variant: 'harness', samplePassed: true, usage },
        { id: 's1', variant: 'harness', samplePassed: false, usage },
        { id: 's1', variant: 'control', samplePassed: false, usage },
      ],
      'harness',
    );
    assert.equal(summary.runs, 2);
    assert.equal(summary.sample_pass_rate, 50);
    assert.equal(summary.run_stddev, 0);
    assert.equal(summary.usage.total_tokens, 28);
  });
});
