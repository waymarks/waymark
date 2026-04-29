/**
 * Claude Code session collector.
 *
 * Mirrors abtop/src/collector/claude.rs:
 *   - Session discovery: find running `claude` processes → read ~/.claude/sessions/{PID}.json
 *   - Transcript parsing: ~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl
 *   - Incremental reads: tracks byte offset to parse only new data each tick
 *   - Sub-agent discovery: {projectDir}/{sessionId}/subagents/
 *   - Memory status: {projectDir}/memory/
 *
 * Data sources are undocumented Claude Code internals — use defensive parsing throughout.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  AgentSession,
  ChildProcess,
  FileAccess,
  MAX_FILE_ACCESSES,
  ProcInfo,
  SessionStatus,
  SubAgent,
  ToolCall,
  contextWindowForModel,
} from './types';
import { cmdHasBinary, hasActiveDescendant } from './process';
import { redactSecrets } from './secrets';

// ─── Session file schema ──────────────────────────────────────────────────────

interface SessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
}

// ─── Transcript parse result ──────────────────────────────────────────────────

interface TranscriptResult {
  model: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreate: number;
  lastContextTokens: number;
  maxContextTokens: number;
  contextHistory: number[];
  compactionCount: number;
  turnCount: number;
  currentTask: string;
  version: string;
  gitBranch: string;
  tokenHistory: number[];
  initialPrompt: string;
  firstAssistantText: string;
  toolCalls: ToolCall[];
  /** Epoch ms of the last assistant turn (for pending_since calculation) */
  lastAssistantTsMs: number;
  /** Epoch ms of the most recent user prompt not yet followed by assistant */
  lastUserTsMs: number;
  /** True when at least one user or assistant line was observed in this parse */
  sawTurn: boolean;
  fileAccesses: FileAccess[];
  /** Byte offset after the last fully-parsed line */
  newOffset: number;
  /** File identity: [size, mtime_ms] — detect rotation/replacement */
  fileIdentity: [number, number];
}

// ─── Cache entry ──────────────────────────────────────────────────────────────

interface TranscriptCache {
  [sessionId: string]: TranscriptResult;
}

// ─── Collector class ──────────────────────────────────────────────────────────

export class ClaudeCollector {
  private transcriptCache: TranscriptCache = {};

  /**
   * Collect all live Claude sessions.
   *
   * @param processInfo  Current ps snapshot (pid → ProcInfo)
   * @param childrenMap  Parent → children adjacency
   * @param ports        pid → listening port[]
   * @param gitMap       cwd → {added, modified} (populated by caller on slow ticks)
   */
  collect(
    processInfo: Map<number, ProcInfo>,
    childrenMap: Map<number, number[]>,
    ports: Map<number, number[]>,
    gitMap: Map<string, { added: number; modified: number }>,
  ): AgentSession[] {
    const sessions = this.collectSessions(processInfo, childrenMap, ports, gitMap);
    this.evictStaleCache(sessions);
    sessions.sort((a, b) => b.startedAt - a.startedAt);
    return sessions;
  }

  private evictStaleCache(sessions: AgentSession[]): void {
    const activeIds = new Set(sessions.map((s) => s.sessionId));
    for (const sid of Object.keys(this.transcriptCache)) {
      if (!activeIds.has(sid)) delete this.transcriptCache[sid];
    }
  }

