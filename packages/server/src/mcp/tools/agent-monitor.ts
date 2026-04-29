/**
 * MCP tools for agent monitoring.
 *
 * Registers three read-only MCP tools into an existing waymark MCP server:
 *   - list_agent_sessions  → all live Claude + Codex sessions
 *   - get_rate_limits      → Claude + Codex rate limit windows
 *   - get_agent_ports      → ports spawned by agents + orphan ports
 *
 * Drop-in integration for packages/server/src/mcp/server.ts:
 *
 *   import { registerAgentMonitorTools } from './tools/agent-monitor';
 *   registerAgentMonitorTools(server, collector);
 *
 * where `collector` is a shared MultiCollector instance.
 */

import { CollectorSnapshot } from '../../collectors/multi-collector';
import { AgentSession, OrphanPort, RateLimitInfo } from '../../collectors/types';

// ─── Tool definitions ─────────────────────────────────────────────────────────

const LIST_AGENT_SESSIONS_TOOL = {
  name: 'list_agent_sessions',
  description:
    'List all currently running (and recently finished) AI agent sessions on this machine. ' +
    'Returns Claude Code and Codex CLI sessions with token usage, context window %, status, ' +
    'current task, git stats, and child processes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      agentFilter: {
        type: 'string',
        enum: ['all', 'claude', 'codex'],
        description: 'Filter by agent type. Default: "all".',
      },
      statusFilter: {
        type: 'string',
        enum: ['all', 'active', 'waiting', 'done'],
        description: 'Filter by session status. Default: "all".',
      },
    },
    required: [],
  },
};

const GET_RATE_LIMITS_TOOL = {
  name: 'get_rate_limits',
  description:
    'Get Claude Code and Codex CLI rate limit usage for this machine. ' +
    'Returns 5-hour and 7-day window percentages and reset timestamps. ' +
    'Claude data requires the StatusLine hook (run `waymark --setup` to install).',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

const GET_AGENT_PORTS_TOOL = {
  name: 'get_agent_ports',
  description:
    'List TCP ports opened by AI agent child processes. ' +
    'Also reports orphan ports — ports held by processes whose parent agent session has ended.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Tool definitions to merge into the existing ListToolsRequestSchema response.
 *
 * Integration in packages/server/src/mcp/server.ts:
 *
 *   import { AGENT_MONITOR_TOOL_DEFINITIONS, handleAgentMonitorToolCall } from './tools/agent-monitor';
 *
 *   // In ListToolsRequestSchema handler:
 *   tools: [...existingTools, ...AGENT_MONITOR_TOOL_DEFINITIONS]
 *
 *   // In CallToolRequestSchema handler:
 *   const handled = await handleAgentMonitorToolCall(name, args, () => latestSnapshot);
 *   if (handled) return handled;
 */
export const AGENT_MONITOR_TOOL_DEFINITIONS = [
  LIST_AGENT_SESSIONS_TOOL,
  GET_RATE_LIMITS_TOOL,
  GET_AGENT_PORTS_TOOL,
];

/**
 * Fetch the current snapshot from the sibling API process.
 * Returns an empty snapshot when the API isn't reachable (e.g. the MCP server
 * was started without `waymark start`). Callers should not have to special-case
 * the offline path — the agent just sees an empty session list.
 */
export async function fetchSnapshotFromApi(
  port: number,
  fetchFn: typeof fetch = fetch,
): Promise<CollectorSnapshot> {
  const url = `http://127.0.0.1:${port}/api/agent-monitor/snapshot`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    const res = await fetchFn(url, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return emptySnapshot();
    const body = await res.json() as { sessions?: AgentSession[]; rateLimits?: RateLimitInfo[]; orphanPorts?: OrphanPort[]; collectedAt?: number };
    return {
      sessions: body.sessions ?? [],
      rateLimits: body.rateLimits ?? [],
      orphanPorts: body.orphanPorts ?? [],
      collectedAt: body.collectedAt ?? Date.now(),
    };
  } catch {
    return emptySnapshot();
  }
}

function emptySnapshot(): CollectorSnapshot {
  return { sessions: [], rateLimits: [], orphanPorts: [], collectedAt: Date.now() };
}

/**
 * Handle a tool call for one of the agent-monitor tools.
 * Call this from within the existing CallToolRequestSchema handler:
 *
 *   const handled = await handleAgentMonitorToolCall(name, args, getSnapshot);
 *   if (handled) return handled;
 *   // ... existing tool dispatch ...
 */
/**
 * `getSnapshot` may be sync or async. The API process supplies a sync getter
 * over its in-process `MultiCollector`; the MCP process supplies an async
 * fetcher that hits the API's `/api/agent-monitor/snapshot` endpoint, so the
 * two processes share a single source of truth instead of running parallel
 * collectors with drifting data.
 */
export async function handleAgentMonitorToolCall(
  name: string,
  args: Record<string, unknown>,
  getSnapshot: () => CollectorSnapshot | Promise<CollectorSnapshot>,
): Promise<{ content: Array<{ type: 'text'; text: string }> } | null> {
  if (name === 'list_agent_sessions') {
    const snapshot = await getSnapshot();
    return handleListAgentSessions(args, snapshot);
  }
  if (name === 'get_rate_limits') {
    const snapshot = await getSnapshot();
    return handleGetRateLimits(snapshot);
  }
  if (name === 'get_agent_ports') {
    const snapshot = await getSnapshot();
    return handleGetAgentPorts(snapshot);
  }
  return null;
}

// ─── Tool handlers ─────────────────────────────────────────────────────────────

function handleListAgentSessions(
  args: Record<string, unknown>,
  snapshot: CollectorSnapshot,
): { content: Array<{ type: 'text'; text: string }> } {
  const agentFilter = (args['agentFilter'] as string) || 'all';
  const statusFilter = (args['statusFilter'] as string) || 'all';

  let sessions = snapshot.sessions;

  if (agentFilter !== 'all') {
    sessions = sessions.filter((s) => s.agentCli === agentFilter);
  }
  if (statusFilter !== 'all') {
    if (statusFilter === 'active') {
      sessions = sessions.filter((s) => s.status === 'thinking' || s.status === 'executing');
    } else {
      sessions = sessions.filter((s) => s.status === statusFilter);
    }
  }

  const data = sessions.map(sessionToJson);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ sessions: data, count: data.length, collectedAt: snapshot.collectedAt }, null, 2),
    }],
  };
}

