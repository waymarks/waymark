import * as fs from 'fs';
import * as path from 'path';
import { getAction, approveAction, rejectAction } from '../db/database';
import { loadConfig, checkFileAction } from '../policies/engine';

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
    const resolvedPath = path.resolve(filePath);

    // Re-check current policies — they may have changed since the action was queued
    const currentConfig = loadConfig();
    const recheck = checkFileAction(resolvedPath, 'write', currentConfig);
    if (recheck.decision === 'block') {
      return { success: false, error: `Approval blocked: policy changed (${recheck.reason})` };
    }

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, content, 'utf8');
    after_snapshot = content;

  } else if (action.tool_name === 'read_file') {
    // read_file: no re-execution needed, just mark approved
    // (the file read already happened conceptually; approval means "yes, this was ok")

  } else {
    return { success: false, error: `Unsupported tool for approval: ${action.tool_name}` };
  }

  approveAction(actionId, approvedBy, after_snapshot);
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