  private collectSessions(
    processInfo: Map<number, ProcInfo>,
    childrenMap: Map<number, number[]>,
    ports: Map<number, number[]>,
    gitMap: Map<string, { added: number; modified: number }>,
  ): AgentSession[] {
    const claudePids = findClaudePids(processInfo);
    const configRoot = path.join(os.homedir(), '.claude');
    const sessionsDir = path.join(configRoot, 'sessions');
    const projectsDir = path.join(configRoot, 'projects');

    // Read all session JSON files
    const sessionFiles = readSessionFiles(sessionsDir, claudePids);
    const discoveryCtx = buildDiscoveryContext(sessionFiles, processInfo);

    const sessions: AgentSession[] = [];
    const seenIds = new Set<string>();

    for (const sf of sessionFiles) {
      const session = this.loadSession(
        sf,
        projectsDir,
        processInfo,
        childrenMap,
        ports,
        gitMap,
        discoveryCtx,
      );
      if (session && !seenIds.has(session.sessionId)) {
        seenIds.add(session.sessionId);
        sessions.push(session);
      }
    }
    return sessions;
  }

  private loadSession(
    sf: SessionFile,
    projectsDir: string,
    processInfo: Map<number, ProcInfo>,
    childrenMap: Map<number, number[]>,
    ports: Map<number, number[]>,
    gitMap: Map<string, { added: number; modified: number }>,
    ctx: DiscoveryContext,
  ): AgentSession | null {
    const procCmd = processInfo.get(sf.pid)?.command;
    const pidAlive = procCmd != null && cmdHasBinary(procCmd, 'claude');

    // Skip --print sessions (abtop/waymark's own LLM summary calls)
    if (procCmd?.includes('--print')) return null;

    // Resolve project directory and apply /clear sid override
    const projectDir = resolveProjectDir(projectsDir, sf.cwd, sf.sessionId);
    const siblings = ctx.pidsPerCwd.get(sf.cwd) ?? 1;
    let sessionId = sf.sessionId;

    if (siblings <= 1) {
      const excluded = new Set<string>(
        [...ctx.claimedSidsByPid.entries()]
          .filter(([p]) => p !== sf.pid)
          .map(([, s]) => s),
      );
      const liveSid = findLiveSessionId(projectDir, sf.startedAt, excluded);
      if (liveSid && liveSid !== sessionId) sessionId = liveSid;
    }

    // Locate transcript file
    const transcriptPath = projectDir
      ? path.join(projectDir, `${sessionId}.jsonl`)
      : null;
    const transcriptExists =
      transcriptPath != null && fs.existsSync(transcriptPath) && !isSymlink(transcriptPath);

    // Parse transcript (incremental)
    let cached = this.transcriptCache[sessionId];
    if (transcriptExists && transcriptPath) {
      const stat = safeStatSync(transcriptPath);
      const currentIdentity: [number, number] = stat
        ? [stat.size, stat.mtimeMs]
        : [0, 0];
      const identityChanged =
        cached != null &&
        (cached.fileIdentity[0] !== currentIdentity[0] ||
          cached.fileIdentity[1] !== currentIdentity[1]);
      const fromOffset = identityChanged || cached == null ? 0 : cached.newOffset;

      const delta = parseTranscript(transcriptPath, fromOffset, currentIdentity);

      if (cached == null || identityChanged || fromOffset === 0) {
        this.transcriptCache[sessionId] = delta;
        cached = delta;
      } else {
        mergeTranscriptDelta(cached, delta);
        this.transcriptCache[sessionId] = cached;
      }
    }

    const tr = cached ?? emptyTranscriptResult();

    if (!pidAlive) return null;

    const proc = processInfo.get(sf.pid);
    const memMb = proc ? Math.floor(proc.rssKb / 1024) : 0;

    // Status detection
    const hasActiveChild = hasActiveDescendant(sf.pid, childrenMap, processInfo, 5.0);
    const modelGenerating = tr.lastUserTsMs > 0;
    let status: SessionStatus;
    if (hasActiveChild) {
      status = 'executing';
    } else if (modelGenerating) {
      status = 'thinking';
    } else {
      status = 'waiting';
    }

    const currentTasks = tr.currentTask
      ? [tr.currentTask]
      : status === 'waiting'
      ? ['waiting for input']
      : ['thinking...'];

    // Context window %
    const contextWindow = contextWindowForModel(tr.model, tr.maxContextTokens);
    const contextPercent =
      contextWindow > 0 ? (tr.lastContextTokens / contextWindow) * 100 : 0;

    // Children (all descendants, not just direct)
    const children = collectDescendants(sf.pid, childrenMap, processInfo, ports);

    // Git stats
    const git = gitMap.get(sf.cwd) ?? { added: 0, modified: 0 };

    // Sub-agents and memory
    const subagentDir =
      projectDir ? path.join(projectDir, sessionId, 'subagents') : null;
    const subagents = subagentDir ? collectSubAgents(subagentDir) : [];
    const memoryDir = projectDir ? path.join(projectDir, 'memory') : null;
    const [memFileCount, memLineCount] = memoryDir
      ? collectMemoryStatus(memoryDir)
      : [0, 0];

    return {
      agentCli: 'claude',
      pid: sf.pid,
      sessionId,
      cwd: sf.cwd,
      projectName: sf.cwd.split('/').pop() || '?',
      startedAt: sf.startedAt,
      status,
      model: tr.model,
      effort: readEffortLevel(sf.cwd),
      contextPercent,
      totalInputTokens: tr.totalInput,
      totalOutputTokens: tr.totalOutput,
      totalCacheRead: tr.totalCacheRead,
      totalCacheCreate: tr.totalCacheCreate,
      turnCount: tr.turnCount,
      currentTasks,
      memMb,
      version: tr.version,
      gitBranch: tr.gitBranch,
      gitAdded: git.added,
      gitModified: git.modified,
      tokenHistory: tr.tokenHistory,
      contextHistory: tr.contextHistory,
      compactionCount: tr.compactionCount,
      contextWindow,
      subagents,
      memFileCount,
      memLineCount,
      children,
      initialPrompt: tr.initialPrompt,
      firstAssistantText: tr.firstAssistantText,
      toolCalls: tr.toolCalls,
      pendingSinceMs: tr.lastAssistantTsMs,
      thinkingSinceMs: tr.lastUserTsMs,
      fileAccesses: tr.fileAccesses,
    };
  }
}