function handleGetRateLimits(
  snapshot: CollectorSnapshot,
): { content: Array<{ type: 'text'; text: string }> } {
  const limits = snapshot.rateLimits.map(rateLimitToJson);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ rateLimits: limits, collectedAt: snapshot.collectedAt }, null, 2),
    }],
  };
}

function handleGetAgentPorts(
  snapshot: CollectorSnapshot,
): { content: Array<{ type: 'text'; text: string }> } {
  // Gather ports from all sessions' children
  const agentPorts: Array<{ sessionId: string; agentCli: string; pid: number; port: number; command: string }> = [];
  for (const session of snapshot.sessions) {
    for (const child of session.children) {
      if (child.port != null) {
        agentPorts.push({
          sessionId: session.sessionId,
          agentCli: session.agentCli,
          pid: child.pid,
          port: child.port,
          command: child.command,
        });
      }
    }
  }

  const orphanPorts = snapshot.orphanPorts.map(orphanToJson);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        agentPorts,
        orphanPorts,
        collectedAt: snapshot.collectedAt,
      }, null, 2),
    }],
  };
}

// ─── JSON serialisers ─────────────────────────────────────────────────────────

function sessionToJson(s: AgentSession): Record<string, unknown> {
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
    subagents: s.subagents.length > 0 ? s.subagents : undefined,
    children: s.children.length > 0 ? s.children.map((c) => ({
      pid: c.pid,
      command: c.command,
      memKb: c.memKb,
      port: c.port,
    })) : undefined,
    // Omit toolCalls, fileAccesses, and token history from MCP output to keep responses compact.
    // Access them via the REST API if needed.
  };
}

function rateLimitToJson(r: RateLimitInfo): Record<string, unknown> {
  return {
    source: r.source,
    fiveHour: r.fiveHourPct != null ? {
      usedPercent: r.fiveHourPct,
      resetsAt: r.fiveHourResetsAt,
      resetsAtIso: r.fiveHourResetsAt ? new Date(r.fiveHourResetsAt * 1000).toISOString() : undefined,
    } : null,
    sevenDay: r.sevenDayPct != null ? {
      usedPercent: r.sevenDayPct,
      resetsAt: r.sevenDayResetsAt,
      resetsAtIso: r.sevenDayResetsAt ? new Date(r.sevenDayResetsAt * 1000).toISOString() : undefined,
    } : null,
    updatedAt: r.updatedAt,
    updatedAtIso: r.updatedAt ? new Date(r.updatedAt * 1000).toISOString() : undefined,
  };
}

function orphanToJson(o: OrphanPort): Record<string, unknown> {
  return {
    port: o.port,
    pid: o.pid,
    command: o.command,
    projectName: o.projectName,
  };
}
