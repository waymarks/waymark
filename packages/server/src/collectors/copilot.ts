/**
 * GitHub Copilot CLI session collector.
 *
 * Reads rich session data from ~/.copilot/session-state/<uuid>/:
 *   - workspace.yaml    — sessionId, cwd, branch, summary (= current task)
 *   - inuse.<pid>.lock  — active PID
 *   - events.jsonl      — model, output tokens, tool calls, turn count
 *
 * Event types parsed:
 *   session.start              → startedAt, initial context
 *   session.model_change       → current model name
 *   session.compaction_complete → preCompactionTokens (context window usage)
 *   assistant.message          → outputTokens per turn
 *   assistant.turn_end         → turn count
 *   tool.execution_start       → tool calls (name, arg)
 *   user.message               → last user prompt (current task)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AgentSession,
  ChildProcess,
  ProcInfo,
  SessionStatus,
  ToolCall,
  contextWindowForModel,
} from './types';
import { hasActiveDescendant } from './process';
import { collectGitStats } from './process';

// ─── workspace.yaml parser ────────────────────────────────────────────────────

interface WorkspaceMeta {
  id: string;
  cwd: string;
  git_root: string;
  repository: string;
  branch: string;
  summary: string;
  created_at: string;
}

/** Minimal flat-YAML parser for Copilot CLI workspace.yaml. */
function parseWorkspaceYaml(filePath: string): WorkspaceMeta | null {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const result: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const idx = line.indexOf(': ');
      if (idx === -1) continue;
      result[line.slice(0, idx).trim()] = line.slice(idx + 2).trim();
    }
    if (!result['id'] || !result['cwd']) return null;
    return result as unknown as WorkspaceMeta;
  } catch {
    return null;
  }
}

// ─── events.jsonl parser ──────────────────────────────────────────────────────

interface EventsResult {
  model: string;
  startedAt: number;
  totalOutputTokens: number;
  /** Tokens in context at last compaction event. */
  contextTokens: number;
  compactionCount: number;
  turnCount: number;
  toolCalls: ToolCall[];
  /** Most recent user message content. */
  currentTask: string;
  lastActivityMs: number;
  lastUserMsgMs: number;
  lastAssistantMsgMs: number;
  /** toolCallId of an in-flight tool (cleared on tool.execution_complete). */
  pendingToolCallId: string | null;
  /** Byte offset after the last fully-parsed newline. */
  newOffset: number;
}

interface EventsCache {
  [sessionId: string]: EventsResult;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyEvents(acc: EventsResult, events: any[]): void {
  for (const e of events) {
    const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0;
    const data = e.data ?? {};

    switch (e.type) {
      case 'session.start':
        if (acc.startedAt === 0) {
          acc.startedAt = new Date(data.startTime ?? e.timestamp ?? Date.now()).getTime();
        }
        break;

      case 'session.model_change':
        if (data.newModel) acc.model = data.newModel;
        break;

      case 'session.compaction_complete':
        if (data.preCompactionTokens) {
          acc.contextTokens = data.preCompactionTokens as number;
          acc.compactionCount++;
        }
        break;

      case 'assistant.message':
        if (data.outputTokens) acc.totalOutputTokens += data.outputTokens as number;
        if (ts) { acc.lastAssistantMsgMs = ts; acc.lastActivityMs = ts; }
        acc.pendingToolCallId = null;
        break;

      case 'assistant.turn_end':
        acc.turnCount++;
        if (ts) acc.lastActivityMs = ts;
        break;

      case 'tool.execution_start': {
        const rawName: string = data.toolName ?? '';
        const toolName = rawName.includes('.') ? rawName.split('.').pop() ?? rawName : rawName;
        const args = data.arguments ?? {};
        const rawArg = args.path ?? args.command ?? args.pattern ?? args.query ?? args.url ?? '';
        const tc: ToolCall = {
          name: toolName || 'unknown',
          arg: typeof rawArg === 'string' ? rawArg.slice(0, 120) : '',
          durationMs: 0,
        };
        acc.toolCalls.push(tc);
        if (acc.toolCalls.length > 200) acc.toolCalls = acc.toolCalls.slice(-200);
        if (ts) acc.lastActivityMs = ts;
        acc.pendingToolCallId = data.toolCallId ?? null;
        break;
      }

      case 'tool.execution_complete':
        if (ts) acc.lastActivityMs = ts;
        acc.pendingToolCallId = null;
        break;

      case 'user.message': {
        const content: string = data.content ?? '';
        if (content.trim()) acc.currentTask = content.trim().slice(0, 200);
        if (ts) { acc.lastUserMsgMs = ts; acc.lastActivityMs = ts; }
        break;
      }
    }
  }
}

/** Read new lines from a JSONL file starting at startOffset. */
function readEventsFrom(
  filePath: string,
  startOffset: number,
): { events: unknown[]; newOffset: number } {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= startOffset) return { events: [], newOffset: startOffset };

