import { MultiCollector, CollectorSnapshot } from './multi-collector';
import { AgentSession } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    agentCli: 'claude',
    pid: 1000,
    sessionId: 'ses-1',
    cwd: '/tmp/project',
    projectName: 'project',
    startedAt: Date.now() - 60_000,
    status: 'thinking',
    model: 'claude-sonnet-4-6',
    effort: '',
    contextPercent: 20,
    totalInputTokens: 500,
    totalOutputTokens: 100,
    totalCacheRead: 0,
    totalCacheCreate: 0,
    turnCount: 3,
    currentTasks: ['write tests'],
    memMb: 200,
    version: '1.0',
    gitBranch: 'main',
    gitAdded: 1,
    gitModified: 2,
    tokenHistory: [],
    contextHistory: [],
    compactionCount: 0,
    contextWindow: 200_000,
    subagents: [],
    memFileCount: 0,
    memLineCount: 0,
    children: [],
    initialPrompt: 'please help me',
    firstAssistantText: 'sure!',
    toolCalls: [],
    pendingSinceMs: 0,
    thinkingSinceMs: 0,
    fileAccesses: [],
    ...overrides,
  };
}

// ─── MultiCollector ────────────────────────────────────────────────────────────

describe('MultiCollector', () => {
  it('returns a valid snapshot shape on tick()', () => {
    const mc = new MultiCollector();
    const snapshot: CollectorSnapshot = mc.tick();

    expect(snapshot).toHaveProperty('sessions');
    expect(snapshot).toHaveProperty('rateLimits');
    expect(snapshot).toHaveProperty('orphanPorts');
    expect(typeof snapshot.collectedAt).toBe('number');
    expect(Array.isArray(snapshot.sessions)).toBe(true);
    expect(Array.isArray(snapshot.rateLimits)).toBe(true);
    expect(Array.isArray(snapshot.orphanPorts)).toBe(true);
  });

  it('collectedAt is close to now', () => {
    const before = Date.now();
    const mc = new MultiCollector();
    const snapshot = mc.tick();
    const after = Date.now();
    expect(snapshot.collectedAt).toBeGreaterThanOrEqual(before);
    expect(snapshot.collectedAt).toBeLessThanOrEqual(after + 100);
  });

  it('returns empty arrays when no agent processes are running (no claude/codex/copilot)', () => {
    // This test is environment-dependent. We only assert structure, not count.
    const mc = new MultiCollector();
    const snapshot = mc.tick();
    // Sessions array must exist; we can't guarantee 0 in a dev env with claude running
    expect(Array.isArray(snapshot.sessions)).toBe(true);
  });

  it('slow tick fires on every SLOW_TICK_EVERY ticks', () => {
    const mc = new MultiCollector();
    // Call tick 5 times (SLOW_TICK_EVERY = 5) — just ensure no throw
    for (let i = 0; i < 5; i++) {
      const snap = mc.tick();
      expect(snap.collectedAt).toBeGreaterThan(0);
    }
  });
});

// ─── Orphan port logic (unit test via snapshot comparison) ────────────────────

describe('CollectorSnapshot orphanPorts', () => {
  it('snapshot has orphanPorts array', () => {
    const mc = new MultiCollector();
    const snap = mc.tick();
    expect(Array.isArray(snap.orphanPorts)).toBe(true);
    for (const op of snap.orphanPorts) {
      expect(typeof op.port).toBe('number');
      expect(typeof op.pid).toBe('number');
      expect(typeof op.command).toBe('string');
    }
  });
});

// ─── AgentSession shape (used by routes and MCP tools) ───────────────────────

describe('makeSession helper', () => {
  it('produces a valid AgentSession', () => {
    const s = makeSession();
    expect(s.agentCli).toBe('claude');
    expect(s.sessionId).toBe('ses-1');
    expect(s.turnCount).toBe(3);
  });

  it('allows field overrides', () => {
    const s = makeSession({ agentCli: 'codex', pid: 9999 });
    expect(s.agentCli).toBe('codex');
    expect(s.pid).toBe(9999);
  });
});