// ─── Session file discovery ───────────────────────────────────────────────────

function findClaudePids(processInfo: Map<number, ProcInfo>): number[] {
  const pids: number[] = [];
  for (const [pid, info] of processInfo) {
    if (cmdHasBinary(info.command, 'claude') && !info.command.includes('--print')) {
      pids.push(pid);
    }
  }
  return pids;
}

function readSessionFiles(sessionsDir: string, alivePids: number[]): SessionFile[] {
  const results: SessionFile[] = [];
  if (!fs.existsSync(sessionsDir)) return results;

  const alivePidSet = new Set(alivePids);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (!entry.name.endsWith('.json')) continue;
    const filePath = path.join(sessionsDir, entry.name);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sf = JSON.parse(content) as SessionFile;
      if (!sf.pid || !sf.sessionId || !sf.cwd) continue;
      // Sanitize
      sf.sessionId = sf.sessionId.slice(0, 256);
      sf.cwd = sf.cwd.slice(0, 4096);
      // Only return sessions whose PID is running (or scan all for fallback)
      if (alivePidSet.has(sf.pid) || alivePids.length === 0) {
        results.push(sf);
      }
    } catch {
      // Skip unreadable or malformed files
    }
  }
  return results;
}

// ─── Discovery context ────────────────────────────────────────────────────────

interface DiscoveryContext {
  claimedSidsByPid: Map<number, string>;
  pidsPerCwd: Map<string, number>;
}

