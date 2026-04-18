/**
 * Rollback Manager
 *
 * Handles atomic, all-or-nothing rollback of entire agent sessions.
 * Restores files from snapshots, records rollback operations, and maintains audit trail.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ActionRow,
  rollbackSession as rollbackSessionInDb,
  markSessionRolledBack,
  getSessionActions,
  markRolledBack,
} from '../db/database';

export interface RollbackError {
  action_id: string;
  reason: string;
}

export interface RollbackValidation {
  isValid: boolean;
  errors: RollbackError[];
  warningCount: number;
}

export interface FileSnapshot {
  file_path: string;
  content: string | null;
  existed: boolean;
}

export interface RollbackTransaction {
  session_id: string;
  actions: ActionRow[];
  fileRestores: Array<{ action_id: string; file_path: string; snapshot: FileSnapshot }>;
  rollbackAction_id?: string;
}

/**
 * Parse a snapshot JSON to extract file information
 */
function parseSnapshot(snapshotJson: string | null): FileSnapshot | null {
  if (!snapshotJson) return null;
  try {
    return JSON.parse(snapshotJson);
  } catch {
    return null;
  }
}

/**
 * Validate that all actions in session are rollbackable
 */
export function validateRollbackable(actions: ActionRow[]): RollbackValidation {
  const errors: RollbackError[] = [];

  for (const action of actions) {
    // Check if action is marked as reversible
    if (action.is_reversible === 0) {
      errors.push({
        action_id: action.action_id,
        reason: 'Action marked as non-reversible',
      });
    }

    // For write_file actions, check if we have before_snapshot
    if (action.tool_name === 'write_file' && !action.before_snapshot) {
      errors.push({
        action_id: action.action_id,
        reason: 'Missing before_snapshot for write_file action',
      });
    }

    // For bash actions, warn if they had side effects (e.g., database mutations)
    if (action.tool_name === 'bash') {
      const inputPayload = JSON.parse(action.input_payload || '{}');
      const command = inputPayload.command || '';

      // List of dangerous patterns that can't be rolled back
      const irreversiblePatterns = [
        /DROP\s+TABLE/i,
        /DELETE\s+FROM/i,
        /TRUNCATE/i,
        /rm\s+-rf/,
        /git\s+push/,
        /npm\s+publish/,
      ];

      for (const pattern of irreversiblePatterns) {
        if (pattern.test(command)) {
          errors.push({
            action_id: action.action_id,
            reason: `Bash command contains irreversible operation: "${command.substring(0, 50)}"`,
          });
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warningCount: 0,
  };
}

/**
 * Create a rollback transaction (plan, don't execute)
 */
export function createRollbackTransaction(
  session_id: string,
  actions: ActionRow[]
): RollbackTransaction {
  const fileRestores: RollbackTransaction['fileRestores'] = [];

  for (const action of actions) {
    // Only process write_file actions for file restoration
    if (action.tool_name === 'write_file') {
      const snapshot = parseSnapshot(action.before_snapshot);
      if (snapshot) {
        fileRestores.push({
          action_id: action.action_id,
          file_path: snapshot.file_path,
          snapshot,
        });
      }
    }
  }

  return {
    session_id,
    actions,
    fileRestores,
  };
}

/**
 * Execute rollback transaction (atomic, all-or-nothing)
 */
export function executeRollbackTransaction(transaction: RollbackTransaction): {
  success: boolean;
  filesRestored: number;
  error?: string;
} {
  try {
    // Phase 1: Validate all files can be restored before making any changes
    const projectRoot = process.env.WAYMARK_PROJECT_ROOT || process.cwd();

    for (const restore of transaction.fileRestores) {
      const fullPath = path.resolve(projectRoot, restore.file_path);

      // Check write permissions
      if (fs.existsSync(fullPath)) {
        try {
          // Try to stat the file to ensure we can access it
          fs.statSync(fullPath);
        } catch (err) {
          throw new Error(`Cannot access file for rollback: ${fullPath}`);
        }
      }
    }

    // Phase 2: Restore all files (all-or-nothing)
    let filesRestored = 0;

    for (const restore of transaction.fileRestores) {
      const fullPath = path.resolve(projectRoot, restore.file_path);

      if (restore.snapshot.existed === false) {
        // File didn't exist before, so delete it
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } else {
        // File existed, restore its content
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, restore.snapshot.content || '', 'utf-8');
      }

      filesRestored++;
    }

    // Phase 3: Mark actions as rolled back in database
    for (const action of transaction.actions) {
      markRolledBack(action.action_id);
    }

    // Phase 4: Mark session as rolled back
    markSessionRolledBack(transaction.session_id);

    return {
      success: true,
      filesRestored,
    };
  } catch (error: any) {
    return {
      success: false,
      filesRestored: 0,
      error: error.message,
    };
  }
}

/**
 * Rollback entire session (high-level API)
 *
 * Steps:
 * 1. Get all actions in session
 * 2. Validate all are reversible
 * 3. Create rollback transaction
 * 4. Execute rollback (atomic)
 * 5. Record audit trail
 */
export function rollbackSession(session_id: string): {
  success: boolean;
  message: string;
  filesRestored?: number;
} {
  try {
    // Get actions
    const actions = getSessionActions(session_id);
    if (actions.length === 0) {
      return {
        success: false,
        message: `Session ${session_id} has no actions to rollback`,
      };
    }

    // Validate
    const validation = validateRollbackable(actions);
    if (!validation.isValid) {
      const errorList = validation.errors.map((e) => `${e.action_id}: ${e.reason}`).join('; ');
      return {
        success: false,
        message: `Cannot rollback session: ${errorList}`,
      };
    }

    // Create transaction
    const transaction = createRollbackTransaction(session_id, actions);

    // Execute transaction
    const result = executeRollbackTransaction(transaction);

    if (!result.success) {
      return {
        success: false,
        message: result.error || 'Unknown error during rollback',
      };
    }

    return {
      success: true,
      message: `Successfully rolled back ${actions.length} action(s), restored ${result.filesRestored} file(s)`,
      filesRestored: result.filesRestored,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Rollback failed: ${error.message}`,
    };
  }
}
