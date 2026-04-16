import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { spawn, execSync } from 'child_process';
import { registerProject, findAvailablePort as findAvailableRegistryPort } from '../registry';

function resolveServerBin(name: 'mcp' | 'api'): string {
  const file = name === 'mcp' ? 'mcp/server.js' : 'api/server.js';
  try {
    return require.resolve(`@way_marks/server/dist/${file}`);
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

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function findAvailablePort(preferred: number): Promise<number> {
  // Try registry first (Phase 2+)
  try {
    return Promise.resolve(findAvailableRegistryPort(preferred));
  } catch {
    // Fallback: old logic (Phase 1 compatibility)
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(preferred, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        if (preferred >= 4000) {
          console.error('No available ports found between 3001-4000. Stop other Waymark projects first.');
          process.exit(1);
        }
        resolve(findAvailablePort(preferred + 1));
      });
    });
  }
}

export async function run(): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, 'waymark.config.json');
  const waymarkDir = path.join(projectRoot, '.waymark');
  const pidFile = path.join(waymarkDir, 'waymark.pid');

  if (!fs.existsSync(configPath)) {
    console.error('waymark.config.json not found. Run: npx @way_marks/cli init');
    process.exit(1);
  }

  // Guard: already running
  if (fs.existsSync(pidFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      if (isAlive(saved.api) || isAlive(saved.mcp)) {
        const port = saved.port || 3001;
        console.log('Waymark is already running.');
        console.log(`Dashboard:  http://localhost:${port}`);
        console.log('Run "npx @way_marks/cli stop" to stop it.');
        process.exit(0);
      }
    } catch {
      // stale/corrupt PID file — continue to start
    }
  }

  const port = await findAvailablePort(3001);
  const dbPath = path.join(projectRoot, '.waymark', 'waymark.db');
  const projectName = kebabCase(path.basename(projectRoot));

  const nodeBin = process.execPath;
  const mcpBin = resolveServerBin('mcp');
  const apiBin = resolveServerBin('api');
  const env = {
    ...process.env,
    WAYMARK_PROJECT_ROOT: projectRoot,
    WAYMARK_DB_PATH: dbPath,
    WAYMARK_PORT: String(port),
  };

  const apiProc = spawn(nodeBin, [apiBin], {
    env,
    stdio: 'ignore',
    detached: true
  });
  const mcpProc = spawn(nodeBin, [
    mcpBin,
    '--project-root', projectRoot,
    '--db-path', dbPath,
    '--port', String(port),
  ], {
    env,
    stdio: 'ignore',
    detached: true
  });

  apiProc.unref();
  mcpProc.unref();

  // Ensure .waymark directory exists
  if (!fs.existsSync(waymarkDir)) fs.mkdirSync(waymarkDir, { recursive: true });

  // Write .waymark/config.json
  fs.writeFileSync(
    path.join(waymarkDir, 'config.json'),
    JSON.stringify({ port, projectRoot, projectName, startedAt: new Date().toISOString() }, null, 2) + '\n'
  );

  // Write PID file
  fs.writeFileSync(pidFile, JSON.stringify({
    api: apiProc.pid,
    mcp: mcpProc.pid,
    port,
    startedAt: new Date().toISOString()
  }, null, 2) + '\n');

  // Register in global registry (Phase 2+)
  try {
    registerProject({
      id: projectName,
      projectRoot,
      projectName,
      port,
      mcp_pid: mcpProc.pid,
      api_pid: apiProc.pid,
      status: 'running',
      startedAt: new Date().toISOString(),
      hostname: require('os').hostname(),
      user: process.env.USER || 'unknown',
    });
  } catch (err) {
    console.warn('Warning: failed to register in global registry:', err instanceof Error ? err.message : String(err));
    // Continue anyway — registry is optional (backward compat)
  }

  // Open browser after short delay for server startup
  setTimeout(() => {
    openBrowser(`http://localhost:${port}`);
    console.log('Waymark started (background)');
    console.log(`Dashboard:  http://localhost:${port}`);
    console.log('MCP server: active (stdio)');
    console.log('Run "npx @way_marks/cli stop" to stop.');
  }, 1500);
}
