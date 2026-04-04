import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'waymark.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
}

export interface UpdateActionParams {
  status?: string;
  after_snapshot?: string | null;
  error_message?: string | null;
  stdout?: string | null;
  stderr?: string | null;
}

const insertStmt = db.prepare(`
  INSERT INTO action_log (action_id, session_id, tool_name, target_path, input_payload, before_snapshot, status, decision, policy_reason, matched_rule)
  VALUES (@action_id, @session_id, @tool_name, @target_path, @input_payload, @before_snapshot, @status, @decision, @policy_reason, @matched_rule)
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
    decision: params.decision ?? 'allow',
    policy_reason: params.policy_reason ?? null,
    matched_rule: params.matched_rule ?? null,
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

export default db;
