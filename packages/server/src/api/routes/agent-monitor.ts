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

    const agentPorts: Array<{
      sessionId: string;
      agentCli: string;
      pid: number;
      port: number;
      command: string;
    }> = [];

    for (const s of snapshot.sessions) {
      for (const child of s.children) {
        if (child.port != null) {
          agentPorts.push({
            sessionId: s.sessionId,
            agentCli: s.agentCli,
            pid: child.pid,
            port: child.port,
            command: child.command,
          });
        }
      }
    }

    res.json({
      agentPorts,
      orphanPorts: snapshot.orphanPorts,
      collectedAt: snapshot.collectedAt,
    });
  });

  // ── GET /snapshot ──────────────────────────────────────────────────────────
  // Returns the raw `CollectorSnapshot`. Two consumers depend on this exact
  // shape: (1) the MCP process's `fetchSnapshotFromApi()`, whose handlers walk
  // `s.subagents.length`, `s.children`, `s.totalInputTokens`, etc.; (2) the web
  // dashboard's `useAgentSnapshot()` hook, whose `AgentSession` TS type is the
  // raw `collectors/types.ts` shape. Earlier versions ran sessions through
  // `sessionSummary()` here, which collapsed `subagents` → `subagentCount` and
  // `tokens.input` etc. — silently breaking both consumers (the web limped
  // along on `?? 0` guards; the MCP crashed on the missing arrays). The slim
  // summary shape lives on `/sessions` for the CLI's table view.
  router.get('/snapshot', (_req: Request, res: Response) => {
    const snapshot = getSnapshot();
    res.json({
      sessions: snapshot.sessions,
      rateLimits: snapshot.rateLimits,
      orphanPorts: snapshot.orphanPorts,
      collectedAt: snapshot.collectedAt,
    });
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
