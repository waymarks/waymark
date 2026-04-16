import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
const DB_PATH = process.env.WAYMARK_DB_PATH
  || path.join(PROJECT_ROOT, '.waymark', 'waymark.db');
const DB_DIR = path.dirname(DB_PATH);

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Create table on startup
db.exec(`
  CREATE TABLE IF NOT EXISTS action_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    target_path TEXT,
    input_payload TEXT NOT NULL,
    before_snapshot TEXT,
    after_snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    stdout TEXT,
    stderr TEXT,
    rolled_back INTEGER NOT NULL DEFAULT 0,
    rolled_back_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migrate existing DBs — add stdout/stderr if not present
try { db.exec('ALTER TABLE action_log ADD COLUMN stdout TEXT'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN stderr TEXT'); } catch {}
// Migrate v2: policy engine columns
try { db.exec("ALTER TABLE action_log ADD COLUMN decision TEXT NOT NULL DEFAULT 'allow'"); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN policy_reason TEXT'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN matched_rule TEXT'); } catch {}
// Migrate v3: approval flow columns
try { db.exec('ALTER TABLE action_log ADD COLUMN approved_at TEXT'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN approved_by TEXT'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN rejected_at TEXT'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN rejected_reason TEXT'); } catch {}
// Migrate v4: Phase 1 — plan mode logging visibility
try { db.exec("ALTER TABLE action_log ADD COLUMN event_type TEXT NOT NULL DEFAULT 'execution'"); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN observation_context TEXT'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN request_source TEXT DEFAULT \'direct\''); } catch {}
// Migrate v5: Phase 5B — CLI action logging (GitHub Copilot CLI wrapper)
try { db.exec("ALTER TABLE action_log ADD COLUMN source TEXT DEFAULT 'mcp'"); } catch {}

// Indexes for query performance
try { db.exec('CREATE INDEX IF NOT EXISTS idx_action_id ON action_log(action_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_status ON action_log(status)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_session_id ON action_log(session_id)'); } catch {}
// Phase 3: Add indexes for pagination and filtering
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tool_name ON action_log(tool_name)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_created_at ON action_log(created_at DESC)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_status_created ON action_log(status, created_at DESC)'); } catch {}

// Phase 3: Create archive table (same schema as action_log)
db.exec(`
  CREATE TABLE IF NOT EXISTS action_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    target_path TEXT,
    input_payload TEXT NOT NULL,
    before_snapshot TEXT,
    after_snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    stdout TEXT,
    stderr TEXT,
    rolled_back INTEGER NOT NULL DEFAULT 0,
    rolled_back_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decision TEXT NOT NULL DEFAULT 'allow',
    policy_reason TEXT,
    matched_rule TEXT,
    approved_at TEXT,
    approved_by TEXT,
    rejected_at TEXT,
    rejected_reason TEXT,
    event_type TEXT NOT NULL DEFAULT 'execution',
    observation_context TEXT,
    request_source TEXT DEFAULT 'direct',
    source TEXT DEFAULT 'mcp'
  )
`);

// Phase 3: Add indexes on archive table
try { db.exec('CREATE INDEX IF NOT EXISTS idx_archive_action_id ON action_archive(action_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_archive_created_at ON action_archive(created_at DESC)'); } catch {}

export interface ActionRow {
  id: number;
  action_id: string;
  session_id: string;
  tool_name: string;
  target_path: string | null;
  input_payload: string;
  before_snapshot: string | null;
  after_snapshot: string | null;
  status: string;
  error_message: string | null;
  stdout: string | null;
  stderr: string | null;
  rolled_back: number;
  rolled_back_at: string | null;
  created_at: string;
  decision: string;
  policy_reason: string | null;
  matched_rule: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  event_type: string;
  observation_context: string | null;
  request_source: string;
  source?: string;
}

export interface InsertActionParams {
  action_id: string;
  session_id: string;
  tool_name: string;
  target_path?: string | null;
  input_payload: string;
  before_snapshot?: string | null;
  status: string;
  decision?: string;
  policy_reason?: string | null;
  matched_rule?: string | null;
  event_type?: string;
  observation_context?: string | null;
  request_source?: string;
  source?: string;
}

export interface UpdateActionParams {
  status?: string;
  after_snapshot?: string | null;
  error_message?: string | null;
  stdout?: string | null;
  stderr?: string | null;
}

const insertStmt = db.prepare(`
  INSERT INTO action_log (action_id, session_id, tool_name, target_path, input_payload, before_snapshot, status, decision, policy_reason, matched_rule, event_type, observation_context, request_source, source)
  VALUES (@action_id, @session_id, @tool_name, @target_path, @input_payload, @before_snapshot, @status, @decision, @policy_reason, @matched_rule, @event_type, @observation_context, @request_source, @source)
