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
// Migrate v6: Phase 1 — Session-level rollback
try { db.exec('ALTER TABLE action_log ADD COLUMN rollback_group TEXT'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN is_reversible INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE action_log ADD COLUMN revert_action_id TEXT'); } catch {}

// Phase 1: Create sessions table
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at DATETIME,
    status TEXT NOT NULL DEFAULT 'active'
  )
`);

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
    source TEXT DEFAULT 'mcp',
    rollback_group TEXT,
    is_reversible INTEGER DEFAULT 1,
    revert_action_id TEXT
  )
`);

// Phase 1: Add same columns to archive (migrations)
try { db.exec('ALTER TABLE action_archive ADD COLUMN rollback_group TEXT'); } catch {}
try { db.exec('ALTER TABLE action_archive ADD COLUMN is_reversible INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE action_archive ADD COLUMN revert_action_id TEXT'); } catch {}

// Phase 3: Add indexes on archive table
try { db.exec('CREATE INDEX IF NOT EXISTS idx_archive_action_id ON action_archive(action_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_archive_created_at ON action_archive(created_at DESC)'); } catch {}

// Phase 1: Add indexes for session rollback
try { db.exec('CREATE INDEX IF NOT EXISTS idx_action_session ON action_log(session_id, status)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_action_rollback_group ON action_log(rollback_group)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, created_at DESC)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_archive_session ON action_archive(session_id)'); } catch {}

// Phase 2: Create team_members table
db.exec(`
  CREATE TABLE IF NOT EXISTS team_members (
    member_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    slack_id TEXT,
    role TEXT DEFAULT 'approver',
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_by TEXT,
    status TEXT DEFAULT 'active'
  )
`);

// Phase 2: Create approval_routes table (rules for who approves what)
db.exec(`
  CREATE TABLE IF NOT EXISTS approval_routes (
    route_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    condition_type TEXT DEFAULT 'all_sessions',
    condition_json TEXT,
    required_approvers INTEGER DEFAULT 1,
    approver_ids TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    status TEXT DEFAULT 'active'
  )
`);

// Phase 2: Create approval_requests table (pending/completed approvals)
db.exec(`
  CREATE TABLE IF NOT EXISTS approval_requests (
    request_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    triggered_by TEXT NOT NULL,
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    completed_at DATETIME,
    approver_ids TEXT NOT NULL,
    approved_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    approval_details TEXT
  )
`);

