/**
 * Multi-collector orchestrator.
 *
 * Mirrors abtop/src/collector/mod.rs `MultiCollector`.
 * Runs Claude and Codex collectors on every tick, staggered so the
 * expensive operations (lsof, git) only run on slow ticks.
 *
 * Usage:
 *   const mc = new MultiCollector();
 *   setInterval(() => {
 *     const snapshot = mc.tick();
 *     // use snapshot.sessions, snapshot.rateLimits, snapshot.orphanPorts
 *   }, 2000);
 */

import {
  getProcessInfo,
  getChildrenMap,
  getListeningPorts,
  collectGitStats,
} from './process';
import { ProcInfo } from './types';
import { ClaudeCollector } from './claude';
import { CodexCollector } from './codex';
import { CopilotCollector } from './copilot';
import { readClaudeRateLimits, readCodexRateLimitCache } from './rate-limit';
import { redactSecrets } from './secrets';
import {
  AgentSession,
  ChildProcess,
  FileAccess,
  OrphanPort,
  RateLimitInfo,
  SessionStatus,
  SubAgent,
  ToolCall,
} from './types';

export interface CollectorSnapshot {
  sessions: AgentSession[];
  rateLimits: RateLimitInfo[];
  orphanPorts: OrphanPort[];
  /** Unix epoch ms when this snapshot was taken */
  collectedAt: number;
}

export class MultiCollector {
  private claude = new ClaudeCollector();
  private codex = new CodexCollector();
  private copilot = new CopilotCollector();
  private tickCount = 0;

  /** Ports seen in the previous tick that had a live session behind them. */
  private prevSessionPids = new Set<number>();
  /** Known orphan ports (pid → port[]) persisted across ticks. */
  private orphanPortMap = new Map<number, { port: number; command: string; projectName: string }[]>();

  /** Polling interval config (mirrors abtop defaults). */
  private readonly SLOW_TICK_EVERY = 5; // slow tick every 5 fast ticks (= every 10s at 2s interval)

  tick(): CollectorSnapshot {
    this.tickCount++;
    const slowTick = this.tickCount % this.SLOW_TICK_EVERY === 0;

    // ── Process table (fast tick) ───────────────────────────────────────────
    const processInfo = getProcessInfo();
    const childrenMap = getChildrenMap(processInfo);

    // ── Ports + git (slow tick only) ─────────────────────────────────────────
    let ports = new Map<number, number[]>();
    let gitMap = new Map<string, { added: number; modified: number }>();

    if (slowTick) {
      ports = getListeningPorts();
    }

    // ── Collect sessions ──────────────────────────────────────────────────────
    const claudeSessions = this.claude.collect(processInfo, childrenMap, ports, gitMap);
    const codexSessions = this.codex.collect(processInfo, childrenMap, ports, gitMap);
    const copilotSessions = this.copilot.collect(processInfo, childrenMap, ports, gitMap);
    const sessions = [...claudeSessions, ...codexSessions, ...copilotSessions];

    // ── Git stats (slow tick, after session list is known) ────────────────────
    if (slowTick) {
      const cwds = new Set(sessions.map((s) => s.cwd));
      for (const cwd of cwds) {
        gitMap.set(cwd, collectGitStats(cwd));
      }
      // Backfill git stats into sessions
      for (const s of sessions) {
        const g = gitMap.get(s.cwd);
        if (g) {
          s.gitAdded = g.added;
          s.gitModified = g.modified;
        }
      }
    }

    // ── Rate limits ───────────────────────────────────────────────────────────
    const rateLimits: RateLimitInfo[] = [];
    if (slowTick) {
      rateLimits.push(...readClaudeRateLimits());
    }
    const codexRl = this.codex.lastRateLimit ?? readCodexRateLimitCache();
    if (codexRl) rateLimits.push(codexRl);

    // ── Orphan port detection ─────────────────────────────────────────────────
    const orphanPorts = this.detectOrphanPorts(sessions, processInfo, ports, slowTick);

    return {
      sessions: sessions.map(normalizeSession),
      rateLimits,
      orphanPorts,
      collectedAt: Date.now(),
    };
  }

  private detectOrphanPorts(
    sessions: AgentSession[],
    processInfo: Map<number, ProcInfo>,
    ports: Map<number, number[]>,
    slowTick: boolean,
  ): OrphanPort[] {
    if (!slowTick) return [...this.flattenOrphans()];

    const sessionPids = new Set(sessions.map((s) => s.pid));
    const sessionChildPids = new Set<number>();
    for (const s of sessions) {
      for (const c of s.children) sessionChildPids.add(c.pid);
    }

    // Any port-holding PID that is NOT under a live session → orphan candidate
    for (const [pid, pidPorts] of ports) {
      if (sessionPids.has(pid) || sessionChildPids.has(pid)) {
        // Still alive under a session — remove from orphan map if present
        this.orphanPortMap.delete(pid);
        continue;
      }
      // Port-holding PID with no parent session
      const proc = processInfo.get(pid);
      if (!proc) {
        this.orphanPortMap.delete(pid);
        continue;
      }
      this.orphanPortMap.set(pid, pidPorts.map((port) => ({
        port,
        command: proc.command,
        projectName: '?',
      })));
    }

    // Remove orphan entries whose PID has died
    for (const pid of this.orphanPortMap.keys()) {
      if (!processInfo.has(pid)) this.orphanPortMap.delete(pid);
    }

    return [...this.flattenOrphans()];
  }

