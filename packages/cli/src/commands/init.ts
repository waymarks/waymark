import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { spawnSync } from 'child_process';

const DEFAULT_CONFIG = {
  version: '1',
  policies: {
    allowedPaths: [
      './src/**',
      './data/**',
      './README.md',
      './CLAUDE.md'
    ],
    blockedPaths: [
      './.env',
      './.env.*',
      './package-lock.json',
      '/etc/**',
      '/usr/**'
    ],
    blockedCommands: [
      'rm -rf',
      'DROP TABLE',
      'DROP DATABASE',
      'chmod 777',
      'regex:\\|\\s*bash',
      'regex:\\|\\s*sh\\b',
      'regex:\\$\\(curl',
      'regex:\\$\\(wget',
      'wget '
    ],
    requireApproval: [
      './src/db/**',
      './waymark.config.json'
    ],
    maxBashOutputBytes: 10000
  }
};

const CLAUDE_MD_CONTENT = `# Waymark — Active in this project

All file system actions in this project are monitored and controlled by Waymark.

## Rules (auto-loaded from waymark.config.json)
- Always use Waymark MCP tools for file operations
- Use waymark:write_file instead of write_file
- Use waymark:read_file instead of read_file
- Use waymark:bash instead of bash
- Never bypass Waymark tools for any file operation

## Why
Waymark logs all actions, enforces scope policies,
enables rollback, and routes sensitive paths for
human approval before execution.

## Dashboard
View all actions at: http://localhost:3001
`;

