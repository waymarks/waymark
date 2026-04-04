// Parse --project-root arg before any imports trigger module-level DB/config initialization
const _projectRootIdx = process.argv.indexOf('--project-root');
if (_projectRootIdx !== -1 && process.argv[_projectRootIdx + 1]) {
  process.env.WAYMARK_PROJECT_ROOT = process.argv[_projectRootIdx + 1];
}

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { insertAction, updateAction } from '../db/database';
import { loadConfig, checkFileAction, checkBashAction } from '../policies/engine';
import { notifyPendingAction } from '../notifications/slack';

const SESSION_ID = uuidv4();

// Bug 1: Build PATH that includes nvm-managed node binaries.
// Sourcing shell profiles non-interactively is unreliable (NVM_DIR unset, brew missing, etc.)
// Instead: read nvm's default alias directly from ~/.nvm and append known bin paths.
function getUserPath(): string {
  const base = process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  const extra: string[] = [];

  const home = process.env.HOME || require('os').homedir();
  const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm');

  // Add all nvm version bin dirs that exist, default alias first
  try {
    const defaultAlias = path.join(nvmDir, 'alias', 'default');
    if (fs.existsSync(defaultAlias)) {
      const ver = fs.readFileSync(defaultAlias, 'utf8').trim().replace(/^v/, '');
      const binDir = path.join(nvmDir, 'versions', 'node', `v${ver}`, 'bin');
      if (fs.existsSync(binDir)) extra.push(binDir);
    }
  } catch {}

  // Also add common fixed locations as fallback
  for (const p of ['/usr/local/bin', '/opt/homebrew/bin']) {
    if (fs.existsSync(p) && !base.includes(p)) extra.push(p);
  }

  return extra.length ? `${extra.join(':')}:${base}` : base;
}

const USER_PATH = getUserPath();