function buildDiscoveryContext(
  sessionFiles: SessionFile[],
  processInfo: Map<number, ProcInfo>,
): DiscoveryContext {
  const claimedSidsByPid = new Map<number, string>();
  const pidsPerCwd = new Map<string, number>();
  const seenPids = new Set<number>();

  for (const sf of sessionFiles) {
    if (seenPids.has(sf.pid)) continue;
    seenPids.add(sf.pid);
    const info = processInfo.get(sf.pid);
    if (!info) continue;
    if (!cmdHasBinary(info.command, 'claude')) continue;
    if (info.command.includes('--print')) continue;
    pidsPerCwd.set(sf.cwd, (pidsPerCwd.get(sf.cwd) ?? 0) + 1);
    claimedSidsByPid.set(sf.pid, sf.sessionId);
  }

  return { claimedSidsByPid, pidsPerCwd };
}

// ─── Project directory resolution ─────────────────────────────────────────────

/**
 * Encode a cwd path the same way Claude Code does for project directory names:
 * `/Users/foo/bar` → `-Users-foo-bar`
 */
function encodeCwdPath(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

function resolveProjectDir(
  projectsDir: string,
  cwd: string,
  originalSid: string,
): string | null {
  const encoded = encodeCwdPath(cwd);
  const primary = path.join(projectsDir, encoded);
  const jsonlName = `${originalSid}.jsonl`;

  if (fs.existsSync(path.join(primary, jsonlName)) && !isSymlink(path.join(primary, jsonlName))) {
    return primary;
  }

  // Search sibling directories (handles worktree sessions)
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const candidate = path.join(projectsDir, entry.name, jsonlName);
      if (fs.existsSync(candidate) && !isSymlink(candidate)) {
        return path.join(projectsDir, entry.name);
      }
    }
  } catch {
    // ignore
  }

  return fs.existsSync(primary) ? primary : null;
}

/**
 * Find the currently-live session_id after a `/clear` command.
 * Picks the most recently modified `.jsonl` in the project directory
 * whose mtime >= (startedAt - 5s) and is not in the excluded set.
 */
function findLiveSessionId(
  projectDir: string | null,
  startedAtMs: number,
  excluded: Set<string>,
): string | null {
  if (!projectDir || !fs.existsSync(projectDir)) return null;

  const minMtime = startedAtMs - 5_000;
  let best: { mtime: number; sid: string } | null = null;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(projectDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (!entry.name.endsWith('.jsonl')) continue;
    const stem = entry.name.slice(0, -6);
    if (excluded.has(stem)) continue;

    const filePath = path.join(projectDir, entry.name);
    const stat = safeStatSync(filePath);
    if (!stat) continue;
    if (stat.mtimeMs < minMtime) continue;
    if (best == null || stat.mtimeMs > best.mtime) {
      best = { mtime: stat.mtimeMs, sid: stem };
    }
  }

  return best?.sid ?? null;
}

// ─── Transcript parsing ───────────────────────────────────────────────────────

const MAX_LINE_BYTES = 10 * 1024 * 1024; // 10 MB per line cap

function emptyTranscriptResult(): TranscriptResult {
  return {
    model: '-',
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheCreate: 0,
    lastContextTokens: 0,
    maxContextTokens: 0,
    contextHistory: [],
    compactionCount: 0,
    turnCount: 0,
    currentTask: '',
    version: '',
    gitBranch: '',
    tokenHistory: [],
    initialPrompt: '',
    firstAssistantText: '',
    toolCalls: [],
    lastAssistantTsMs: 0,
    lastUserTsMs: 0,
    sawTurn: false,
    fileAccesses: [],
    newOffset: 0,
    fileIdentity: [0, 0],
  };
}

/**
 * Parse a Claude transcript JSONL file starting from `fromOffset` bytes.
 * Returns cumulative deltas since that offset.
 *
 * Mirrors abtop's `parse_transcript`.
 */
