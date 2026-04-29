/**
 * Process-tree and system data collector.
 *
 * Mirrors abtop/src/collector/process.rs:
 *   - getProcessInfo()      → ps -eo pid,ppid,rss,%cpu,command
 *   - getChildrenMap()      → adjacency map from ppid
 *   - getListeningPorts()   → lsof -i -P -n -sTCP:LISTEN
 *   - collectGitStats()     → git -C <cwd> status --porcelain
 *   - hasActiveDescendant() → recursive CPU check
 */

import { execSync, execFileSync } from 'child_process';
import * as path from 'path';
import { ProcInfo } from './types';

// ─── Process info ────────────────────────────────────────────────────────────

/**
 * Run `ps` and return a map of pid → ProcInfo.
 * Works on macOS and Linux (ps -eo is POSIX).
 */
export function getProcessInfo(): Map<number, ProcInfo> {
  const map = new Map<number, ProcInfo>();
  let stdout: string;
  try {
    // -ww: unlimited command width  -eo: exact output columns
    stdout = execSync('ps -ww -eo pid,ppid,rss,%cpu,command', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return map;
  }

  const lines = stdout.split('\n').slice(1); // skip header
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const pid = parseInt(parts[0], 10);
    const ppid = parseInt(parts[1], 10);
    const rssKb = parseInt(parts[2], 10);
    const cpuPct = parseFloat(parts[3]);
    const command = parts.slice(4).join(' ');
    if (isNaN(pid) || isNaN(ppid)) continue;
    map.set(pid, { pid, ppid, rssKb: rssKb || 0, cpuPct: cpuPct || 0, command });
  }
  return map;
}

/**
 * Build a parent-PID → child-PIDs map from the full process table.
 */
export function getChildrenMap(procs: Map<number, ProcInfo>): Map<number, number[]> {
  const children = new Map<number, number[]>();
  for (const proc of procs.values()) {
    const list = children.get(proc.ppid) ?? [];
    list.push(proc.pid);
    children.set(proc.ppid, list);
  }
  return children;
}

/**
 * Return true if any descendant of `pid` has CPU% above `cpuThreshold`.
 * Mirrors abtop's `has_active_descendant`.
 */
export function hasActiveDescendant(
  pid: number,
  childrenMap: Map<number, number[]>,
  processInfo: Map<number, ProcInfo>,
  cpuThreshold = 5.0,
): boolean {
  const stack = [pid];
  const visited = new Set<number>();
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (visited.has(p)) continue;
    visited.add(p);
    const kids = childrenMap.get(p) ?? [];
    for (const kid of kids) {
      const info = processInfo.get(kid);
      if (info && info.cpuPct > cpuThreshold) return true;
      stack.push(kid);
    }
  }
  return false;
}

/**
 * Check whether a command string contains a given binary name in executable
 * position (first or second token — covers `node /path/to/codex ...`).
 * Mirrors abtop's `cmd_has_binary`.
 */
export function cmdHasBinary(cmd: string, name: string): boolean {
  const tokens = cmd.trim().split(/\s+/).slice(0, 2);
  return tokens.some((tok) => {
    const base = tok.split('/').pop() ?? tok;
    return base === name;
  });
}

// ─── Listening ports ──────────────────────────────────────────────────────────

/**
 * Return a map of pid → port[] by parsing `lsof -i -P -n -sTCP:LISTEN`.
 * Mirrors abtop's `get_listening_ports` (non-Linux path).
 */
export function getListeningPorts(): Map<number, number[]> {
  const map = new Map<number, number[]>();
  let stdout: string;
  try {
    stdout = execSync('lsof -i -P -n -sTCP:LISTEN', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return map;
  }

  for (const line of stdout.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME (LISTEN)
    if (parts.length < 9) continue;
    if (parts[7] !== 'TCP') continue;
    if (!line.includes('(LISTEN)')) continue;

    const pid = parseInt(parts[1], 10);
    if (isNaN(pid)) continue;

    // NAME field: *:3000 or 127.0.0.1:3000
    const addr = parts[8] ?? '';
    const portStr = addr.split(':').pop();
    if (!portStr) continue;
    const port = parseInt(portStr, 10);
    if (isNaN(port)) continue;

    const ports = map.get(pid) ?? [];
    if (!ports.includes(port)) ports.push(port);
    map.set(pid, ports);
  }
  return map;
}

// ─── Git status ───────────────────────────────────────────────────────────────

/**
 * Run `git -C <cwd> status --porcelain` and return [added, modified] counts.
 * Mirrors abtop's `collect_git_stats`.
 */
export function collectGitStats(cwd: string): { added: number; modified: number } {
  // Validate cwd is an absolute path before using as a working directory
  if (!cwd || !path.isAbsolute(cwd)) return { added: 0, modified: 0 };

  let stdout: string;
  try {
    stdout = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return { added: 0, modified: 0 };
  }

  let added = 0;
  let modified = 0;
  for (const line of stdout.split('\n')) {
    if (line.length < 2) continue;
    const code = line.slice(0, 2);
    if (code.includes('?') || code.includes('A')) added++;
    else if (code.includes('M')) modified++;
  }
  return { added, modified };
}

// ─── Open file paths via lsof ─────────────────────────────────────────────────

/**
 * Map each PID to the list of file paths it has open.
 * Uses `lsof -F ftn -p<pid1> -p<pid2> ...` (field output).
 * Mirrors abtop's `map_pid_to_lsof_open_paths`.
 */
export function mapPidsToOpenPaths(pids: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (pids.length === 0) return map;

  // Build args array: per-PID filters use separate -p flags
  const lsofArgs = ['-F', 'ftn', ...pids.map((p) => `-p${p}`)];
  let stdout: string;
  try {
    stdout = execFileSync('lsof', lsofArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return map;
  }

  let currentPid: number | null = null;
  let currentFd = '';
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) {
      currentPid = parseInt(line.slice(1), 10) || null;
      if (currentPid != null && !map.has(currentPid)) map.set(currentPid, []);
      currentFd = '';
    } else if (line.startsWith('f')) {
      currentFd = line.slice(1);
    } else if (line.startsWith('n') && currentPid != null) {
      const name = line.slice(1);
      if (!name || name.startsWith('[')) continue;
      const paths = map.get(currentPid) ?? [];
      paths.push(name);
      if (!map.has(currentPid)) map.set(currentPid, paths);
    }
  }
  return map;
}
