/**
 * Shared TypeScript types for the abtop-style agent monitor feature.
 * These mirror the Rust structs in abtop/src/model/session.rs.
 */

/** Type of file operation performed by the agent. */
export type FileOp = 'Read' | 'Write' | 'Edit';

/** A single file access event recorded from agent tool usage. */
export interface FileAccess {
  path: string;
  operation: FileOp;
  turnIndex: number;
}

/** Account-level rate limit info shared across all sessions. */
export interface RateLimitInfo {
  /** "claude" or "codex" */
  source: string;
  /** 5-hour window usage percentage (0–100), if available */
  fiveHourPct?: number;
  /** Unix epoch seconds when the 5-hour window resets */
  fiveHourResetsAt?: number;
  /** 7-day window usage percentage (0–100), if available */
  sevenDayPct?: number;
  /** Unix epoch seconds when the 7-day window resets */
  sevenDayResetsAt?: number;
  /** When this data was last updated (Unix epoch seconds) */
  updatedAt?: number;
}

/**
 * Status of a running or recently finished agent session.
 *
 * ● Working  = PID alive + transcript mtime < 30s ago
 * ◌ Waiting  = PID alive + transcript mtime > 30s ago
 * ✗ Error    = PID alive + last assistant has error content
 * ✓ Done     = PID dead
 */
export type SessionStatus = 'thinking' | 'executing' | 'waiting' | 'rateLimited' | 'done';

/** A child process spawned by an agent session. */
export interface ChildProcess {
  pid: number;
  command: string;
  memKb: number;
  port?: number;
}

/** A port left open by a process whose parent session has ended. */
export interface OrphanPort {
  port: number;
  pid: number;
  command: string;
  projectName: string;
}

/** A sub-agent spawned by the main session (Claude "Agent" tool). */
export interface SubAgent {
  name: string;
  status: 'working' | 'done';
  tokens: number;
}

/** A single tool invocation from a session transcript. */
export interface ToolCall {
  /** Tool name: "Read", "Edit", "Bash", "Write", "Grep", "Glob", "Agent", etc. */
  name: string;
  /** Short argument (file path, command prefix, pattern). Secrets redacted. */
  arg: string;
  /** Duration in milliseconds (0 if the tool is still running or unknown). */
  durationMs: number;
}

/** Full session data for one running (or recently finished) agent. */
export interface AgentSession {
  /** Which CLI: "claude" or "codex" */
  agentCli: string;
  pid: number;
  sessionId: string;
  cwd: string;
  projectName: string;
  /** Unix epoch milliseconds */
  startedAt: number;
  status: SessionStatus;
  model: string;
  /** Reasoning effort (Codex only: "minimal" | "low" | "medium" | "high") */
  effort: string;
  /** Context window usage percentage (0–100) */
  contextPercent: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheCreate: number;
  turnCount: number;
  /** Short description of current task(s) */
  currentTasks: string[];
  /** Resident memory in MB */
  memMb: number;
  version: string;
  gitBranch: string;
  gitAdded: number;
  gitModified: number;
  /** Per-turn total token history (sparkline data, capped at 10 000 entries) */
  tokenHistory: number[];
  /** Per-turn context token history (capped at 10 000 entries) */
  contextHistory: number[];
  /** Number of detected compaction events (context dropped > 30% between turns) */
  compactionCount: number;
  /** Full context window size for this model (e.g. 200 000 or 1 000 000) */
  contextWindow: number;
  subagents: SubAgent[];
  memFileCount: number;
  memLineCount: number;
  children: ChildProcess[];
  /** First user prompt, truncated — used as session title */
  initialPrompt: string;
  /** First assistant text reply — used as summary fallback */
  firstAssistantText: string;
  /** Timeline of tool calls extracted from the transcript */
  toolCalls: ToolCall[];
  /**
   * Unix-epoch ms of the last assistant turn whose tool_use blocks are still
   * awaiting a user response. 0 when no tool is currently in flight.
   */
  pendingSinceMs: number;
  /**
   * Unix-epoch ms of the most recent user line (prompt or tool_result) not
   * yet followed by an assistant response. 0 when latest transcript entry was
   * an assistant turn.
   */
  thinkingSinceMs: number;
  /** File access audit log (most recent MAX_FILE_ACCESSES entries) */
  fileAccesses: FileAccess[];
}

/** Maximum file access entries kept per session. */
export const MAX_FILE_ACCESSES = 1000;

/** Process info gathered from `ps`. */
export interface ProcInfo {
  pid: number;
  ppid: number;
  rssKb: number;
  cpuPct: number;
  command: string;
}

/** Context window sizes by model name. */
export const CONTEXT_WINDOW_BY_MODEL: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-opus-4-6[1m]': 1_000_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4': 200_000,
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 200_000,
  // GitHub Copilot CLI supported models
  'gpt-5': 128_000,
  'gpt-5-mini': 128_000,
  'o3': 200_000,
  'o4-mini': 200_000,
};

/** Derive context window size from model name, falling back to 200k. */
export function contextWindowForModel(model: string, maxSeen = 0): number {
  const known = CONTEXT_WINDOW_BY_MODEL[model];
  if (known) return known;
  // If we observed a turn with context > 200k, it must be a 1M model.
  if (maxSeen > 200_000) return 1_000_000;
  return 200_000;
}

/** Elapsed time as a short human-readable string ("12s", "5m", "2h 10m"). */
export function elapsedDisplay(startedAtMs: number): string {
  const secs = Math.floor((Date.now() - startedAtMs) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