function parseTranscript(
  filePath: string,
  fromOffset: number,
  fileIdentity: [number, number],
): TranscriptResult {
  const result = emptyTranscriptResult();
  result.fileIdentity = fileIdentity;
  result.newOffset = fromOffset;

  let fd: number;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return result;
  }

  try {
    const stat = fs.fstatSync(fd);
    const fileLen = stat.size;

    if (fileLen === fromOffset) {
      result.newOffset = fileLen;
      return result;
    }
    // File shrank → reparse from start
    const effectiveOffset = fileLen < fromOffset ? 0 : fromOffset;

    // Read from effectiveOffset to EOF
    const bufSize = fileLen - effectiveOffset;
    if (bufSize <= 0) return result;

    const buf = Buffer.allocUnsafe(bufSize);
    fs.readSync(fd, buf, 0, bufSize, effectiveOffset);
    const text = buf.toString('utf8');

    let bytesRead = effectiveOffset;
    let lineStart = 0;

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const lineBytes = Buffer.byteLength(rawLine, 'utf8') + 1; // +1 for \n

      // Last fragment without newline — defer to next poll
      const isLast = i === lines.length - 1;
      if (isLast && rawLine.length > 0) break;

      const line = rawLine.trim();
      if (!line) {
        bytesRead += lineBytes;
        continue;
      }
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
        // Oversize line — skip to EOF
        bytesRead = fileLen;
        break;
      }

      let val: Record<string, unknown>;
      try {
        val = JSON.parse(line) as Record<string, unknown>;
      } catch {
        bytesRead += lineBytes;
        continue;
      }

      processTranscriptLine(val, result);
      bytesRead += lineBytes;
    }

    result.newOffset = bytesRead;
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  }

  return result;
}

function processTranscriptLine(val: Record<string, unknown>, result: TranscriptResult): void {
  const type = val['type'] as string | undefined;

  if (type === 'assistant') {
    const entryTsMs = parseIso(val['timestamp'] as string | undefined);
    result.sawTurn = true;
    result.turnCount++;
    result.currentTask = '';
    result.lastAssistantTsMs = entryTsMs || result.lastAssistantTsMs;
    result.lastUserTsMs = 0;

    const msg = val['message'] as Record<string, unknown> | undefined;
    if (!msg) return;

    if (typeof msg['model'] === 'string') result.model = msg['model'];

    const usage = msg['usage'] as Record<string, unknown> | undefined;
    if (usage) {
      const inp = (usage['input_tokens'] as number) || 0;
      const out = (usage['output_tokens'] as number) || 0;
      const cr = (usage['cache_read_input_tokens'] as number) || 0;
      const cc = (usage['cache_creation_input_tokens'] as number) || 0;
      result.totalInput += inp;
      result.totalOutput += out;
      result.totalCacheRead += cr;
      result.totalCacheCreate += cc;

      // Context = input + cache_read (exclude cache_creation, see #54)
      const prevContext = result.lastContextTokens;
      result.lastContextTokens = inp + cr;
      if (result.lastContextTokens > result.maxContextTokens) {
        result.maxContextTokens = result.lastContextTokens;
      }
      // Compaction: context drops > 30% between turns
      if (prevContext > 0 && result.lastContextTokens < prevContext * 0.7) {
        result.compactionCount++;
      }
      if (result.contextHistory.length < 10_000) result.contextHistory.push(result.lastContextTokens);
      if (result.tokenHistory.length < 10_000) result.tokenHistory.push(inp + out + cr + cc);
    }

    // Extract first assistant text for summary fallback
    if (!result.firstAssistantText) {
      const content = msg['content'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        const texts = content
          .filter((b) => b['type'] === 'text')
          .map((b) => (b['text'] as string) || '')
          .filter(Boolean);
        if (texts.length > 0) {
          result.firstAssistantText = texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
        }
      }
    }

    // Extract tool_use blocks → current task + tool timeline
    const content = msg['content'] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block['type'] !== 'tool_use') continue;
        const toolName = (block['name'] as string) || '';
        const input = (block['input'] as Record<string, unknown>) || {};
        const toolArg = extractToolArg(toolName, input);
        if (!result.currentTask) result.currentTask = `${toolName} ${toolArg}`.trim();

        // Track file accesses for audit log
        const fileOp = toolNameToFileOp(toolName);
        const filePath = (input['file_path'] as string) || (input['path'] as string) || '';
        if (fileOp && filePath) {
          result.fileAccesses.push({ path: filePath, operation: fileOp, turnIndex: result.turnCount });
          // Sliding window cap
          if (result.fileAccesses.length > MAX_FILE_ACCESSES) {
            result.fileAccesses.splice(0, result.fileAccesses.length - MAX_FILE_ACCESSES);
          }
        }

        // Add to tool call timeline
        if (result.toolCalls.length < 500) {
          result.toolCalls.push({ name: toolName, arg: toolArg, durationMs: 0 });
        }
      }
    }
  } else if (type === 'user') {
    result.sawTurn = true;
    const entryTsMs = parseIso(val['timestamp'] as string | undefined);
    const msg = val['message'] as Record<string, unknown> | undefined;

    // Skip tool_result wrappers — only real user prompts should flip lastUserTsMs
    const role = msg?.['role'] as string | undefined;
    const content = msg?.['content'];
    const isToolResult =
      Array.isArray(content) &&
      (content as Array<Record<string, unknown>>).some((b) => b['type'] === 'tool_result');
    if (!isToolResult && role === 'user') {
      result.lastUserTsMs = entryTsMs || 0;
      result.lastAssistantTsMs = 0;
    }

    if (typeof val['version'] === 'string' && !result.version) {
      result.version = val['version'];
    }
    if (typeof val['gitBranch'] === 'string') {
      result.gitBranch = val['gitBranch'];
    }

    // Capture initial prompt (first real user message)
    if (!result.initialPrompt && !isToolResult && typeof content === 'string') {
      result.initialPrompt = redactSecrets(content.slice(0, 120));
    }
  }
}

