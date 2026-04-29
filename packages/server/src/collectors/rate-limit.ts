/**
 * Rate limit file reader for Claude Code.
 *
 * Mirrors abtop/src/collector/rate_limit.rs.
 *
 * Claude Code rate limits are NOT in the transcript JSONL. They are written
 * by the StatusLine hook installed via `abtop --setup` (or `waymark --setup`).
 *
 * File: ~/.claude/abtop-rate-limits.json
 * Format:
 *   {
 *     "source": "claude",
 *     "five_hour":  { "used_percentage": 35.0, "resets_at": 1774715000 },
 *     "seven_day":  { "used_percentage": 12.0, "resets_at": 1775320000 },
 *     "updated_at": 1774714400
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RateLimitInfo } from './types';

const RATE_FILE_NAME = 'abtop-rate-limits.json';
/** Reject stale Claude rate limit data older than 10 minutes. */
const MAX_STALENESS_SECS = 600;

interface WindowInfo {
  used_percentage?: number;
  resets_at?: number;
}

interface RateLimitFile {
  source?: string;
  five_hour?: WindowInfo;
  seven_day?: WindowInfo;
  updated_at?: number;
}

/**
 * Read Claude rate limit info from all candidate config directories.
 * Checks `~/.claude`, `CLAUDE_CONFIG_DIR` env var, and any extra dirs
 * provided (e.g. discovered from running Claude process environments).
 *
 * Returns all valid, non-stale entries (typically zero or one).
 */
export function readClaudeRateLimits(extraDirs: string[] = []): RateLimitInfo[] {
  const results: RateLimitInfo[] = [];
  const seen = new Set<string>();

  const candidates: string[] = [path.join(os.homedir(), '.claude')];
  const envDir = process.env['CLAUDE_CONFIG_DIR'];
  if (envDir) candidates.push(envDir);
  candidates.push(...extraDirs);

  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    if (!fs.existsSync(resolved)) continue;
    const filePath = path.join(resolved, RATE_FILE_NAME);
    const info = readRateFile(filePath, 'claude');
    if (info) results.push(info);
  }

  return results;
}

/**
 * Read Codex rate limit from the shared cache file written by the collector.
 * File: ~/.cache/abtop/codex-rate-limits.json
 */
export function readCodexRateLimitCache(): RateLimitInfo | null {
  const cacheDir = process.env['XDG_CACHE_HOME'] ?? path.join(os.homedir(), '.cache');
  const filePath = path.join(cacheDir, 'abtop', 'codex-rate-limits.json');
  return readRateFile(filePath, 'codex', /* checkStaleness */ false);
}

/**
 * Atomically write Codex rate limit to the shared cache file.
 * Mirrors abtop's `write_codex_cache`.
 */
export function writeCodexRateLimitCache(info: RateLimitInfo): void {
  const cacheDir = process.env['XDG_CACHE_HOME'] ?? path.join(os.homedir(), '.cache');
  const dir = path.join(cacheDir, 'abtop');
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, 'codex-rate-limits.json');
  const tmp = filePath + '.tmp';

  const json = JSON.stringify({
    source: 'codex',
    five_hour: info.fiveHourPct != null
      ? { used_percentage: info.fiveHourPct, resets_at: info.fiveHourResetsAt ?? 0 }
      : null,
    seven_day: info.sevenDayPct != null
      ? { used_percentage: info.sevenDayPct, resets_at: info.sevenDayResetsAt ?? 0 }
      : null,
    updated_at: info.updatedAt ?? null,
  });

  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, filePath);
  } catch {
    // Best-effort; ignore write failures
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readRateFile(
  filePath: string,
  defaultSource: string,
  checkStaleness = true,
): RateLimitInfo | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  let file: RateLimitFile;
  try {
    file = JSON.parse(content) as RateLimitFile;
  } catch {
    return null;
  }

  // Must have at least one window
  if (!file.five_hour && !file.seven_day) return null;

  // Reject stale Claude data
  if (checkStaleness && file.updated_at != null) {
    const nowSecs = Math.floor(Date.now() / 1000);
    if (nowSecs - file.updated_at > MAX_STALENESS_SECS) return null;
  }

  return {
    source: file.source || defaultSource,
    fiveHourPct: file.five_hour?.used_percentage,
    fiveHourResetsAt: file.five_hour?.resets_at,
    sevenDayPct: file.seven_day?.used_percentage,
    sevenDayResetsAt: file.seven_day?.resets_at,
    updatedAt: file.updated_at,
  };
}
