import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  jest.resetModules();
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