  private flattenOrphans(): OrphanPort[] {
    const result: OrphanPort[] = [];
    for (const [pid, entries] of this.orphanPortMap) {
      for (const e of entries) {
        result.push({ pid, port: e.port, command: e.command, projectName: e.projectName });
      }
    }
    return result;
  }
}

// ─── Snapshot normalization ───────────────────────────────────────────────────

const VALID_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>([
  'thinking',
  'executing',
  'waiting',
  'rateLimited',
  'done',
]);

function num(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function str(s: unknown): string {
  return typeof s === 'string' ? s : '';
}

function arr<T>(a: unknown): T[] {
  return Array.isArray(a) ? (a as T[]) : [];
}

/**
 * Single source of truth for the snapshot wire shape. Every `AgentSession` that
 * leaves `tick()` is run through this so:
 *
 *   • numeric fields are real numbers (never null / undefined / NaN);
 *   • array fields are arrays (never null / undefined);
 *   • status is a known `SessionStatus` (any unrecognized value defaults to
 *     'waiting' — keeps the front end's filter sets honest);
 *   • free-text fields that originate from agent-controlled content
 *     (`currentTasks`, `initialPrompt`, `firstAssistantText`, `toolCalls[].arg`,
 *     `fileAccesses[].path`) are run through `redactSecrets()` so a pasted
 *     `sk-ant-…` doesn't end up rendered in the dashboard.
 *
 * Front-end null-coalescing guards (e.g. `value ?? 0`) become defence-in-depth
 * after this runs server-side.
 */
function normalizeSession(s: AgentSession): AgentSession {
  const status: SessionStatus = VALID_STATUSES.has(s.status) ? s.status : 'waiting';
  return {
    agentCli: str(s.agentCli),
    pid: num(s.pid),
    sessionId: str(s.sessionId),
    cwd: str(s.cwd),
    projectName: str(s.projectName),
    startedAt: num(s.startedAt),
    status,
    model: str(s.model),
    effort: str(s.effort),
    contextPercent: num(s.contextPercent),
    totalInputTokens: num(s.totalInputTokens),
    totalOutputTokens: num(s.totalOutputTokens),
    totalCacheRead: num(s.totalCacheRead),
    totalCacheCreate: num(s.totalCacheCreate),
    turnCount: num(s.turnCount),
    currentTasks: arr<string>(s.currentTasks).map((t) => redactSecrets(str(t))),
    memMb: num(s.memMb),
    version: str(s.version),
    gitBranch: str(s.gitBranch),
    gitAdded: num(s.gitAdded),
    gitModified: num(s.gitModified),
    tokenHistory: arr<number>(s.tokenHistory).map(num),
    contextHistory: arr<number>(s.contextHistory).map(num),
    compactionCount: num(s.compactionCount),
    contextWindow: num(s.contextWindow) || 200_000,
    subagents: arr<SubAgent>(s.subagents).map((sa) => ({
      name: str(sa?.name),
      status: sa?.status === 'done' ? 'done' : 'working',
      tokens: num(sa?.tokens),
    })),
    memFileCount: num(s.memFileCount),
    memLineCount: num(s.memLineCount),
    children: arr<ChildProcess>(s.children).map((c) => ({
      pid: num(c?.pid),
      command: str(c?.command),
      memKb: num(c?.memKb),
      port: typeof c?.port === 'number' ? c.port : undefined,
    })),
    initialPrompt: redactSecrets(str(s.initialPrompt)),
    firstAssistantText: redactSecrets(str(s.firstAssistantText)),
    toolCalls: arr<ToolCall>(s.toolCalls).map((tc) => ({
      name: str(tc?.name),
      arg: redactSecrets(str(tc?.arg)),
      durationMs: num(tc?.durationMs),
    })),
    pendingSinceMs: num(s.pendingSinceMs),
    thinkingSinceMs: num(s.thinkingSinceMs),
    fileAccesses: arr<FileAccess>(s.fileAccesses).map((fa) => ({
      path: redactSecrets(str(fa?.path)),
      operation: fa?.operation === 'Write' || fa?.operation === 'Edit' ? fa.operation : 'Read',
      turnIndex: num(fa?.turnIndex),
    })),
  };
}