    const fd = fs.openSync(filePath, 'r');
    const bufSize = stat.size - startOffset;
    const buf = Buffer.alloc(bufSize);
    const bytesRead = fs.readSync(fd, buf, 0, bufSize, startOffset);
    fs.closeSync(fd);

    const text = buf.slice(0, bytesRead).toString('utf8');
    const lastNl = text.lastIndexOf('\n');
    if (lastNl === -1) return { events: [], newOffset: startOffset };

    const chunk = text.slice(0, lastNl);
    const newOffset = startOffset + Buffer.byteLength(chunk + '\n', 'utf8');
    const events: unknown[] = [];
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
    return { events, newOffset };
  } catch {
    return { events: [], newOffset: startOffset };
  }
}

// ─── Collector class ──────────────────────────────────────────────────────────

export class CopilotCollector {
  private eventsCache: EventsCache = {};

  /**
   * @param sessionsDir  Directory holding `<uuid>/` per-session subdirs.
   *                     Defaults to `~/.copilot/session-state` (Copilot CLI's
   *                     real location); tests can pass a fixture path.
   */
  constructor(private readonly sessionsDir: string = path.join(os.homedir(), '.copilot', 'session-state')) {}

  /**
   * Collect all live GitHub Copilot CLI sessions.
   *
   * Discovery uses lock files at <sessionsDir>/{uuid}/inuse.{PID}.lock rather
   * than scanning the ps snapshot, giving us access to rich session data.
   *
   * @param processInfo  Current ps snapshot (pid to ProcInfo)
   * @param childrenMap  Parent to children adjacency
   * @param ports        pid to listening port list
   * @param gitMap       cwd to {added, modified}
   */
  collect(
    processInfo: Map<number, ProcInfo>,
    childrenMap: Map<number, number[]>,
    ports: Map<number, number[]>,
    gitMap: Map<string, { added: number; modified: number }>,
  ): AgentSession[] {
    const sessionsDir = this.sessionsDir;
    if (!fs.existsSync(sessionsDir)) return [];

    const sessions: AgentSession[] = [];
    let sessionDirs: string[];
    try {
      sessionDirs = fs.readdirSync(sessionsDir);
    } catch {
      return [];
    }

    for (const dirName of sessionDirs) {
      const sessionDir = path.join(sessionsDir, dirName);
      const session = this.loadSession(sessionDir, processInfo, childrenMap, ports, gitMap);
      if (session) sessions.push(session);
    }

    this.evictStaleCache(sessions);
    sessions.sort((a, b) => b.startedAt - a.startedAt);
    return sessions;
  }

  private evictStaleCache(sessions: AgentSession[]): void {
    const activeIds = new Set(sessions.map((s) => s.sessionId));
    for (const sid of Object.keys(this.eventsCache)) {
      if (!activeIds.has(sid)) delete this.eventsCache[sid];
    }
  }

