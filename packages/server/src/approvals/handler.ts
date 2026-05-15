import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { getAction, approveAction, rejectAction, updateAction } from '../db/database';
import { loadConfig, checkFileAction, checkBashAction } from '../policies/engine';

function getUserPath(): string {
  const base = process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
  const extra: string[] = [];
  const nodeBinDir = path.dirname(process.execPath);
  if (!base.includes(nodeBinDir)) extra.push(nodeBinDir);
  for (const p of ['/usr/local/bin', '/opt/homebrew/bin']) {
    if (fs.existsSync(p) && !base.includes(p)) extra.push(p);
  }
  return extra.length ? `${extra.join(':')}:${base}` : base;
}

export interface ApprovalResult {
  success: boolean;
  error?: string;
  action?: string;
}

export async function approvePendingAction(
  actionId: string,
  approvedBy: string = 'ui'
): Promise<ApprovalResult> {
  const action = getAction(actionId);
  if (!action) {
    return { success: false, error: 'Action not found' };
  }
  if (action.status !== 'pending') {
    return { success: false, error: `Action is not pending (current status: ${action.status})` };
  }

  let after_snapshot: string | undefined;

  if (action.tool_name === 'write_file') {
    const { path: filePath, content } = JSON.parse(action.input_payload) as { path: string; content: string };

    // Resolve against WAYMARK_PROJECT_ROOT, not process.cwd(). The policy engine
    // (loadConfig in policies/engine.ts) uses the same env var; using cwd here
    // would cause a relative target_path to resolve to a different absolute
    // path than the one the policy was originally evaluated against — which
    // would then re-trigger a policy block on approval.
    const projectRoot = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
    const resolvedPath = path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(projectRoot, filePath);

    // Re-check current policies — they may have changed since the action was queued
    const currentConfig = loadConfig();
    const recheck = checkFileAction(resolvedPath, 'write', currentConfig);
    if (recheck.decision === 'block') {
      return {
        success: false,
        error: `Approval blocked: policy changed since action was recorded (${recheck.reason}). Resolved path: ${resolvedPath}`,
      };
    }

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, content, 'utf8');
    after_snapshot = content;

  } else if (action.tool_name === 'read_file') {
    // read_file: no re-execution needed, just mark approved

  } else if (action.tool_name === 'bash') {
    const config = loadConfig();
    const { command } = JSON.parse(action.input_payload) as { command: string };

    // Re-check policy — it may have changed since the action was queued
    const recheck = checkBashAction(command, config);
    if (recheck.decision === 'block') {
      updateAction(actionId, { status: 'error', error_message: `Policy changed since queuing: ${recheck.reason}` });
      return { success: false, error: `Approval blocked: policy changed (${recheck.reason})` };
    }

    const result = spawnSync('sh', ['-c', command], {
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, PATH: getUserPath() },
    });
    const maxBytes = config.policies.maxBashOutputBytes ?? 10000;
    const stdout = (result.stdout || '').slice(0, maxBytes);
    const stderr = (result.stderr || '').slice(0, maxBytes);
    const failed = result.status !== 0 || !!result.error;

    if (failed) {
      const errorMessage = result.error ? result.error.message : `Command exited with code ${result.status}`;
      updateAction(actionId, { status: 'error', stdout, stderr, error_message: errorMessage });
      return { success: false, error: errorMessage };
    }
    // Record stdout/stderr then mark approved with proper metadata
    updateAction(actionId, { status: 'success', stdout, stderr });
    approveAction(actionId, approvedBy);
    return { success: true, action: actionId };

  } else {
    return { success: false, error: `Unsupported tool for approval: ${action.tool_name}` };
  }

  approveAction(actionId, approvedBy, after_snapshot);
  return { success: true, action: actionId };
}

export async function approveWithEdit(
  actionId: string,
  newContent: string,
  approvedBy: string = 'ui'
): Promise<ApprovalResult> {
  const action = getAction(actionId);
  if (!action) return { success: false, error: 'Action not found' };
  if (action.status !== 'pending') return { success: false, error: `Action is not pending` };
  if (action.tool_name !== 'write_file') return { success: false, error: 'Only write_file actions support edit-approve' };

  const { path: filePath } = JSON.parse(action.input_payload) as { path: string; content: string };
  const projectRoot = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
  const resolvedPath = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(projectRoot, filePath);

  const currentConfig = loadConfig();
  const recheck = checkFileAction(resolvedPath, 'write', currentConfig);
  if (recheck.decision === 'block') {
    return { success: false, error: `Blocked by policy: ${recheck.reason}` };
  }

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, newContent, 'utf8');
  approveAction(actionId, approvedBy, newContent);
  return { success: true, action: actionId };
}

export async function rejectPendingAction(
  actionId: string,
  reason: string
): Promise<ApprovalResult> {
  const action = getAction(actionId);
  if (!action) {
    return { success: false, error: 'Action not found' };
  }
  if (action.status !== 'pending') {
    return { success: false, error: `Action is not pending (current status: ${action.status})` };
  }

  rejectAction(actionId, reason);
  return { success: true, action: actionId };
}
