import * as fs from 'fs';
import * as path from 'path';
import micromatch from 'micromatch';

// Evaluate at runtime to support test environment variable changes
function getProjectRoot(): string {
  return process.env.WAYMARK_PROJECT_ROOT || process.cwd();
}

function getConfigPath(): string {
  return path.join(getProjectRoot(), 'waymark.config.json');
}

export interface WaymarkConfig {
  version: string;
  /**
   * Optional dashboard/MCP port pin. When set, `waymark start` binds exactly
   * this port instead of auto-allocating from the 47000-47999 range. If the
   * port is already in use, start aborts with a readable error rather than
   * silently reassigning. Override at runtime with `waymark start --port <n>`.
   */
  port?: number;
  policies: {
    allowedPaths: string[];
    blockedPaths: string[];
    blockedCommands: string[];
    requireApproval: string[];
    /** Bash command patterns that queue for human approval rather than execute immediately. */
    requireApprovalBash?: string[];
    /** Bash command whitelist. When non-empty, only listed commands are allowed. */
    allowedCommands?: string[];
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
    requireApprovalBash: [],
    allowedCommands: [],
    maxBashOutputBytes: 10000,
  },
};

export function loadConfig(): WaymarkConfig {
  try {
    const configPath = getConfigPath();
    const raw = fs.readFileSync(configPath, 'utf8');
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
        requireApprovalBash: parsed.policies.requireApprovalBash || [],
        allowedCommands: parsed.policies.allowedCommands || [],
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
  return path.resolve(getProjectRoot(), pattern);
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
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(getProjectRoot(), filePath);
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
  const { blockedCommands, requireApprovalBash = [], allowedCommands = [] } = config.policies;

  // 1. Block rules (highest priority)
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

  // 2. Requires approval queue
  for (const rule of requireApprovalBash) {
    if (isCommandBlocked(command, rule)) {
      return {
        decision: 'pending',
        reason: `Command requires human approval before execution`,
        matchedRule: rule,
      };
    }
  }

  // 3. Allowed commands whitelist — when non-empty, enforce default-deny for bash
  if (allowedCommands.length > 0) {
    const matched = allowedCommands.find(rule => isCommandBlocked(command, rule));
    if (!matched) {
      return {
        decision: 'block',
        reason: 'Command not in allowedCommands whitelist',
        matchedRule: '(default deny bash)',
      };
    }
    return { decision: 'allow', reason: 'Command in allowedCommands whitelist', matchedRule: matched };
  }

  return {
    decision: 'allow',
    reason: 'Command allowed',
    matchedRule: '(default allow)',
  };
}
