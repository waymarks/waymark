/**
 * Express route handlers for the agent-monitor REST API.
 *
 * Mount in packages/server/src/api/server.ts:
 *
 *   import { createAgentMonitorRouter } from './routes/agent-monitor';
 *   app.use('/api/agent-monitor', createAgentMonitorRouter(collector));
 *
 * Endpoints:
 *   GET /api/agent-monitor/sessions          → all sessions (+ filter query params)
 *   GET /api/agent-monitor/sessions/:id      → single session detail (with toolCalls, fileAccesses)
 *   GET /api/agent-monitor/rate-limits       → Claude + Codex rate limits
 *   GET /api/agent-monitor/ports             → agent ports + orphan ports
 *   GET /api/agent-monitor/snapshot          → full snapshot (sessions + rateLimits + ports)
 */

import { Router, Request, Response } from 'express';
import { CollectorSnapshot } from '../../collectors/multi-collector';
import {
  agentHistoryExists,
  insertAgentHistory,
  getAgentHistory,
  isSessionWaymarkControlled,
} from '../../db/database';
import { emit } from '../events';

// ─── Port classification helpers ─────────────────────────────────────────────

const BROWSER_PORTS = new Set([3000, 3001, 3002, 4200, 5173, 5174, 8080, 8081, 8082]);
const API_PORTS = new Set([4000, 4001, 5000, 5001, 8000, 8888]);
const DB_PORTS = new Set([5432, 5433, 3306, 27017, 6379, 6380, 1521, 5984]);

function classifyPort(port: number): string {
  if (port < 1024) return 'system';
  if (BROWSER_PORTS.has(port)) return 'browser';
  if (API_PORTS.has(port) || (port >= 4000 && port <= 4999)) return 'api';
  if (DB_PORTS.has(port)) return 'db';
  return 'other';
}

function isPublicBinding(lsofName: string): boolean {
  return lsofName.startsWith('*:') || lsofName.startsWith('0.0.0.0:') || lsofName.startsWith(':::');
}

// ─── Session death tracker ────────────────────────────────────────────────────

let previousSessionIds = new Set<string>();
let previousSnapshotMap = new Map<string, import('../../collectors/types').AgentSession>();

function persistDeadSessions(snapshot: CollectorSnapshot): void {
  const currentIds = new Set(snapshot.sessions.map((s) => s.sessionId));

  for (const deadId of previousSessionIds) {
    if (!currentIds.has(deadId)) {
      const s = previousSnapshotMap.get(deadId);
      if (s && !agentHistoryExists(deadId)) {
        try {
          insertAgentHistory({
            session_id: s.sessionId,
            agent_cli: s.agentCli,
            pid: s.pid,
            cwd: s.cwd,
            project_name: s.projectName,
            started_at: s.startedAt,
            ended_at: Date.now(),
            final_status: s.status,
            total_input_tokens: s.totalInputTokens ?? 0,
            total_output_tokens: s.totalOutputTokens ?? 0,
            turn_count: s.turnCount ?? 0,
            compaction_count: s.compactionCount ?? 0,
            model: s.model,
            git_branch: s.gitBranch,
            initial_prompt: s.initialPrompt ? s.initialPrompt.slice(0, 2000) : null,
            waymark_controlled: isSessionWaymarkControlled(s.sessionId) ? 1 : 0,
          });
          emit('agents', { kind: 'session_died', session_id: deadId });
        } catch {
          // Non-fatal: history persistence is best-effort
        }
      }
    }
  }

  previousSessionIds = currentIds;
  previousSnapshotMap = new Map(snapshot.sessions.map((s) => [s.sessionId, s]));
}

// ─── Port binding lookup ──────────────────────────────────────────────────────

import { execSync } from 'child_process';

// Returns Map<port, lsofName> e.g. 3000 → "*:3000", 5432 → "127.0.0.1:5432"
// Best-effort: returns empty map on any failure.
function getPortBindings(): Map<number, string> {
  const result = new Map<number, string>();
  try {
    const out = execSync('lsof -i -P -n -sTCP:LISTEN', {
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 9) continue;
      const addr = cols[8] ?? '';
      const portStr = addr.split(':').pop();
      if (!portStr) continue;
      const port = parseInt(portStr, 10);
      if (!isNaN(port) && !result.has(port)) result.set(port, addr);
    }
  } catch { /* lsof unavailable or timed out */ }
  return result;
}

// ─── Router factory ───────────────────────────────────────────────────────────

/**
 * Create an Express router for the agent-monitor endpoints.
 *
 * @param getSnapshot  Function that returns the latest CollectorSnapshot.
 *                     Pass `() => collector.tick()` for on-demand collection,
 *                     or `() => lastSnapshot` for a cached snapshot from a timer.
 */
