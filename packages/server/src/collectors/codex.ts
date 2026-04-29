/**
 * Codex CLI session collector.
 *
 * Mirrors abtop/src/collector/codex.rs:
 *   - Discovery: find running `codex` processes via ps, map PID → open rollout-*.jsonl via lsof
 *   - Parse ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 *   - Extract session_meta, token_count, event_msg, response_item events
 *   - Expose rate limit info from token_count events
 *
 * Data sources are undocumented Codex CLI internals — use defensive parsing throughout.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  AgentSession,
  ChildProcess,
  ProcInfo,
  RateLimitInfo,
  SessionStatus,
  ToolCall,
  contextWindowForModel,
} from './types';
import { cmdHasBinary, hasActiveDescendant, mapPidsToOpenPaths } from './process';
import { writeCodexRateLimitCache } from './rate-limit';
import { redactSecrets } from './secrets';

// ─── Parsed JSONL result ──────────────────────────────────────────────────────

interface CodexJSONLResult {
  sessionId: string;
  cwd: string;
  startedAt: number;
  model: string;
  effort: string;
  version: string;
  gitBranch: string;
  contextWindow: number;
  turnCount: number;
  currentTask: string;
  taskComplete: boolean;
  /** True iff trailing event is user_message with no agent_message after it */
  modelGenerating: boolean;
  lastActivityMs: number;
  initialPrompt: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  lastContextTokens: number;
  tokenHistory: number[];
  rateLimit: RateLimitInfo | null;
  toolCalls: ToolCall[];
  pendingSinceMs: number;
  thinkingSinceMs: number;
}

// ─── Collector class ──────────────────────────────────────────────────────────

export class CodexCollector {
  private sessionsDir: string;
  public lastRateLimit: RateLimitInfo | null = null;

  constructor() {
    this.sessionsDir = path.join(os.homedir(), '.codex', 'sessions');
  }

  /**
   * Collect all live and recently finished Codex sessions.
   */
  collect(
    processInfo: Map<number, ProcInfo>,
    childrenMap: Map<number, number[]>,
    ports: Map<number, number[]>,
    gitMap: Map<string, { added: number; modified: number }>,
  ): AgentSession[] {
    if (!fs.existsSync(this.sessionsDir)) {
      this.lastRateLimit = null;
      return [];
    }

    this.lastRateLimit = null;

    const codexPids = findCodexPids(processInfo);
    const justPids = codexPids.map(([p]) => p);
    const pidToJsonl = mapPidsToJsonl(justPids);
    const pidIsExec = new Map(codexPids);

    const sessions: AgentSession[] = [];
    const seenJsonl = new Set<string>();

    // Active sessions: running codex processes with open JSONL files
    for (const [pid, jsonlPath] of pidToJsonl) {
      const isExec = pidIsExec.get(pid) ?? false;
      const parsed = this.loadSessionWithRateLimit(
        pid, isExec, jsonlPath, processInfo, childrenMap, ports, gitMap,
      );
      if (!parsed) continue;
      const [session, rl] = parsed;
      seenJsonl.add(jsonlPath);
      if (rl) {
        const newer = !this.lastRateLimit || (rl.updatedAt ?? 0) > (this.lastRateLimit.updatedAt ?? 0);
        if (newer) {
          writeCodexRateLimitCache(rl);
          this.lastRateLimit = rl;
        }
      }
      sessions.push(session);
    }

    // Recently finished sessions: scan today's JSONL not owned by a running process
    const todayDir = getTodaySessionDir(this.sessionsDir);
    if (todayDir && fs.existsSync(todayDir)) {
      try {
        const entries = fs.readdirSync(todayDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          if (!entry.name.endsWith('.jsonl')) continue;
          const filePath = path.join(todayDir, entry.name);
          if (seenJsonl.has(filePath)) continue;
          // Only include recently finished (<5 min old)
          const stat = safeStatSync(filePath);
          if (!stat || (Date.now() - stat.mtimeMs) / 1000 > 300) continue;
          const parsed = this.loadSessionWithRateLimit(
            null, false, filePath, processInfo, childrenMap, ports, gitMap,
          );
          if (!parsed) continue;
          const [session, rl] = parsed;
          if (rl) {
            const newer = !this.lastRateLimit || (rl.updatedAt ?? 0) > (this.lastRateLimit.updatedAt ?? 0);
            if (newer) {
              writeCodexRateLimitCache(rl);
              this.lastRateLimit = rl;
            }
          }
          sessions.push(session);
        }
      } catch { /* ignore */ }
    }

    sessions.sort((a, b) => b.startedAt - a.startedAt);
    return sessions;
  }

