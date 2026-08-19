/**
 * server.ts — minimal Model Context Protocol (MCP) server that exposes the
 * Hackathon Surgeon harness to any MCP-compatible agent (Codex, Claude Code,
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

import { loadAllSkills } from '../harness/loader.js';
import { matchSkill } from '../harness/trigger.js';
import { status } from '../cli/commands/status.js';

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
];

function toolCall(name: string, args: Record<string, unknown>): unknown {
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
      const result = matchSkill(utterance, skills);
      return {
        utterance,
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
    default:
      throw new Error('unknown tool: ' + name);
  }
}

function handleRequest(req: JsonRpcRequest): JsonRpcResponse | null {
  try {
    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'hackathon-surgeon', version: '0.2.0' },
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
        const result = toolCall(toolName, args);
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

function main() {
  let buffer = '';
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
      const resp = handleRequest(req);
      if (resp && req.id !== undefined && req.id !== null) {
        process.stdout.write(JSON.stringify(resp) + '\n');
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

main();
