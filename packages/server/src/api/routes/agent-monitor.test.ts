import express from 'express';
import http from 'http';
import { createAgentMonitorRouter } from './agent-monitor';
import { CollectorSnapshot } from '../../collectors/multi-collector';
import { AgentSession } from '../../collectors/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    agentCli: 'claude',
    pid: 1234,
    sessionId: 'ses-abc',
    cwd: '/home/user/project',
    projectName: 'project',
    startedAt: Date.now() - 120_000,
    status: 'thinking',
    model: 'claude-sonnet-4-6',
    effort: '',
    contextPercent: 42.5,
    totalInputTokens: 1000,
    totalOutputTokens: 200,
    totalCacheRead: 50,
    totalCacheCreate: 10,
    turnCount: 5,
    currentTasks: ['write code'],
    memMb: 256,
    version: '1.2.3',
    gitBranch: 'main',
    gitAdded: 3,
    gitModified: 1,
    tokenHistory: [100, 200, 300],
    contextHistory: [10, 20, 30],
    compactionCount: 0,
    contextWindow: 200_000,
    subagents: [],
    memFileCount: 2,
    memLineCount: 40,
    children: [{ pid: 5678, command: 'node', memKb: 10240, port: 3000 }],
    initialPrompt: 'please write a function',
    firstAssistantText: 'Sure, here is...',
    toolCalls: [{ name: 'Read', arg: 'src/index.ts', durationMs: 5 }],
    pendingSinceMs: 0,
    thinkingSinceMs: Date.now() - 2000,
    fileAccesses: [{ path: 'src/index.ts', operation: 'Read', turnIndex: 1 }],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<CollectorSnapshot> = {}): CollectorSnapshot {
  return {
    sessions: [makeSession()],
    rateLimits: [
      { source: 'claude', fiveHourPct: 30, fiveHourResetsAt: Math.floor(Date.now() / 1000) + 3600, updatedAt: Math.floor(Date.now() / 1000) },
    ],
    orphanPorts: [{ port: 8080, pid: 9999, command: 'node', projectName: 'old-project' }],
    collectedAt: Date.now(),
    ...overrides,
  };
}

async function jsonGet(server: http.Server, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('createAgentMonitorRouter', () => {
  let server: http.Server;
  let snapshot: CollectorSnapshot;

  beforeEach(async () => {
    snapshot = makeSnapshot();
    const app = express();
    app.use('/api/agent-monitor', createAgentMonitorRouter(() => snapshot));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ── GET /sessions ─────────────────────────────────────────────────────────

  it('GET /sessions returns all sessions', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/sessions');
    expect(status).toBe(200);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.count).toBe(1);
    expect(body.sessions[0].sessionId).toBe('ses-abc');
    expect(body.sessions[0].agentCli).toBe('claude');
  });

  it('GET /sessions filters by agent=codex returns empty', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/sessions?agent=codex');
    expect(status).toBe(200);
    expect(body.count).toBe(0);
    expect(body.sessions).toHaveLength(0);
  });

  it('GET /sessions filters by agent=claude returns session', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/sessions?agent=claude');
    expect(status).toBe(200);
    expect(body.count).toBe(1);
  });

  it('GET /sessions filters by status=active returns thinking session', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/sessions?status=active');
    expect(status).toBe(200);
    expect(body.count).toBe(1);
  });

  it('GET /sessions filters by status=done returns empty', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/sessions?status=done');
    expect(status).toBe(200);
    expect(body.count).toBe(0);
  });

  // ── GET /sessions/:id ──────────────────────────────────────────────────────

  it('GET /sessions/:id returns session detail', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/sessions/ses-abc');
    expect(status).toBe(200);
    expect(body.session.sessionId).toBe('ses-abc');
    expect(Array.isArray(body.session.toolCalls)).toBe(true);
    expect(Array.isArray(body.session.fileAccesses)).toBe(true);
    expect(Array.isArray(body.session.tokenHistory)).toBe(true);
  });

  it('GET /sessions/:id returns 404 for unknown session', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/sessions/no-such-session');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });

  // ── GET /rate-limits ───────────────────────────────────────────────────────

  it('GET /rate-limits returns rate limit data', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/rate-limits');
    expect(status).toBe(200);
    expect(Array.isArray(body.rateLimits)).toBe(true);
    expect(body.rateLimits[0].source).toBe('claude');
    expect(body.rateLimits[0].fiveHour.usedPercent).toBe(30);
    expect(typeof body.rateLimits[0].fiveHour.resetsAtIso).toBe('string');
  });

  // ── GET /ports ─────────────────────────────────────────────────────────────

  it('GET /ports returns agent ports and orphan ports', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/ports');
    expect(status).toBe(200);
    expect(Array.isArray(body.agentPorts)).toBe(true);
    expect(Array.isArray(body.orphanPorts)).toBe(true);
    // The session has one child with port 3000
    expect(body.agentPorts).toHaveLength(1);
    expect(body.agentPorts[0].port).toBe(3000);
    expect(body.agentPorts[0].sessionId).toBe('ses-abc');
    // Orphan port from snapshot
    expect(body.orphanPorts).toHaveLength(1);
    expect(body.orphanPorts[0].port).toBe(8080);
  });

  it('GET /ports returns empty agentPorts when no children have ports', async () => {
    snapshot = makeSnapshot({
      sessions: [makeSession({ children: [] })],
      orphanPorts: [],
    });
    const { status, body } = await jsonGet(server, '/api/agent-monitor/ports');
    expect(status).toBe(200);
    expect(body.agentPorts).toHaveLength(0);
    expect(body.orphanPorts).toHaveLength(0);
  });

  // ── GET /snapshot ──────────────────────────────────────────────────────────

  it('GET /snapshot returns combined snapshot', async () => {
    const { status, body } = await jsonGet(server, '/api/agent-monitor/snapshot');
    expect(status).toBe(200);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(Array.isArray(body.rateLimits)).toBe(true);
    expect(Array.isArray(body.orphanPorts)).toBe(true);
    expect(typeof body.collectedAt).toBe('number');
  });

  it('GET /snapshot returns raw AgentSession shape (regression — MCP handlers depend on this)', async () => {
    // The MCP process fetches this endpoint and its handlers walk raw fields:
    // `s.totalInputTokens`, `s.subagents.length`, `s.children`, etc. If `/snapshot`
    // is ever changed back to running sessions through `sessionSummary()`, those
    // handlers crash with "Cannot read properties of undefined". The web's
    // `AgentSession` TS type expects the same raw shape, so this test guards
    // both consumers in one place.
    const { body } = await jsonGet(server, '/api/agent-monitor/snapshot');
    const s = body.sessions[0];
    expect(s).toBeDefined();
    // Raw token fields (NOT nested under `tokens.*`)
    expect(typeof s.totalInputTokens).toBe('number');
    expect(typeof s.totalOutputTokens).toBe('number');
    // Raw git fields (NOT nested under `git.*`)
    expect(typeof s.gitBranch).toBe('string');
    expect(typeof s.gitAdded).toBe('number');
    // Real arrays, not `*Count` summaries
    expect(Array.isArray(s.subagents)).toBe(true);
    expect(Array.isArray(s.children)).toBe(true);
    expect(Array.isArray(s.toolCalls)).toBe(true);
    expect(Array.isArray(s.fileAccesses)).toBe(true);
  });
});