`);

const updateStmt = db.prepare(`
  UPDATE action_log
  SET status = COALESCE(@status, status),
      after_snapshot = COALESCE(@after_snapshot, after_snapshot),
      error_message = COALESCE(@error_message, error_message),
      stdout = COALESCE(@stdout, stdout),
      stderr = COALESCE(@stderr, stderr)
  WHERE action_id = @action_id
`);

export function insertAction(params: InsertActionParams): void {
  insertStmt.run({
    action_id: params.action_id,
    session_id: params.session_id,
    tool_name: params.tool_name,
    target_path: params.target_path ?? null,
    input_payload: params.input_payload,
    before_snapshot: params.before_snapshot ?? null,
    status: params.status,
    decision: params.decision ?? 'pending',
    policy_reason: params.policy_reason ?? null,
    matched_rule: params.matched_rule ?? null,
    event_type: params.event_type ?? 'execution',
    observation_context: params.observation_context ?? null,
    request_source: params.request_source ?? 'direct',
    source: params.source ?? 'mcp',
  });
}

export function updateAction(action_id: string, params: UpdateActionParams): void {
  updateStmt.run({
    action_id,
    status: params.status ?? null,
    after_snapshot: params.after_snapshot ?? null,
    error_message: params.error_message ?? null,
    stdout: params.stdout ?? null,
    stderr: params.stderr ?? null,
  });
}

export function getActions(): ActionRow[] {
  return db.prepare(`
    SELECT * FROM action_log ORDER BY created_at DESC LIMIT 100
  `).all() as ActionRow[];
}

export function getAction(action_id: string): ActionRow | undefined {
  return db.prepare(`
    SELECT * FROM action_log WHERE action_id = ?
  `).get(action_id) as ActionRow | undefined;
}

export function markRolledBack(action_id: string): void {
  db.prepare(`
    UPDATE action_log
    SET rolled_back = 1, rolled_back_at = datetime('now')
    WHERE action_id = ?
  `).run(action_id);
}

export function getSessions(): Array<{ session_id: string; action_count: number; latest: string }> {
  return db.prepare(`
    SELECT session_id,
           COUNT(*) as action_count,
           MAX(created_at) as latest
    FROM action_log
    GROUP BY session_id
    ORDER BY latest DESC
  `).all() as Array<{ session_id: string; action_count: number; latest: string }>;
}

export function approveAction(action_id: string, approved_by: string, after_snapshot?: string): void {
  db.prepare(`
    UPDATE action_log
    SET status = 'success',
        decision = 'allow',
        approved_at = datetime('now'),
        approved_by = @approved_by,
        after_snapshot = COALESCE(@after_snapshot, after_snapshot)
    WHERE action_id = @action_id
  `).run({ action_id, approved_by, after_snapshot: after_snapshot ?? null });
}

export function rejectAction(action_id: string, reason: string): void {
  db.prepare(`
    UPDATE action_log
    SET status = 'rejected',
        decision = 'rejected',
        rejected_at = datetime('now'),
        rejected_reason = @reason
    WHERE action_id = @action_id
  `).run({ action_id, reason });
}

export function getPendingCount(): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE status = 'pending'
  `).get() as { count: number };
  return row.count;
}