  private loadSession(
    sessionDir: string,
    processInfo: Map<number, ProcInfo>,
    childrenMap: Map<number, number[]>,
    ports: Map<number, number[]>,
    gitMap: Map<string, { added: number; modified: number }>,
  ): AgentSession | null {
    // Require a workspace.yaml
    const workspacePath = path.join(sessionDir, 'workspace.yaml');
    if (!fs.existsSync(workspacePath)) return null;
    const meta = parseWorkspaceYaml(workspacePath);
    if (!meta) return null;

    // Find any lock file: inuse.<pid>.lock → extract PID
    let activePid: number | null = null;
    try {
      for (const f of fs.readdirSync(sessionDir)) {
        const m = f.match(/^inuse\.(\d+)\.lock$/);
        if (m) { activePid = parseInt(m[1], 10); break; }
      }
    } catch {
      return null;
    }

    // Skip sessions with no lock file (completed, not currently running)
    if (activePid === null) return null;

    // Confirm the PID is actually alive in the ps snapshot
    const proc = processInfo.get(activePid);
    const pidAlive = proc != null;

    // Parse events.jsonl incrementally
    const eventsPath = path.join(sessionDir, 'events.jsonl');
    const sessionId = meta.id;
    let cached = this.eventsCache[sessionId];

    if (!cached) {
      cached = {
        model: '',
        startedAt: 0,
        totalOutputTokens: 0,
        contextTokens: 0,
        compactionCount: 0,
        turnCount: 0,
        toolCalls: [],
        currentTask: '',
        lastActivityMs: 0,
        lastUserMsgMs: 0,
        lastAssistantMsgMs: 0,
        pendingToolCallId: null,
        newOffset: 0,
      };
    }

    if (fs.existsSync(eventsPath)) {
      const { events, newOffset } = readEventsFrom(eventsPath, cached.newOffset);
      if (events.length > 0) {
        applyEvents(cached, events as never[]);
        cached.newOffset = newOffset;
      }
    }
    this.eventsCache[sessionId] = cached;

    // Determine status
    const now = Date.now();
    const idleSecs = (now - cached.lastActivityMs) / 1000;
    let status: SessionStatus;
    if (!pidAlive) {
      status = 'done';
    } else if (cached.pendingToolCallId) {
      status = 'executing';
    } else if (cached.lastUserMsgMs > cached.lastAssistantMsgMs && idleSecs < 60) {
      status = 'thinking';
    } else if (idleSecs > 30) {
      status = 'waiting';
    } else {
      status = 'thinking';
    }

    // Resolve context window + percent
    const contextWindow = contextWindowForModel(cached.model, cached.contextTokens);
    const contextPercent = cached.contextTokens > 0
      ? Math.min(100, Math.round((cached.contextTokens / contextWindow) * 100))
      : 0;

    // Current task: prefer workspace summary (set after compaction), else last user message
    const taskStr = meta.summary || cached.currentTask || '';
    const currentTasks = taskStr ? [taskStr] : [];

    // Child processes
    const childPids = (proc ? childrenMap.get(activePid) ?? [] : []);
    const children: ChildProcess[] = childPids
      .map((cpid) => {
        const cp = processInfo.get(cpid);
        if (!cp) return null;
        return {
          pid: cpid,
          command: cp.command.split(/\s+/)[0].split('/').pop() ?? cp.command,
          memKb: cp.rssKb,
          port: (ports.get(cpid) ?? [])[0],
        } as ChildProcess;
      })
      .filter((c): c is ChildProcess => c !== null);

    // Git stats
    const cwd = meta.cwd;
    const git = gitMap.get(cwd) ?? collectGitStats(cwd);

    return {
      agentCli: 'copilot',
      pid: activePid,
      sessionId,
      cwd,
      projectName: path.basename(cwd) || cwd,
      startedAt: cached.startedAt || new Date(meta.created_at || Date.now()).getTime(),
      status,
      model: cached.model || 'github-copilot',
      effort: '',
      contextPercent,
      totalInputTokens: 0,
      totalOutputTokens: cached.totalOutputTokens,
      totalCacheRead: 0,
      totalCacheCreate: 0,
      turnCount: cached.turnCount,
      currentTasks,
      memMb: proc ? Math.round(proc.rssKb / 1024) : 0,
      version: '',
      gitBranch: meta.branch || '',
      gitAdded: git.added,
      gitModified: git.modified,
      tokenHistory: [],
      contextHistory: [],
      compactionCount: cached.compactionCount,
      contextWindow,
      subagents: [],
      memFileCount: 0,
      memLineCount: 0,
      children,
      initialPrompt: currentTasks[0] ?? '',
      firstAssistantText: '',
      toolCalls: cached.toolCalls,
      pendingSinceMs: cached.pendingToolCallId ? cached.lastActivityMs : 0,
      thinkingSinceMs:
        cached.lastUserMsgMs > cached.lastAssistantMsgMs ? cached.lastUserMsgMs : 0,
      fileAccesses: [],
    };
  }
}