const server = new Server(
  { name: 'waymark', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'write_file',
        description: 'Write content to a file. Creates or overwrites the file.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute or relative path to the file' },
            content: { type: 'string', description: 'Content to write to the file' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'read_file',
        description: 'Read content from a file.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute or relative path to the file' },
          },
          required: ['path'],
        },
      },
      {
        name: 'bash',
        description: 'Execute a bash command and return output.',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The bash command to execute' },
          },
          required: ['command'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const action_id = uuidv4();
  const input_payload = JSON.stringify(args);

  if (name === 'write_file') {
    const filePath = (args as any).path as string;
    const content = (args as any).content as string;
    const resolvedPath = path.resolve(filePath);

    // Policy check before execution
    const config = loadConfig();
    const policyResult = checkFileAction(resolvedPath, 'write', config);
    if (policyResult.decision === 'block') {
      insertAction({
        action_id, session_id: SESSION_ID, tool_name: 'write_file',
        target_path: resolvedPath, input_payload, status: 'blocked',
        decision: 'block', policy_reason: policyResult.reason, matched_rule: policyResult.matchedRule,
      });
      throw new Error(`Waymark blocked: ${policyResult.reason} [rule: ${policyResult.matchedRule}]`);
    }
    if (policyResult.decision === 'pending') {
      insertAction({
        action_id, session_id: SESSION_ID, tool_name: 'write_file',
        target_path: resolvedPath, input_payload, status: 'pending',
        decision: 'pending', policy_reason: policyResult.reason, matched_rule: policyResult.matchedRule,
      });
      // Fire-and-forget Slack notification (no console.log — MCP uses stdio)
      notifyPendingAction({
        action_id, session_id: SESSION_ID, tool_name: 'write_file',
        target_path: resolvedPath, input_payload,
        before_snapshot: null, after_snapshot: null,
        status: 'pending', error_message: null, stdout: null, stderr: null,
        rolled_back: 0, rolled_back_at: null,
        created_at: new Date().toISOString(),
        decision: 'pending', policy_reason: policyResult.reason, matched_rule: policyResult.matchedRule,
        approved_at: null, approved_by: null, rejected_at: null, rejected_reason: null,
        id: 0,
      }).catch(() => {});
      return {
        content: [{
          type: 'text',
          text: `Action requires approval.\nAction ID: ${action_id}\nCheck status: GET /api/actions/${action_id}/status\n\nThis action is pending human approval. You can continue with other tasks. Poll the status endpoint to check if approved. If approved, the action has already been executed. If rejected, check the status response for the reason.`,
        }],
      };
    }

    // Capture before snapshot
    let before_snapshot: string | null = null;
    try {
      before_snapshot = fs.readFileSync(resolvedPath, 'utf8');
    } catch {
      // File doesn't exist yet — that's fine
    }

    insertAction({
      action_id,
      session_id: SESSION_ID,
      tool_name: 'write_file',
      target_path: resolvedPath,
      input_payload,
      before_snapshot,
      status: 'pending',
    });

    try {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      fs.writeFileSync(resolvedPath, content, 'utf8');

      updateAction(action_id, {
        status: 'success',
        after_snapshot: content,
      });

      return {
        content: [{ type: 'text', text: `File written successfully: ${resolvedPath}` }],
      };
    } catch (err: any) {
      updateAction(action_id, {
        status: 'error',
        error_message: err.message,
      });
      throw err;
    }

  } else if (name === 'read_file') {
    const filePath = (args as any).path as string;
    const resolvedPath = path.resolve(filePath);

    // Policy check before execution
    const config = loadConfig();
    const policyResult = checkFileAction(resolvedPath, 'read', config);
    if (policyResult.decision === 'block') {
      insertAction({
        action_id, session_id: SESSION_ID, tool_name: 'read_file',
        target_path: resolvedPath, input_payload, status: 'blocked',
        decision: 'block', policy_reason: policyResult.reason, matched_rule: policyResult.matchedRule,
      });
      throw new Error(`Waymark blocked: ${policyResult.reason} [rule: ${policyResult.matchedRule}]`);
    }
    if (policyResult.decision === 'pending') {
      insertAction({
        action_id, session_id: SESSION_ID, tool_name: 'read_file',
        target_path: resolvedPath, input_payload, status: 'pending',
        decision: 'pending', policy_reason: policyResult.reason, matched_rule: policyResult.matchedRule,
      });
      notifyPendingAction({
        action_id, session_id: SESSION_ID, tool_name: 'read_file',
        target_path: resolvedPath, input_payload,
        before_snapshot: null, after_snapshot: null,
        status: 'pending', error_message: null, stdout: null, stderr: null,
        rolled_back: 0, rolled_back_at: null,
        created_at: new Date().toISOString(),
        decision: 'pending', policy_reason: policyResult.reason, matched_rule: policyResult.matchedRule,
        approved_at: null, approved_by: null, rejected_at: null, rejected_reason: null,
        id: 0,
      }).catch(() => {});
      return {
        content: [{
          type: 'text',
          text: `Action requires approval.\nAction ID: ${action_id}\nCheck status: GET /api/actions/${action_id}/status\n\nThis action is pending human approval. You can continue with other tasks. Poll the status endpoint to check if approved. If approved, the action has already been executed. If rejected, check the status response for the reason.`,
        }],
      };
    }

    insertAction({
      action_id,
      session_id: SESSION_ID,
      tool_name: 'read_file',
      target_path: resolvedPath,
      input_payload,
      status: 'pending',
    });

    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');

      updateAction(action_id, {
        status: 'success',
        after_snapshot: content,
      });

      return {
        content: [{ type: 'text', text: content }],
      };
    } catch (err: any) {
      updateAction(action_id, {
        status: 'error',
        error_message: err.message,
      });
      throw err;
    }

  } else if (name === 'bash') {
    const command = (args as any).command as string;

    // Policy check before execution
    const config = loadConfig();
    const policyResult = checkBashAction(command, config);
    if (policyResult.decision === 'block') {
      insertAction({
        action_id, session_id: SESSION_ID, tool_name: 'bash',
        target_path: null, input_payload, status: 'blocked',
        decision: 'block', policy_reason: policyResult.reason, matched_rule: policyResult.matchedRule,
      });
      throw new Error(`Waymark blocked command: ${policyResult.reason} [rule: ${policyResult.matchedRule}]`);
    }

    insertAction({
      action_id,
      session_id: SESSION_ID,
      tool_name: 'bash',
      target_path: null,
      input_payload,
      status: 'pending',
    });

    // Bug 1 + Bug 2: use spawnSync for clean stdout/stderr separation and USER_PATH
    const result = spawnSync('sh', ['-c', command], {
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, PATH: USER_PATH },
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const failed = result.status !== 0 || !!result.error;

    if (!failed) {
      updateAction(action_id, {
        status: 'success',
        stdout,
        stderr,
      });
      return {
        content: [{ type: 'text', text: stdout || '(no output)' }],
      };
    } else {
      const errorMessage = result.error ? result.error.message : `Command exited with code ${result.status}`;
      updateAction(action_id, {
        status: 'error',
        stdout,
        stderr,
        error_message: errorMessage,
      });
      throw new Error(stderr || errorMessage);
    }

  } else {
    throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP server communicates via stdio — no console.log here to avoid polluting the stream
}

main().catch((err) => {
  process.stderr.write(`MCP server error: ${err.message}\n`);
  process.exit(1);
});
