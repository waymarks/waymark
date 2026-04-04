import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';

function resolveServerBin(name: 'mcp' | 'api'): string {
  const file = name === 'mcp' ? 'mcp/server.js' : 'api/server.js';
  try {
    return require.resolve(`@shaifulshabuj-waymarks/server/dist/${file}`);
  } catch {
    return path.resolve(__dirname, `../../../server/dist/${file}`);
  }
}

function openBrowser(url: string): void {
  try {
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    execSync(`${cmd} ${url}`, { stdio: 'ignore' });
  } catch {
    // ignore — browser open is best-effort
  }
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function run(): void {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, 'waymark.config.json');
  const waymarkDir = path.join(projectRoot, '.waymark');
  const pidFile = path.join(waymarkDir, 'waymark.pid');

  if (!fs.existsSync(configPath)) {
    console.error('waymark.config.json not found. Run waymark init first.');
    process.exit(1);
  }

  // Guard: already running
  if (fs.existsSync(pidFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      if (isAlive(saved.api) || isAlive(saved.mcp)) {
        console.log('Waymark is already running.');
        console.log('Dashboard:  http://localhost:3001');
        console.log('Run "waymark stop" to stop it.');
        process.exit(0);
      }
    } catch {
      // stale/corrupt PID file — continue to start
    }
  }

  const nodeBin = process.execPath;
  const mcpBin = resolveServerBin('mcp');
  const apiBin = resolveServerBin('api');
  const env = { ...process.env, WAYMARK_PROJECT_ROOT: projectRoot };

  const apiProc = spawn(nodeBin, [apiBin], {
    env,
    stdio: 'ignore',
    detached: true
  });
  const mcpProc = spawn(nodeBin, [mcpBin, '--project-root', projectRoot], {
    env,
    stdio: 'ignore',
    detached: true
  });

  apiProc.unref();
  mcpProc.unref();

  // Write PID file
  if (!fs.existsSync(waymarkDir)) fs.mkdirSync(waymarkDir, { recursive: true });
  fs.writeFileSync(pidFile, JSON.stringify({
    api: apiProc.pid,
    mcp: mcpProc.pid,
    startedAt: new Date().toISOString()
  }, null, 2) + '\n');

  // Open browser after short delay for server startup
  setTimeout(() => {
    openBrowser('http://localhost:3001');
    console.log('Waymark started (background)');
    console.log('Dashboard:  http://localhost:3001');
    console.log('MCP server: active (stdio)');
    console.log('Run "waymark stop" to stop.');
  }, 1500);
}