// ─── Transcript cache merge ───────────────────────────────────────────────────

function mergeTranscriptDelta(prev: TranscriptResult, delta: TranscriptResult): void {
  if (delta.model !== '-') prev.model = delta.model;
  prev.totalInput += delta.totalInput;
  prev.totalOutput += delta.totalOutput;
  prev.totalCacheRead += delta.totalCacheRead;
  prev.totalCacheCreate += delta.totalCacheCreate;
  if (delta.lastContextTokens > 0) prev.lastContextTokens = delta.lastContextTokens;
  if (delta.maxContextTokens > prev.maxContextTokens) prev.maxContextTokens = delta.maxContextTokens;
  prev.compactionCount += delta.compactionCount;
  prev.turnCount += delta.turnCount;
  if (delta.turnCount > 0) prev.currentTask = delta.currentTask;
  if (delta.version) prev.version = delta.version;
  if (delta.gitBranch) prev.gitBranch = delta.gitBranch;
  prev.tokenHistory.push(...delta.tokenHistory);
  prev.contextHistory.push(...delta.contextHistory);
  if (prev.toolCalls.length < 500) {
    prev.toolCalls.push(...delta.toolCalls.slice(0, 500 - prev.toolCalls.length));
  }
  if (delta.sawTurn) {
    prev.lastAssistantTsMs = delta.lastAssistantTsMs;
    prev.lastUserTsMs = delta.lastUserTsMs;
  }
  if (!prev.initialPrompt && delta.initialPrompt) prev.initialPrompt = delta.initialPrompt;
  if (!prev.firstAssistantText && delta.firstAssistantText) prev.firstAssistantText = delta.firstAssistantText;
  prev.fileAccesses.push(...delta.fileAccesses);
  if (prev.fileAccesses.length > MAX_FILE_ACCESSES) {
    prev.fileAccesses.splice(0, prev.fileAccesses.length - MAX_FILE_ACCESSES);
  }
  prev.newOffset = delta.newOffset;
  prev.fileIdentity = delta.fileIdentity;
  prev.sawTurn = delta.sawTurn;
}