  private loadSessionWithRateLimit(
    pid: number | null,
    isExec: boolean,
    jsonlPath: string,
    processInfo: Map<number, ProcInfo>,
    childrenMap: Map<number, number[]>,
    ports: Map<number, number[]>,
    gitMap: Map<string, { added: number; modified: number }>,
  ): [AgentSession, RateLimitInfo | null] | null {
    const result = parseCodexJSONL(jsonlPath);
    if (!result) return null;

    const proc = pid != null ? processInfo.get(pid) : null;
    const memMb = proc ? Math.floor(proc.rssKb / 1024) : 0;
    const displayPid = pid ?? 0;
    const pidAlive = proc != null;

    const status: SessionStatus = !pidAlive || (isExec && result.taskComplete)
      ? 'done'
      : (() => {
          const hasActiveChild = pid != null && hasActiveDescendant(pid, childrenMap, processInfo, 5.0);
          if (hasActiveChild || result.pendingSinceMs > 0) return 'executing';
          if (result.modelGenerating) return 'thinking';
          return 'waiting';
        })();

    const currentTasks = result.currentTask
      ? [result.currentTask]
      : !pidAlive || (isExec && result.taskComplete)
      ? ['finished']
      : status === 'waiting'
      ? ['waiting for input']
      : ['thinking...'];

    const contextWindow = contextWindowForModel(result.model, 0);
    const contextPercent =
      contextWindow > 0 && result.lastContextTokens > 0
        ? (result.lastContextTokens / contextWindow) * 100
        : 0;

    const children: ChildProcess[] = pid != null
      ? collectDescendants(pid, childrenMap, processInfo, ports)
      : [];

    const git = gitMap.get(result.cwd) ?? { added: 0, modified: 0 };

    const session: AgentSession = {
      agentCli: 'codex',
      pid: displayPid,
      sessionId: result.sessionId,
      cwd: result.cwd,
      projectName: result.cwd.split('/').pop() || '?',
      startedAt: result.startedAt,
      status,
      model: result.model,
      effort: result.effort,
      contextPercent,
      totalInputTokens: result.totalInput,
      totalOutputTokens: result.totalOutput,
      totalCacheRead: result.totalCacheRead,
      totalCacheCreate: 0, // Codex doesn't report cache writes
      turnCount: result.turnCount,
      currentTasks,
      memMb,
      version: result.version,
      gitBranch: result.gitBranch,
      gitAdded: git.added,
      gitModified: git.modified,
      tokenHistory: result.tokenHistory,
      contextHistory: [],
      compactionCount: 0,
      contextWindow,
      subagents: [],
      memFileCount: 0,
      memLineCount: 0,
      children,
      initialPrompt: result.initialPrompt,
      firstAssistantText: '',
      toolCalls: result.toolCalls,
      pendingSinceMs: result.pendingSinceMs,
      thinkingSinceMs: result.thinkingSinceMs,
      fileAccesses: [],
    };

    return [session, result.rateLimit];
  }
}

// ─── Process discovery ────────────────────────────────────────────────────────

function findCodexPids(processInfo: Map<number, ProcInfo>): [number, boolean][] {
  const pids: [number, boolean][] = [];
  for (const [pid, info] of processInfo) {
    if (!cmdHasBinary(info.command, 'codex')) continue;
    if (info.command.includes('app-server') || info.command.includes('grep')) continue;
    const isExec = info.command.includes(' exec');
    pids.push([pid, isExec]);
  }
  return pids;
}

/**
 * Map codex PIDs to their open rollout-*.jsonl files via lsof.
 * Mirrors abtop's `map_pid_to_jsonl` (non-Linux path).
 */
function mapPidsToJsonl(pids: number[]): Map<number, string> {
  const map = new Map<number, string>();
  if (pids.length === 0) return map;

  const openPaths = mapPidsToOpenPaths(pids);
  for (const [pid, paths] of openPaths) {
    for (const p of paths) {
      const base = p.split('/').pop() ?? '';
      if (base.startsWith('rollout-') && base.endsWith('.jsonl')) {
        map.set(pid, p);
        break;
      }
    }
  }
  return map;
}

// ─── JSONL parser ─────────────────────────────────────────────────────────────

const MAX_LINE_BYTES = 10 * 1024 * 1024;