export function createAgentMonitorRouter(
  getSnapshot: () => CollectorSnapshot,
): Router {
  const router = Router();

  // ── GET /sessions ──────────────────────────────────────────────────────────
  router.get('/sessions', (_req: Request, res: Response) => {
    const snapshot = getSnapshot();
    let sessions = snapshot.sessions;

    const agent = _req.query['agent'] as string | undefined;
    const status = _req.query['status'] as string | undefined;

    if (agent && agent !== 'all') {
      sessions = sessions.filter((s) => s.agentCli === agent);
    }
    if (status && status !== 'all') {
      if (status === 'active') {
        sessions = sessions.filter((s) => s.status === 'thinking' || s.status === 'executing');
      } else {
        sessions = sessions.filter((s) => s.status === status);
      }
    }

    res.json({
      sessions: sessions.map(sessionSummary),
      count: sessions.length,
      collectedAt: snapshot.collectedAt,
    });
  });

  // ── GET /sessions/:id ──────────────────────────────────────────────────────
  router.get('/sessions/:id', (req: Request, res: Response) => {
    const snapshot = getSnapshot();
    const session = snapshot.sessions.find((s) => s.sessionId === req.params['id']);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    // Full detail including toolCalls and fileAccesses
    res.json({ session: sessionDetail(session), collectedAt: snapshot.collectedAt });
  });

  // ── GET /rate-limits ───────────────────────────────────────────────────────
  router.get('/rate-limits', (_req: Request, res: Response) => {
    const snapshot = getSnapshot();
    res.json({
      rateLimits: snapshot.rateLimits.map((r) => ({
        source: r.source,
        fiveHour: r.fiveHourPct != null ? {
          usedPercent: r.fiveHourPct,
          resetsAt: r.fiveHourResetsAt,
          resetsAtIso: r.fiveHourResetsAt
            ? new Date(r.fiveHourResetsAt * 1000).toISOString()
            : undefined,
        } : null,
        sevenDay: r.sevenDayPct != null ? {
          usedPercent: r.sevenDayPct,
          resetsAt: r.sevenDayResetsAt,
          resetsAtIso: r.sevenDayResetsAt
            ? new Date(r.sevenDayResetsAt * 1000).toISOString()
            : undefined,
        } : null,
        updatedAt: r.updatedAt,
        updatedAtIso: r.updatedAt
          ? new Date(r.updatedAt * 1000).toISOString()
          : undefined,
      })),
      collectedAt: snapshot.collectedAt,
    });
  });

  // ── GET /ports ─────────────────────────────────────────────────────────────
  router.get('/ports', (_req: Request, res: Response) => {
    const snapshot = getSnapshot();
    const bindings = getPortBindings();

    const agentPorts: Array<{
      sessionId: string;
      agentCli: string;
      pid: number;
      port: number;
      command: string;
      category: string;
      isPublic: boolean;
    }> = [];

    for (const s of snapshot.sessions) {
      for (const child of s.children) {
        if (child.port != null) {
          const lsofName = bindings.get(child.port) ?? '';
          agentPorts.push({
            sessionId: s.sessionId,
            agentCli: s.agentCli,
            pid: child.pid,
            port: child.port,
            command: child.command,
            category: classifyPort(child.port),
            isPublic: lsofName ? isPublicBinding(lsofName) : false,
          });
        }
      }
    }

    const orphanPorts = snapshot.orphanPorts.map((o) => {
      const lsofName = bindings.get(o.port) ?? '';
      return {
        ...o,
        category: classifyPort(o.port),
        isPublic: lsofName ? isPublicBinding(lsofName) : false,
      };
    });

    res.json({
      agentPorts,
      orphanPorts,
      collectedAt: snapshot.collectedAt,
    });
  });

  // ── POST /sessions/:id/pause ───────────────────────────────────────────────
  router.post('/sessions/:id/pause', (req: Request, res: Response) => {
    const snapshot = getSnapshot();
    const session = snapshot.sessions.find((s) => s.sessionId === req.params['id']);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    if (!session.pid) { res.status(400).json({ error: 'Session has no PID' }); return; }
    try {
      process.kill(session.pid, 'SIGSTOP');
      res.json({ success: true, action: 'paused', pid: session.pid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── POST /sessions/:id/resume ──────────────────────────────────────────────
  router.post('/sessions/:id/resume', (req: Request, res: Response) => {
    const snapshot = getSnapshot();
    const session = snapshot.sessions.find((s) => s.sessionId === req.params['id']);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    if (!session.pid) { res.status(400).json({ error: 'Session has no PID' }); return; }
    try {
      process.kill(session.pid, 'SIGCONT');
      res.json({ success: true, action: 'resumed', pid: session.pid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── GET /snapshot ──────────────────────────────────────────────────────────
  // Returns the raw `CollectorSnapshot` enriched with `isWaymarkControlled`
  // per session and `category`/`isPublic` on orphan ports. Two consumers depend
  // on this: (1) the MCP process's `fetchSnapshotFromApi()`; (2) the web
  // dashboard's `useAgentSnapshot()` hook.
  router.get('/snapshot', (_req: Request, res: Response) => {
    const snapshot = getSnapshot();
    persistDeadSessions(snapshot);

    const bindings = getPortBindings();

    const sessions = snapshot.sessions.map((s) => ({
      ...s,
      isWaymarkControlled: isSessionWaymarkControlled(s.sessionId),
    }));

    const orphanPorts = snapshot.orphanPorts.map((o) => {
      const lsofName = bindings.get(o.port) ?? '';
      return {
        ...o,
        category: classifyPort(o.port),
        isPublic: lsofName ? isPublicBinding(lsofName) : false,
      };
    });

    res.json({
      sessions,
      rateLimits: snapshot.rateLimits,
      orphanPorts,
      collectedAt: snapshot.collectedAt,
    });
  });

  // ── DELETE /ports/:pid ─────────────────────────────────────────────────────
  router.delete('/ports/:pid', (req: Request, res: Response) => {
    const pid = parseInt(req.params['pid'] ?? '', 10);
    if (isNaN(pid) || pid <= 0) {
      res.status(400).json({ error: 'Invalid PID' });
      return;
    }
    try {
      process.kill(pid, 'SIGTERM');
      setTimeout(() => {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
      }, 2000);
      res.json({ success: true, pid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── GET /history ───────────────────────────────────────────────────────────
  router.get('/history', (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query['limit'] as string ?? '100', 10) || 100, 500);
    const agent = req.query['agent'] as string | undefined;
    const project = req.query['project'] as string | undefined;

    const rows = getAgentHistory({ limit, agentCli: agent, projectName: project });
    const history = rows.map((r) => ({
      sessionId: r.session_id,
      agentCli: r.agent_cli,
      pid: r.pid,
      cwd: r.cwd,
      projectName: r.project_name,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      finalStatus: r.final_status,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      turnCount: r.turn_count,
      compactionCount: r.compaction_count,
      model: r.model,
      gitBranch: r.git_branch,
      initialPrompt: r.initial_prompt,
      waymarkControlled: r.waymark_controlled === 1,
    }));
    res.json({ history, total: history.length });
  });

  return router;
}

// ─── Serialisation helpers ────────────────────────────────────────────────────

import { AgentSession } from '../../collectors/types';

function sessionSummary(s: AgentSession): Record<string, unknown> {
  return {
    agentCli: s.agentCli,
    pid: s.pid,
    sessionId: s.sessionId,
    cwd: s.cwd,
    projectName: s.projectName,
    startedAt: s.startedAt,
    startedAtIso: new Date(s.startedAt).toISOString(),
    status: s.status,
    model: s.model,
    effort: s.effort || undefined,
    contextPercent: Math.round(s.contextPercent * 10) / 10,
    contextWindow: s.contextWindow,
    tokens: {
      input: s.totalInputTokens,
      output: s.totalOutputTokens,
      cacheRead: s.totalCacheRead,
      cacheCreate: s.totalCacheCreate,
      total: s.totalInputTokens + s.totalOutputTokens + s.totalCacheRead + s.totalCacheCreate,
    },
    turnCount: s.turnCount,
    currentTasks: s.currentTasks,
    memMb: s.memMb,
    version: s.version || undefined,
    git: {
      branch: s.gitBranch || undefined,
      added: s.gitAdded,
      modified: s.gitModified,
    },
    initialPrompt: s.initialPrompt || undefined,
    subagentCount: s.subagents.length,
    childCount: s.children.length,
  };
}

function sessionDetail(s: AgentSession): Record<string, unknown> {
  return {
    ...sessionSummary(s),
    subagents: s.subagents,
    children: s.children,
    toolCalls: s.toolCalls,
    fileAccesses: s.fileAccesses,
    tokenHistory: s.tokenHistory,
    contextHistory: s.contextHistory,
    compactionCount: s.compactionCount,
    memFileCount: s.memFileCount,
    memLineCount: s.memLineCount,
    pendingSinceMs: s.pendingSinceMs,
    thinkingSinceMs: s.thinkingSinceMs,
    firstAssistantText: s.firstAssistantText || undefined,
  };
}