const WAYMARK_MARKER = '<!-- waymark -->';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function getClaudeDesktopConfigPath(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'Claude', 'claude_desktop_config.json');
  } else {
    return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function resolveServerBin(): string {
  // Try installed @shaifulshabuj-waymarks/server package
  try {
    return require.resolve('@shaifulshabuj-waymarks/server/dist/mcp/server.js');
  } catch {
    // Fallback: assume we're inside the waymark monorepo
    return path.resolve(__dirname, '../../../server/dist/mcp/server.js');
  }
}

export async function run(): Promise<void> {
  const projectRoot = process.cwd();
  console.log(`Initializing Waymark in: ${projectRoot}`);

  // Step 1 — Detect project
  const hasPackageJson = fs.existsSync(path.join(projectRoot, 'package.json'));
  const hasGit = fs.existsSync(path.join(projectRoot, '.git'));
  if (!hasPackageJson && !hasGit) {
    console.warn('Warning: No package.json or .git found. Continuing anyway.');
  }

  // Step 2 — Install @shaifulshabuj-waymarks/server (skip if already resolvable or in monorepo)
  let serverBin: string;
  try {
    serverBin = require.resolve('@shaifulshabuj-waymarks/server/dist/mcp/server.js');
    console.log('✓ @shaifulshabuj-waymarks/server already installed');
  } catch {
    const monorepoFallback = path.resolve(__dirname, '../../../server/dist/mcp/server.js');
    if (fs.existsSync(monorepoFallback)) {
      serverBin = monorepoFallback;
      console.log('✓ Using local @shaifulshabuj-waymarks/server (monorepo)');
    } else {
      console.log('Installing @shaifulshabuj-waymarks/server...');
      const result = spawnSync('npm', ['install', '--save-dev', '@shaifulshabuj-waymarks/server'], {
        stdio: 'inherit',
        cwd: projectRoot
      });
      if (result.status !== 0) {
        console.error('Failed to install @shaifulshabuj-waymarks/server');
        process.exit(1);
      }
      serverBin = resolveServerBin();
    }
  }

  // Step 3 — Create waymark.config.json
  const configPath = path.join(projectRoot, 'waymark.config.json');
  if (fs.existsSync(configPath)) {
    const answer = await prompt('waymark.config.json exists. Overwrite? (y/N) ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Keeping existing waymark.config.json');
    } else {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
      console.log('✓ Created waymark.config.json');
    }
  } else {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    console.log('✓ Created waymark.config.json');
  }

  // Step 4 — Create/append CLAUDE.md
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const existing = fs.readFileSync(claudeMdPath, 'utf8');
    if (existing.includes(WAYMARK_MARKER)) {
      console.log('✓ CLAUDE.md already has Waymark section');
    } else {
      fs.appendFileSync(claudeMdPath, `\n${WAYMARK_MARKER}\n${CLAUDE_MD_CONTENT}`);
      console.log('✓ Appended Waymark section to CLAUDE.md');
    }
  } else {
    fs.writeFileSync(claudeMdPath, `${WAYMARK_MARKER}\n${CLAUDE_MD_CONTENT}`);
    console.log('✓ Created CLAUDE.md — Claude Code will now use Waymark automatically');
  }

  // Step 5 — Update .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const gitignoreContent = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';
  const linesToAdd = ['.waymark/', 'waymark.db', 'data/waymark.db']
    .filter(line => !gitignoreContent.includes(line));
  if (linesToAdd.length > 0) {
    const section = '\n# Waymark\n' + linesToAdd.join('\n') + '\n';
    fs.appendFileSync(gitignorePath, section);
    console.log('✓ Updated .gitignore');
  } else {
    console.log('✓ .gitignore already up to date');
  }

  // Step 6 — Register MCP in both Claude configs
  const nodeBin = process.execPath;
  const mcpEntry = {
    command: nodeBin,
    args: [serverBin, '--project-root', projectRoot]
  };

  // Claude Desktop config
  const desktopConfigPath = getClaudeDesktopConfigPath();
  try {
    const desktopDir = path.dirname(desktopConfigPath);
    if (!fs.existsSync(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });
    const desktopConfig = fs.existsSync(desktopConfigPath)
      ? JSON.parse(fs.readFileSync(desktopConfigPath, 'utf8'))
      : { mcpServers: {} };
    if (!desktopConfig.mcpServers) desktopConfig.mcpServers = {};
    if (desktopConfig.mcpServers.waymark) {
      console.log('✓ Claude Desktop MCP entry already exists — skipping');
    } else {
      desktopConfig.mcpServers.waymark = mcpEntry;
      fs.writeFileSync(desktopConfigPath, JSON.stringify(desktopConfig, null, 2) + '\n');
      console.log('✓ Registered Waymark MCP server in Claude Desktop config');
    }
  } catch (err: any) {
    console.warn(`Warning: Could not update Claude Desktop config: ${err.message}`);
  }

  // .mcp.json (Claude Code project-level)
  const mcpJsonPath = path.join(projectRoot, '.mcp.json');
  try {
    const mcpJson = fs.existsSync(mcpJsonPath)
      ? JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'))
      : { mcpServers: {} };
    if (!mcpJson.mcpServers) mcpJson.mcpServers = {};
    if (mcpJson.mcpServers.waymark) {
      console.log('✓ .mcp.json Waymark entry already exists — skipping');
    } else {
      mcpJson.mcpServers.waymark = { type: 'stdio', ...mcpEntry, cwd: projectRoot };
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2) + '\n');
      console.log('✓ Created .mcp.json for Claude Code');
    }
  } catch (err: any) {
    console.warn(`Warning: Could not update .mcp.json: ${err.message}`);
  }

  // Step 7 — Success summary
  console.log('');
  console.log('┌─────────────────────────────────────┐');
  console.log('│  ✅ Waymark initialized             │');
  console.log('│                                     │');
  console.log('│  Files created:                     │');
  console.log('│    waymark.config.json              │');
  console.log('│    CLAUDE.md                        │');
  console.log('│                                     │');
  console.log('│  Next steps:                        │');
  console.log('│  1. Restart Claude Code             │');
  console.log('│  2. Open this project in Claude     │');
  console.log('│  3. View dashboard:                 │');
  console.log('│npx @shaifulshabuj-waymarks/cli start│');
  console.log('│     http://localhost:3001           │');
  console.log('│                                     │');
  console.log('│  Waymark is now always-on in        │');
  console.log('│  this project. No manual setup      │');
  console.log('│  required per session.              │');
  console.log('└─────────────────────────────────────┘');
}
