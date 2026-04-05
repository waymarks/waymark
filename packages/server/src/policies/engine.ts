import * as fs from 'fs';
import * as path from 'path';
import micromatch from 'micromatch';

const PROJECT_ROOT = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
const CONFIG_PATH = path.join(PROJECT_ROOT, 'waymark.config.json');

export interface WaymarkConfig {
  version: string;
  policies: {
    allowedPaths: string[];
    blockedPaths: string[];
    blockedCommands: string[];
    requireApproval: string[];
    maxBashOutputBytes: number;
  };
}

export interface PolicyResult {
  decision: 'allow' | 'block' | 'pending';
  reason: string;
  matchedRule: string;
}

const DEFAULT_CONFIG: WaymarkConfig = {
  version: '1',
  policies: {
    allowedPaths: [],
    blockedPaths: [],
    blockedCommands: [],
    requireApproval: [],
    maxBashOutputBytes: 10000,
  },
};

export function loadConfig(): WaymarkConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as WaymarkConfig;
    // Ensure all policy arrays exist
    if (!parsed.policies) return DEFAULT_CONFIG;
    return {
      version: parsed.version || '1',
      policies: {
        allowedPaths: parsed.policies.allowedPaths || [],
        blockedPaths: parsed.policies.blockedPaths || [],
        blockedCommands: parsed.policies.blockedCommands || [],
        requireApproval: parsed.policies.requireApproval || [],
        maxBashOutputBytes: parsed.policies.maxBashOutputBytes ?? 10000,
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function resolvePattern(pattern: string): string {
  // Absolute patterns pass through; relative (./...) resolve from project root
  if (path.isAbsolute(pattern)) return pattern;
  return path.resolve(PROJECT_ROOT, pattern);
}

function matchesAny(absFilePath: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    const absPattern = resolvePattern(pattern);
    if (micromatch.isMatch(absFilePath, absPattern, { dot: true })) {
      return pattern;
    }
  }
  return null;
}

export function checkFileAction(
  filePath: string,
  action: 'read' | 'write',
  config: WaymarkConfig
): PolicyResult {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
  const { blockedPaths, requireApproval, allowedPaths } = config.policies;

  // 1. Blocked (both read and write)
  const blockedMatch = matchesAny(absPath, blockedPaths);
  if (blockedMatch) {
    return {
      decision: 'block',
      reason: `Path matches blocked rule`,
      matchedRule: blockedMatch,
    };
  }

  // 2. Requires approval (writes only — reads are idempotent, no approval needed)
  if (action === 'write') {
    const approvalMatch = matchesAny(absPath, requireApproval);
    if (approvalMatch) {
      return {
        decision: 'pending',
        reason: `Path requires approval before execution`,
        matchedRule: approvalMatch,
      };
    }
  }

  // 3. Allowed
  const allowedMatch = matchesAny(absPath, allowedPaths);
  if (allowedMatch) {
    return {
      decision: 'allow',
      reason: `Path matches allowed rule`,
      matchedRule: allowedMatch,
    };
  }

  // 4. Default: block
  return {
    decision: 'block',
    reason: `Path not in allowedPaths`,
    matchedRule: '(default deny)',
  };
}

function isCommandBlocked(command: string, rule: string): boolean {
  if (rule.startsWith('regex:')) {
    const pattern = rule.slice(6);
    try {
      return new RegExp(pattern, 'i').test(command);
    } catch {
      console.warn(`Invalid regex in blockedCommands: ${rule}`);
      return false;
    }
  }
  return command.includes(rule);
}

export function checkBashAction(command: string, config: WaymarkConfig): PolicyResult {
  const { blockedCommands } = config.policies;

  for (const rule of blockedCommands) {
    if (isCommandBlocked(command, rule)) {
      const displayRule = rule.startsWith('regex:') ? rule.slice(6) : rule;
      return {
        decision: 'block',
        reason: `Command matches blocked rule: "${displayRule}"`,
        matchedRule: rule,
      };
    }
  }

  return {
    decision: 'allow',
    reason: 'Command allowed',
    matchedRule: '(default allow)',
  };
}
