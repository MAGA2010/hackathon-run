/**
 * index.ts — public API of the Hackathon Run library.
 *
 * Most users will interact via the CLI. This module exists for
 * programmatic embedding (e.g., an MCP server, a web UI, or a test
 * harness).
 */

export * from './harness/types.js';
export { loadAllSkills, loadSkill, findSkillDirs } from './harness/loader.js';
export { parseFrontmatter, enforceTriggerBudget, TRIGGER_BUDGET } from './harness/frontmatter.js';
export { matchSkill } from './harness/trigger.js';
export { readState, writeState } from './harness/state.js';
export {
  defaultSession,
  readSession,
  writeSession,
  updateSession,
  sessionPath,
} from './harness/session.js';
export {
  defaultSprint,
  readSprint,
  writeSprint,
  updateSprint,
  sprintFromPlan,
  nextUnpassedFeature,
  enforceSprintBudget,
} from './harness/sprint.js';
export { appendTrace, readTraces, traceStats, traceFile, traceEnabled } from './harness/trace.js';