function parseCodexJSONL(filePath: string): CodexJSONLResult | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const result: CodexJSONLResult = {
    sessionId: '',
    cwd: '',
    startedAt: 0,
    model: '-',
    effort: '',
    version: '',
    gitBranch: '',
    contextWindow: 0,
    turnCount: 0,
    currentTask: '',
    taskComplete: false,
    modelGenerating: false,
    lastActivityMs: 0,
    initialPrompt: '',
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    lastContextTokens: 0,
    tokenHistory: [],
    rateLimit: null,
    toolCalls: [],
    pendingSinceMs: 0,
    thinkingSinceMs: 0,
  };

  const callIndices = new Map<string, number>();
  const callStarts = new Map<string, number>();
  const pendingTasks: [string, string][] = [];

  for (const rawLine of content.split('\n')) {
    if (Buffer.byteLength(rawLine, 'utf8') > MAX_LINE_BYTES) break;
    const line = rawLine.trim();
    if (!line) continue;

    let val: Record<string, unknown>;
    try {
      val = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    // Update lastActivityMs from timestamp
    const tsMs = parseIso(val['timestamp'] as string | undefined);
    if (tsMs > result.lastActivityMs) result.lastActivityMs = tsMs;

    switch (val['type']) {
      case 'session_meta': {
        const payload = val['payload'] as Record<string, unknown> | undefined;
        if (!payload) break;
        if (typeof payload['id'] === 'string') result.sessionId = payload['id'];
        if (typeof payload['cwd'] === 'string') result.cwd = payload['cwd'];
        if (typeof payload['cli_version'] === 'string') result.version = payload['cli_version'];
        const startTs = parseIso((payload['timestamp'] as string | undefined));
        if (startTs > 0) result.startedAt = startTs;
        const git = payload['git'] as Record<string, unknown> | undefined;
        if (typeof git?.['branch'] === 'string') result.gitBranch = git['branch'];
        break;
      }

      case 'event_msg': {
        const payload = val['payload'] as Record<string, unknown> | undefined;
        if (!payload) break;
        switch (payload['type']) {
          case 'task_started': {
            const cw = payload['model_context_window'] as number | undefined;
            if (cw) result.contextWindow = cw;
            break;
          }
          case 'user_message': {
            result.modelGenerating = true;
            result.thinkingSinceMs = tsMs;
            if (!result.initialPrompt && typeof payload['message'] === 'string') {
              result.initialPrompt = redactSecrets(payload['message'].slice(0, 120));
            }
            break;
          }
          case 'agent_message': {
            result.modelGenerating = false;
            result.turnCount++;
            break;
          }
          case 'task_complete': {
            result.taskComplete = true;
            break;
          }
          case 'token_count': {
            const info = payload['info'] as Record<string, unknown> | undefined;
            if (!info) break;

            // Cumulative totals
            const total = info['total_token_usage'] as Record<string, unknown> | undefined;
            if (total) {
              result.totalInput = (total['input_tokens'] as number) || 0;
              result.totalOutput = (total['output_tokens'] as number) || 0;
              result.totalCacheRead =
                ((total['cached_input_tokens'] as number) || (total['cache_read_input_tokens'] as number)) || 0;
            }

            // Per-turn context (for sparkline and %)
            const last = info['last_token_usage'] as Record<string, unknown> | undefined;
            if (last) {
              const inp = (last['input_tokens'] as number) || 0;
              const out = (last['output_tokens'] as number) || 0;
              const cache =
                ((last['cached_input_tokens'] as number) || (last['cache_read_input_tokens'] as number)) || 0;
              result.lastContextTokens = inp + cache;
              if (result.tokenHistory.length < 10_000) {
                result.tokenHistory.push(inp + out + cache);
              }
            }

            if (info['model_context_window']) result.contextWindow = info['model_context_window'] as number;

            // Rate limits
            const rl = payload['rate_limits'] as Record<string, unknown> | undefined;
            if (rl) {
              const eventSecs = tsMs > 0 ? Math.floor(tsMs / 1000) : undefined;
              const rateLimit: RateLimitInfo = { source: 'codex', updatedAt: eventSecs };
              for (const slot of ['primary', 'secondary'] as const) {
                const w = rl[slot] as Record<string, unknown> | undefined;
                if (!w) continue;
                const mins = (w['window_minutes'] as number) || 0;
                const pct = w['used_percent'] as number | undefined;
                const resets = w['resets_at'] as number | undefined;
                if (mins <= 300) {
                  rateLimit.fiveHourPct = pct;
                  rateLimit.fiveHourResetsAt = resets;
                } else {
                  rateLimit.sevenDayPct = pct;
                  rateLimit.sevenDayResetsAt = resets;
                }
              }
              if (rateLimit.fiveHourPct != null || rateLimit.sevenDayPct != null) {
                result.rateLimit = rateLimit;
              }
            }
            break;
          }
        }
        break;
      }

      case 'turn_context': {
        const payload = val['payload'] as Record<string, unknown> | undefined;
        if (!payload) break;
        if (typeof payload['model'] === 'string') result.model = payload['model'];
        if (typeof payload['effort'] === 'string') result.effort = payload['effort'];
        break;
      }

      case 'response_item': {
        const payload = val['payload'] as Record<string, unknown> | undefined;
        if (!payload || payload['type'] !== 'function_call') break;
        const name = (payload['name'] as string) || '';
        const callId = (payload['call_id'] as string) || '';
        const argsStr = (payload['arguments'] as string) || '{}';
        const arg = parseCodexToolArg(argsStr);
        if (!result.currentTask) result.currentTask = `${name} ${arg}`.trim();

        if (callId && result.toolCalls.length < 500) {
          const idx = result.toolCalls.length;
          result.toolCalls.push({ name, arg, durationMs: 0 });
          callIndices.set(callId, idx);
          callStarts.set(callId, tsMs);
          pendingTasks.push([callId, name]);
          // Track pending_since: earliest open tool call (0 when none)
          const opens = Array.from(callStarts.values()).filter((v) => v > 0);
          result.pendingSinceMs = opens.length > 0 ? Math.min(...opens) : 0;
        }
        break;
      }

      case 'function_call_output': {
        const payload = val['payload'] as Record<string, unknown> | undefined;
        const callId = (payload?.['call_id'] as string) || '';
        if (!callId) break;
        const startMs = callStarts.get(callId);
        if (startMs != null) {
          const idx = callIndices.get(callId);
          if (idx != null) result.toolCalls[idx]!.durationMs = Math.max(0, tsMs - startMs);
          callStarts.delete(callId);
          callIndices.delete(callId);
        }
        pendingTasks.splice(0, pendingTasks.length, ...pendingTasks.filter(([id]) => id !== callId));
        // Recompute pending_since (guard against empty iterator → Infinity)
        const remaining = callStarts.size > 0 ? Array.from(callStarts.values()) : [];
        result.pendingSinceMs = remaining.length > 0 ? Math.min(...remaining) : 0;
        break;
      }
    }
  }

  if (!result.sessionId && !result.cwd) return null;
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCodexToolArg(argumentsStr: string): string {
  let val: Record<string, unknown>;
  try { val = JSON.parse(argumentsStr) as Record<string, unknown>; } catch { return ''; }

  for (const key of ['file_path', 'path']) {
    if (typeof val[key] === 'string') {
      const short = (val[key] as string).split('/').pop() ?? val[key] as string;
      return redactSecrets(short).slice(0, 120);
    }
  }
  for (const key of ['cmd', 'command', 'chars', 'target', 'session_id']) {
    const raw = val[key];
    if (typeof raw === 'string') return redactSecrets(raw).slice(0, 120);
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw).slice(0, 120);
  }
  for (const v of Object.values(val)) {
    if (typeof v === 'string' && v.length > 0) return redactSecrets(v).slice(0, 120);
  }
  return '';
}

function getTodaySessionDir(sessionsDir: string): string | null {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return path.join(sessionsDir, yyyy, mm, dd);
}

function parseIso(ts: string | undefined): number {
  if (!ts) return 0;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? 0 : ms;
}

function safeStatSync(filePath: string): fs.Stats | null {
  try { return fs.statSync(filePath); } catch { return null; }
}

function collectDescendants(
  pid: number,
  childrenMap: Map<number, number[]>,
  processInfo: Map<number, ProcInfo>,
  ports: Map<number, number[]>,
): ChildProcess[] {
  const result: ChildProcess[] = [];
  const stack = [...(childrenMap.get(pid) ?? [])];
  const visited = new Set<number>();
  while (stack.length > 0) {
    const cpid = stack.pop()!;
    if (visited.has(cpid)) continue;
    visited.add(cpid);
    const proc = processInfo.get(cpid);
    if (proc) {
      const port = ports.get(cpid)?.[0];
      result.push({ pid: cpid, command: proc.command, memKb: proc.rssKb, port });
    }
    stack.push(...(childrenMap.get(cpid) ?? []));
  }
  return result;
}