// Phase 3: Pagination and filtering support
export interface ActionFilter {
  status?: string;
  tool_name?: string;
  search?: string;  // search by action_id
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  actions: ActionRow[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function getActionsWithFiltering(filter: ActionFilter = {}): PaginationResult {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(filter.limit ?? 50, 200); // max 200 per page
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params: any = {};

  if (filter.status) {
    where += ' AND status = @status';
    params.status = filter.status;
  }

  if (filter.tool_name) {
    where += ' AND tool_name = @tool_name';
    params.tool_name = filter.tool_name;
  }

  if (filter.search) {
    where += ' AND (action_id LIKE @search OR target_path LIKE @search)';
    params.search = `%${filter.search}%`;
  }

  // Get total count
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE ${where}
  `).get(params) as { count: number };
  const totalCount = countRow.count;

  // Get paginated results
  const actions = db.prepare(`
    SELECT * FROM action_log WHERE ${where}
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset }) as ActionRow[];

  return {
    actions,
    totalCount,
    page,
    limit,
    hasMore: offset + actions.length < totalCount,
  };
}

export function archiveOldActions(daysOld: number = 30): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const cutoffStr = cutoffDate.toISOString();

  // Copy old actions to archive
  const result = db.prepare(`
    INSERT OR IGNORE INTO action_archive
    SELECT * FROM action_log WHERE created_at < @cutoff
  `).run({ cutoff: cutoffStr });

  // Delete from main table (but keep recent entries)
  const deleteStmt = db.prepare(`
    DELETE FROM action_log WHERE created_at < @cutoff
    AND id NOT IN (
      SELECT id FROM action_log ORDER BY created_at DESC LIMIT 1000
    )
  `);
  deleteStmt.run({ cutoff: cutoffStr });

  return result.changes;
}

export function getArchivedActionsWithFiltering(filter: ActionFilter = {}): PaginationResult {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params: any = {};

  if (filter.status) {
    where += ' AND status = @status';
    params.status = filter.status;
  }

  if (filter.tool_name) {
    where += ' AND tool_name = @tool_name';
    params.tool_name = filter.tool_name;
  }

  if (filter.search) {
    where += ' AND (action_id LIKE @search OR target_path LIKE @search)';
    params.search = `%${filter.search}%`;
  }

  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM action_archive WHERE ${where}
  `).get(params) as { count: number };
  const totalCount = countRow.count;

  const actions = db.prepare(`
    SELECT * FROM action_archive WHERE ${where}
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset }) as ActionRow[];

  return {
    actions,
    totalCount,
    page,
    limit,
    hasMore: offset + actions.length < totalCount,
  };
}

// Phase 3: Summary statistics
export interface SummaryStats {
  totalActions: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  todayCount: number;
  thisWeekCount: number;
  thisMonthCount: number;
  topTools: Array<{ tool: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
}

export function getSummaryStats(): SummaryStats {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM action_log
  `).get() as { count: number };

  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE status = 'pending'
  `).get() as { count: number };

  const approved = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE status = 'success' OR decision = 'allow'
  `).get() as { count: number };

  const rejected = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE status = 'rejected' OR decision = 'rejected'
  `).get() as { count: number };

  const todayCount = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE created_at >= @today
  `).get({ today }) as { count: number };

  const weekCount = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE created_at >= @weekAgo
  `).get({ weekAgo }) as { count: number };

  const monthCount = db.prepare(`
    SELECT COUNT(*) as count FROM action_log WHERE created_at >= @monthAgo
  `).get({ monthAgo }) as { count: number };

  const topTools = db.prepare(`
    SELECT tool_name as tool, COUNT(*) as count FROM action_log
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT 5
  `).all() as Array<{ tool: string; count: number }>;

  const topPaths = db.prepare(`
    SELECT target_path as path, COUNT(*) as count FROM action_log
    WHERE target_path IS NOT NULL
    GROUP BY target_path
    ORDER BY count DESC
    LIMIT 5
  `).all() as Array<{ path: string; count: number }>;

  return {
    totalActions: total.count,
    pendingCount: pending.count,
    approvedCount: approved.count,
    rejectedCount: rejected.count,
    todayCount: todayCount.count,
    thisWeekCount: weekCount.count,
    thisMonthCount: monthCount.count,
    topTools,
    topPaths,
  };
}

export default db;