// ─── Sub-agents ───────────────────────────────────────────────────────────────

function collectSubAgents(subagentsDir: string): SubAgent[] {
  const subagents: SubAgent[] = [];
  if (!fs.existsSync(subagentsDir)) return subagents;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(subagentsDir, { withFileTypes: true });
  } catch {
    return subagents;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (!entry.name.endsWith('.meta.json')) continue;

    const metaPath = path.join(subagentsDir, entry.name);
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }

    const description = (meta['description'] as string) || 'agent';
    const jsonlName = entry.name.replace('.meta.json', '.jsonl');
    const jsonlPath = path.join(subagentsDir, jsonlName);

    let tokens = 0;
    let mtimeMs = 0;
    if (fs.existsSync(jsonlPath)) {
      const stat = safeStatSync(jsonlPath);
      mtimeMs = stat?.mtimeMs ?? 0;
      // Parse transcript for token total
      const identity: [number, number] = stat ? [stat.size, stat.mtimeMs] : [0, 0];
      const tr = parseTranscript(jsonlPath, 0, identity);
      tokens = tr.totalInput + tr.totalOutput + tr.totalCacheRead + tr.totalCacheCreate;
    }

    const ageSecs = (Date.now() - mtimeMs) / 1000;
    subagents.push({
      name: description.slice(0, 30),
      status: ageSecs < 30 ? 'working' : 'done',
      tokens,
    });
  }
  return subagents;
}

// ─── Memory status ────────────────────────────────────────────────────────────

function collectMemoryStatus(memoryDir: string): [number, number] {
  let fileCount = 0;
  let lineCount = 0;
  if (!fs.existsSync(memoryDir)) return [fileCount, lineCount];

  try {
    const entries = fs.readdirSync(memoryDir, { withFileTypes: true });
    fileCount = entries.filter((e) => e.isFile()).length;
  } catch { /* ignore */ }

  const memMd = path.join(memoryDir, 'MEMORY.md');
  try {
    const content = fs.readFileSync(memMd, 'utf8');
    lineCount = content.split('\n').length;
  } catch { /* ignore */ }

  return [fileCount, lineCount];
}

// ─── Effort level ─────────────────────────────────────────────────────────────

/**
 * Read the effort level from `~/.claude/settings.json` or the project's
 * `.claude/settings.json`.  Returns empty string when not configured.
 */
function readEffortLevel(cwd: string): string {
  const candidates = [
    path.join(cwd, '.claude', 'settings.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
  ];
  for (const p of candidates) {
    try {
      const obj = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
      const level = obj['effortLevel'] as string | undefined;
      if (level) return level;
    } catch { /* continue */ }
  }
  return '';
}

// ─── Descendant collection ────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeStatSync(filePath: string): fs.Stats | null {
  try { return fs.statSync(filePath); } catch { return null; }
}

function isSymlink(filePath: string): boolean {
  try { return fs.lstatSync(filePath).isSymbolicLink(); } catch { return true; }
}

function parseIso(ts: string | undefined): number {
  if (!ts) return 0;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? 0 : ms;
}

function extractToolArg(toolName: string, input: Record<string, unknown>): string {
  const filePath = (input['file_path'] as string) || (input['path'] as string);
  if (filePath) return redactSecrets(filePath.split('/').pop() ?? filePath).slice(0, 120);
  const cmd = (input['command'] as string) || (input['cmd'] as string);
  if (cmd) return redactSecrets(cmd).slice(0, 120);
  return '';
}

function toolNameToFileOp(name: string): 'Read' | 'Write' | 'Edit' | null {
  const lower = name.toLowerCase();
  if (lower === 'read' || lower === 'read_file') return 'Read';
  if (lower === 'write' || lower === 'write_file') return 'Write';
  if (lower === 'edit' || lower === 'edit_file') return 'Edit';
  return null;
}
