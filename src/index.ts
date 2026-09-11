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
export {
  FLOW_STATE_FILES,
  LIFECYCLE_ORDER,
  LIFECYCLE_NEXT_SUGGESTION,
  PIPELINE_SKILLS,
  flowCursor,
  lifecycleForState,
  lifecycleStageNumber,
  lifecycleSummary,
  readLifecycleSnapshot,
  stateFileComplete,
} from './harness/lifecycle.js';
export { requirePython, resolvePython, shellPythonCommand } from './harness/python.js';
export { readState, writeState, stateChecksum } from './harness/state.js';
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
export {
  appendTrace,
  readTraces,
  traceStats,
  traceFile,
  traceEnabled,
  traceEventHash,
  verifyTraceChain,
} from './harness/trace.js';
export { computeWorkspaceDigest } from './harness/workspace.js';
export {
  progressPath,
  progressExists,
  readProgress,
  defaultProgress,
  appendProgress,
  PROGRESS_FILE,
} from './harness/progress.js';
export {
  stopPath,
  steerPath,
  isStopped,
  stopMessage,
  writeStop,
  clearStop,
  writeSteer,
  readSteer,
  guardStatus,
  STOP_FILE,
  STEER_FILE,
} from './harness/guard.js';
