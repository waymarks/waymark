import { vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock better-sqlite3 to avoid native module binary incompatibility
vi.mock('better-sqlite3', () => {
  // In-memory data store for mocked database
  const dataStore: Map<string, any> = new Map();

  const mockDb = {
    prepare: vi.fn((sql: string) => {
      return {
        run: vi.fn((params: any) => {
          // Handle INSERT INTO action_log
          if (sql.includes('INSERT INTO action_log')) {
            const key = `action_${params.action_id}`;
            dataStore.set(key, params);
          }
          // Handle all UPDATE action_log statements
          else if (sql.includes('UPDATE action_log')) {
            const key = `action_${params.action_id}`;
            const existing = dataStore.get(key) || {};
            const updates: any = {};

            // Parse SET clauses to extract column = value or column = @param
            const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/is);
            if (setMatch) {
              const setClauses = setMatch[1].split(',');
              setClauses.forEach((clause: string) => {
                const [col, val] = clause.split('=').map((s: string) => s.trim());
                if (val?.startsWith("'") && val?.endsWith("'")) {
                  // Literal value like 'rejected'
                  updates[col] = val.slice(1, -1);
                } else if (val?.startsWith('@')) {
                  // Parameter like @reason
                  const paramName = val.slice(1);
                  updates[col] = params[paramName];
                } else if (val?.includes('(')) {
                  // Function call like datetime('now')
                  updates[col] = new Date().toISOString();
                }
              });
            }

            dataStore.set(key, { ...existing, ...updates });
          }
          return { changes: 1 };
        }),
        get: vi.fn((idOrParams: any) => {
          if (typeof idOrParams === 'string') {
            return dataStore.get(`action_${idOrParams}`);
          }
          return dataStore.get(`action_${idOrParams?.action_id}`);
        }),
        all: vi.fn(() => Array.from(dataStore.values()).filter((v: any) => v.action_id)),
      };
    }),
    exec: vi.fn(),
    close: vi.fn(),
  };
  return { default: vi.fn(() => mockDb) };
});

// We use an in-memory/temp DB for each test by setting env vars before import
let tmpDir: string;

// ─── DB + handler helpers ─────────────────────────────────────────────────────

function setupTestDb() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waymark-approval-'));
  process.env.WAYMARK_PROJECT_ROOT = tmpDir;
  process.env.WAYMARK_DB_PATH = path.join(tmpDir, 'test.db');
}

function teardownTestDb() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.WAYMARK_PROJECT_ROOT;
  delete process.env.WAYMARK_DB_PATH;
  // Note: Vitest handles module state per test, no need to resetModules
}

// ─── approvePendingAction ─────────────────────────────────────────────────────

describe('approvePendingAction', () => {
  beforeEach(() => {
    setupTestDb();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it('returns error when action does not exist', async () => {
    const { approvePendingAction } = await import('./handler');
    const result = await approvePendingAction('nonexistent-id');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error when action is not pending', async () => {
    const { approvePendingAction } = await import('./handler');
    const { insertAction, updateAction } = await import('../db/database');

    insertAction({
      action_id: 'already-done',
      session_id: 'sess1',
      tool_name: 'write_file',
      input_payload: JSON.stringify({ path: '/tmp/x.txt', content: 'hello' }),
      status: 'success',
      decision: 'allow',
    });
    updateAction('already-done', { status: 'success' });

    const result = await approvePendingAction('already-done');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not pending/i);
  });

  it('blocks approval when policy has since tightened', async () => {
    // Write a config that blocks the target path
    const blockedConfig = {
      version: '1',
      policies: {
        allowedPaths: [],
        blockedPaths: [path.join(tmpDir, 'secret.txt')],
        blockedCommands: [],
        requireApproval: [],
        maxBashOutputBytes: 10000,
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'waymark.config.json'), JSON.stringify(blockedConfig));

    const { approvePendingAction } = await import('./handler');
    const { insertAction } = await import('../db/database');

    insertAction({
      action_id: 'write-secret',
      session_id: 'sess2',
      tool_name: 'write_file',
      input_payload: JSON.stringify({ path: path.join(tmpDir, 'secret.txt'), content: 'data' }),
      status: 'pending',
      decision: 'pending',
    });

    const result = await approvePendingAction('write-secret');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/policy changed/i);
  });

  it('returns error for unsupported tool type', async () => {
    const { approvePendingAction } = await import('./handler');
    const { insertAction } = await import('../db/database');

    insertAction({
      action_id: 'bash-pending',
      session_id: 'sess3',
      tool_name: 'bash',
      input_payload: JSON.stringify({ command: 'ls' }),
      status: 'pending',
      decision: 'pending',
    });

    const result = await approvePendingAction('bash-pending');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported tool/i);
  });
});

// ─── rejectPendingAction ─────────────────────────────────────────────────────

describe('rejectPendingAction', () => {
  beforeEach(() => {
    setupTestDb();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it('returns error when action does not exist', async () => {
    const { rejectPendingAction } = await import('./handler');
    const result = await rejectPendingAction('ghost-id', 'no reason');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error when action is already rejected', async () => {
    const { rejectPendingAction } = await import('./handler');
    const { insertAction } = await import('../db/database');

    insertAction({
      action_id: 'already-rejected',
      session_id: 'sess4',
      tool_name: 'write_file',
      input_payload: JSON.stringify({ path: '/tmp/x.txt', content: 'x' }),
      status: 'rejected',
      decision: 'rejected',
    });

    const result = await rejectPendingAction('already-rejected', 'again');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not pending/i);
  });

  it('successfully rejects a pending action', async () => {
    const { rejectPendingAction } = await import('./handler');
    const { insertAction, getAction } = await import('../db/database');

    insertAction({
      action_id: 'to-reject',
      session_id: 'sess5',
      tool_name: 'write_file',
      input_payload: JSON.stringify({ path: '/tmp/y.txt', content: 'y' }),
      status: 'pending',
      decision: 'pending',
    });

    const result = await rejectPendingAction('to-reject', 'user said no');
    expect(result.success).toBe(true);

    const row = getAction('to-reject');
    expect(row?.status).toBe('rejected');
    expect(row?.rejected_reason).toBe('user said no');
  });
});