// Phase 2: Create approval_decisions table (audit trail)
db.exec(`
  CREATE TABLE IF NOT EXISTS approval_decisions (
    decision_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    approver_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT,
    decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Phase 2: Add indexes for team tables
try { db.exec('CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_approval_routes_status ON approval_routes(status)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_approval_requests_session ON approval_requests(session_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_approval_requests_triggered ON approval_requests(triggered_at DESC)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_approval_decisions_request ON approval_decisions(request_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_approval_decisions_approver ON approval_decisions(approver_id)'); } catch {}

// Phase 3: Create escalation_rules table
db.exec(`
  CREATE TABLE IF NOT EXISTS escalation_rules (
    rule_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    timeout_hours INTEGER DEFAULT 24,
    escalation_targets TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    status TEXT DEFAULT 'active'
  )
`);

// Phase 3: Create escalation_requests table
db.exec(`
  CREATE TABLE IF NOT EXISTS escalation_requests (
    request_id TEXT PRIMARY KEY,
    approval_request_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    escalation_triggered_at DATETIME,
    escalation_deadline DATETIME,
    escalation_targets TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    decided_at DATETIME,
    decision TEXT
  )
`);

// Phase 3: Create escalation_decisions table
db.exec(`
  CREATE TABLE IF NOT EXISTS escalation_decisions (
    decision_id TEXT PRIMARY KEY,
    escalation_request_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT,
    decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Phase 3: Add indexes for escalation tables
try { db.exec('CREATE INDEX IF NOT EXISTS idx_escalation_rules_status ON escalation_rules(status)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_escalation_requests_approval ON escalation_requests(approval_request_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_escalation_requests_deadline ON escalation_requests(escalation_deadline)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_escalation_requests_status ON escalation_requests(status)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_escalation_decisions_request ON escalation_decisions(escalation_request_id)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_escalation_decisions_target ON escalation_decisions(target_id)'); } catch {}

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
  rollback_group?: string;
  is_reversible?: number;
  revert_action_id?: string;
}

export interface SessionRow {
  session_id: string;
  user_id: string | null;
  project_id: string | null;
  created_at: string;
  rolled_back_at: string | null;
  status: string;
}

// Phase 2: Team and approval interfaces
export interface TeamMember {
  member_id: string;
  name: string;
  email: string;
  slack_id: string | null;
  role: string;
  added_at: string;
  added_by: string | null;
  status: string;
}

export interface ApprovalRoute {
  route_id: string;
  name: string;
  description: string | null;
  condition_type: string;
  condition_json: string | null;
  required_approvers: number;
  approver_ids: string; // JSON array: ["user1", "user2"]
  created_at: string;
  created_by: string | null;
  status: string;
}

export interface ApprovalRequest {
  request_id: string;
  session_id: string;
  route_id: string;
  triggered_by: string;
  triggered_at: string;
  status: string; // pending, approved, rejected, mixed
  completed_at: string | null;
  approver_ids: string; // JSON array: ["approver1", "approver2"]
  approved_count: number;
  rejected_count: number;
  approval_details: string | null; // JSON with decision info
}

export interface ApprovalDecision {
  decision_id: string;
  request_id: string;
  approver_id: string;
  decision: string; // approve, reject
  reason: string | null;
  decided_at: string;
}

// Phase 3: Escalation interfaces
export interface EscalationRule {
  rule_id: string;
  name: string;
  description: string | null;
  timeout_hours: number;
  escalation_targets: string; // JSON array: ["target1", "target2"]
  created_at: string;
  created_by: string | null;
  status: string;
}

export interface EscalationRequest {
  request_id: string;
  approval_request_id: string;
  session_id: string;
  escalation_triggered_at: string | null;
  escalation_deadline: string;
  escalation_targets: string; // JSON array
  status: string; // pending, decided
  decided_at: string | null;
  decision: string | null; // proceed, block
}

export interface EscalationDecision {
  decision_id: string;
  escalation_request_id: string;
  target_id: string;
  decision: string; // proceed, block
  reason: string | null;
  decided_at: string;
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
  rollback_group?: string;
  is_reversible?: number;
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

// Phase 1: Session management functions
export function createSession(session_id: string, user_id?: string, project_id?: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO sessions (session_id, user_id, project_id, status)
    VALUES (?, ?, ?, 'active')
  `).run(session_id, user_id ?? null, project_id ?? null);
}

export function getSession(session_id: string): SessionRow | undefined {
  return db.prepare(`
    SELECT * FROM sessions WHERE session_id = ?
  `).get(session_id) as SessionRow | undefined;
}

export function getAllSessions(): SessionRow[] {
  return db.prepare(`
    SELECT * FROM sessions ORDER BY created_at DESC
  `).all() as SessionRow[];
}

export function getSessionActions(session_id: string): ActionRow[] {
  return db.prepare(`
    SELECT * FROM action_log
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(session_id) as ActionRow[];
}

export interface RollbackResult {
  success: boolean;
  session_id: string;
  actions_rolled_back: number;
  error?: string;
}

export function rollbackSession(session_id: string): RollbackResult {
  try {
    // Start transaction
    const transaction = db.transaction(() => {
      // Get all actions in session
      const actions = getSessionActions(session_id);

      if (actions.length === 0) {
        throw new Error(`Session ${session_id} has no actions to rollback`);
      }

      // Check if all actions are reversible
      const nonReversible = actions.filter(a => a.is_reversible === 0);
      if (nonReversible.length > 0) {
        throw new Error(`${nonReversible.length} action(s) in session are not reversible`);
      }

      // For each action, perform rollback
      let rolledBackCount = 0;
      for (const action of actions) {
        // Mark as rolled back
        markRolledBack(action.action_id);
        rolledBackCount++;

        // If before_snapshot exists, restore it (for write_file actions)
        if (action.before_snapshot) {
          try {
            const snapshot = JSON.parse(action.before_snapshot);
            if (snapshot.file_path && snapshot.content !== undefined) {
              // This will be handled by the rollback manager
              // We just mark it as rolled back here
            }
          } catch {}
        }
      }

      // Mark session as rolled back
      db.prepare(`
        UPDATE sessions
        SET rolled_back_at = datetime('now'), status = 'rolled_back'
        WHERE session_id = ?
      `).run(session_id);

      return rolledBackCount;
    });

    const actionsRolledBack = transaction();

    return {
      success: true,
      session_id,
      actions_rolled_back: actionsRolledBack,
    };
  } catch (error: any) {
    return {
      success: false,
      session_id,
      actions_rolled_back: 0,
      error: error.message,
    };
  }
}

export function markSessionRolledBack(session_id: string): void {
  db.prepare(`
    UPDATE sessions
    SET rolled_back_at = datetime('now'), status = 'rolled_back'
    WHERE session_id = ?
  `).run(session_id);
}

// Phase 2: Team member functions
export function addTeamMember(
  member_id: string,
  name: string,
  email: string,
  added_by: string,
  slack_id?: string
): void {
  db.prepare(`
    INSERT OR REPLACE INTO team_members (member_id, name, email, slack_id, added_by, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(member_id, name, email, slack_id ?? null, added_by);
}

export function getTeamMember(member_id: string): TeamMember | undefined {
  return db.prepare(`
    SELECT * FROM team_members WHERE member_id = ?
  `).get(member_id) as TeamMember | undefined;
}

export function getTeamMemberByEmail(email: string): TeamMember | undefined {
  return db.prepare(`
    SELECT * FROM team_members WHERE email = ?
  `).get(email) as TeamMember | undefined;
}

export function getAllTeamMembers(): TeamMember[] {
  return db.prepare(`
    SELECT * FROM team_members WHERE status = 'active' ORDER BY name ASC
  `).all() as TeamMember[];
}

export function removeTeamMember(member_id: string): void {
  db.prepare(`
    UPDATE team_members SET status = 'inactive' WHERE member_id = ?
  `).run(member_id);
}

// Phase 2: Approval route functions
export function addApprovalRoute(
  route_id: string,
  name: string,
  approver_ids: string[],
  created_by: string,
  description?: string,
  condition_type?: string,
  condition_json?: string
): void {
  db.prepare(`
    INSERT OR REPLACE INTO approval_routes (route_id, name, description, condition_type, condition_json, approver_ids, created_by, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    route_id,
    name,
    description ?? null,
    condition_type ?? 'all_sessions',
    condition_json ?? null,
    JSON.stringify(approver_ids),
    created_by
  );
}

export function getApprovalRoute(route_id: string): ApprovalRoute | undefined {
  return db.prepare(`
    SELECT * FROM approval_routes WHERE route_id = ?
  `).get(route_id) as ApprovalRoute | undefined;
}

export function getAllApprovalRoutes(): ApprovalRoute[] {
  return db.prepare(`
    SELECT * FROM approval_routes WHERE status = 'active' ORDER BY name ASC
  `).all() as ApprovalRoute[];
}

export function updateApprovalRoute(
  route_id: string,
  updates: { name?: string; description?: string; approver_ids?: string[] }
): void {
  const current = getApprovalRoute(route_id);
  if (!current) throw new Error(`Route ${route_id} not found`);

  db.prepare(`
    UPDATE approval_routes
    SET name = ?, description = ?, approver_ids = ?
    WHERE route_id = ?
  `).run(
    updates.name ?? current.name,
    updates.description ?? current.description,
    updates.approver_ids ? JSON.stringify(updates.approver_ids) : current.approver_ids,
    route_id
  );
}

export function deleteApprovalRoute(route_id: string): void {
  db.prepare(`
    UPDATE approval_routes SET status = 'inactive' WHERE route_id = ?
  `).run(route_id);
}

// Phase 2: Approval request functions
export function createApprovalRequest(
  request_id: string,
  session_id: string,
  route_id: string,
  triggered_by: string,
  approver_ids: string[]
): void {
  db.prepare(`
    INSERT INTO approval_requests (request_id, session_id, route_id, triggered_by, approver_ids, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(request_id, session_id, route_id, triggered_by, JSON.stringify(approver_ids));
}

export function getApprovalRequest(request_id: string): ApprovalRequest | undefined {
  return db.prepare(`
    SELECT * FROM approval_requests WHERE request_id = ?
  `).get(request_id) as ApprovalRequest | undefined;
}

export function getSessionApprovalRequests(session_id: string): ApprovalRequest[] {
  return db.prepare(`
    SELECT * FROM approval_requests WHERE session_id = ? ORDER BY triggered_at DESC
  `).all(session_id) as ApprovalRequest[];
}

export function getPendingApprovals(approver_id?: string): ApprovalRequest[] {
  if (approver_id) {
    return db.prepare(`
      SELECT * FROM approval_requests
      WHERE status = 'pending' AND approver_ids LIKE ?
      ORDER BY triggered_at DESC
    `).all(`%"${approver_id}"%`) as ApprovalRequest[];
  }
  return db.prepare(`
    SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY triggered_at DESC
  `).all() as ApprovalRequest[];
}

export function submitApprovalDecision(
  decision_id: string,
  request_id: string,
  approver_id: string,
  decision: 'approve' | 'reject',
  reason?: string
): void {
  // Insert decision
  db.prepare(`
    INSERT INTO approval_decisions (decision_id, request_id, approver_id, decision, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(decision_id, request_id, approver_id, decision, reason ?? null);

  // Update approval request counts
  const request = getApprovalRequest(request_id);
  if (!request) throw new Error(`Request ${request_id} not found`);

  const decisions = db.prepare(`
    SELECT decision FROM approval_decisions WHERE request_id = ?
  `).all(request_id) as Array<{ decision: string }>;

  const approvedCount = decisions.filter(d => d.decision === 'approve').length;
  const rejectedCount = decisions.filter(d => d.decision === 'reject').length;
  const approverIds = JSON.parse(request.approver_ids) as string[];

  // Determine new status
  let newStatus = 'pending';
  if (rejectedCount > 0) {
    newStatus = 'rejected';
  } else if (approvedCount >= approverIds.length) {
    newStatus = 'approved';
  }

  db.prepare(`
    UPDATE approval_requests
    SET approved_count = ?, rejected_count = ?, status = ?, completed_at = ?
    WHERE request_id = ?
  `).run(
    approvedCount,
    rejectedCount,
    newStatus,
    newStatus !== 'pending' ? new Date().toISOString() : null,
    request_id
  );
}

export function getApprovalDecisions(request_id: string): ApprovalDecision[] {
  return db.prepare(`
    SELECT * FROM approval_decisions WHERE request_id = ? ORDER BY decided_at ASC
  `).all(request_id) as ApprovalDecision[];
}

// Phase 3: Escalation rule functions
export function addEscalationRule(
  rule_id: string,
  name: string,
  escalation_targets: string[],
  created_by: string,
  description?: string,
  timeout_hours?: number
): void {
  db.prepare(`
    INSERT OR REPLACE INTO escalation_rules (rule_id, name, description, timeout_hours, escalation_targets, created_by, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `).run(
    rule_id,
    name,
    description ?? null,
    timeout_hours ?? 24,
    JSON.stringify(escalation_targets),
    created_by
  );
}

export function getEscalationRule(rule_id: string): EscalationRule | undefined {
  return db.prepare(`
    SELECT * FROM escalation_rules WHERE rule_id = ?
  `).get(rule_id) as EscalationRule | undefined;
}

export function getAllEscalationRules(): EscalationRule[] {
  return db.prepare(`
    SELECT * FROM escalation_rules WHERE status = 'active' ORDER BY name ASC
  `).all() as EscalationRule[];
}

export function updateEscalationRule(
  rule_id: string,
  updates: { name?: string; description?: string; timeout_hours?: number; escalation_targets?: string[] }
): void {
  const current = getEscalationRule(rule_id);
  if (!current) throw new Error(`Rule ${rule_id} not found`);

  db.prepare(`
    UPDATE escalation_rules
    SET name = ?, description = ?, timeout_hours = ?, escalation_targets = ?
    WHERE rule_id = ?
  `).run(
    updates.name ?? current.name,
    updates.description ?? current.description,
    updates.timeout_hours ?? current.timeout_hours,
    updates.escalation_targets ? JSON.stringify(updates.escalation_targets) : current.escalation_targets,
    rule_id
  );
}

export function deleteEscalationRule(rule_id: string): void {
  db.prepare(`
    UPDATE escalation_rules SET status = 'inactive' WHERE rule_id = ?
  `).run(rule_id);
}

// Phase 3: Escalation request functions
export function createEscalationRequest(
  request_id: string,
  approval_request_id: string,
  session_id: string,
  escalation_targets: string[],
  deadline: string
): void {
  db.prepare(`
    INSERT INTO escalation_requests (request_id, approval_request_id, session_id, escalation_triggered_at, escalation_deadline, escalation_targets, status)
    VALUES (?, ?, ?, datetime('now'), ?, ?, 'pending')
  `).run(request_id, approval_request_id, session_id, deadline, JSON.stringify(escalation_targets));
}

export function getEscalationRequest(request_id: string): EscalationRequest | undefined {
  return db.prepare(`
    SELECT * FROM escalation_requests WHERE request_id = ?
  `).get(request_id) as EscalationRequest | undefined;
}

export function getPendingEscalations(): EscalationRequest[] {
  return db.prepare(`
    SELECT * FROM escalation_requests WHERE status = 'pending' ORDER BY escalation_deadline ASC
  `).all() as EscalationRequest[];
}

export function getStaleApprovals(now: string): Array<{ approval_request_id: string; session_id: string }> {
  return db.prepare(`
    SELECT DISTINCT ar.request_id as approval_request_id, ar.session_id
    FROM approval_requests ar
    WHERE ar.status = 'pending'
      AND ar.triggered_at < ?
      AND NOT EXISTS (
        SELECT 1 FROM escalation_requests er
        WHERE er.approval_request_id = ar.request_id
      )
  `).all(now) as Array<{ approval_request_id: string; session_id: string }>;
}

export function submitEscalationDecision(
  decision_id: string,
  escalation_request_id: string,
  target_id: string,
  decision: 'proceed' | 'block',
  reason?: string
): void {
  db.prepare(`
    INSERT INTO escalation_decisions (decision_id, escalation_request_id, target_id, decision, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(decision_id, escalation_request_id, target_id, decision, reason ?? null);

  // Update escalation request status if all targets have decided
  const request = getEscalationRequest(escalation_request_id);
  if (!request) return;

  const decisions = db.prepare(`
    SELECT DISTINCT decision FROM escalation_decisions WHERE escalation_request_id = ?
  `).all(escalation_request_id) as Array<{ decision: string }>;

  const hasBlockDecision = decisions.some(d => d.decision === 'block');
  const newStatus = hasBlockDecision ? 'blocked' : 'proceeded';

  db.prepare(`
    UPDATE escalation_requests
    SET status = ?, decided_at = datetime('now'), decision = ?
    WHERE request_id = ?
  `).run(newStatus, newStatus, escalation_request_id);
}

export function getEscalationDecisions(escalation_request_id: string): EscalationDecision[] {
  return db.prepare(`
    SELECT * FROM escalation_decisions WHERE escalation_request_id = ? ORDER BY decided_at ASC
  `).all(escalation_request_id) as EscalationDecision[];
}

export function getEscalationHistory(session_id: string): EscalationRequest[] {
  return db.prepare(`
    SELECT * FROM escalation_requests WHERE session_id = ? ORDER BY escalation_triggered_at DESC
  `).all(session_id) as EscalationRequest[];
}

export default db;
