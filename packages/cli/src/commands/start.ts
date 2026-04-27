import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { spawn, execSync } from 'child_process';
import {
  registerProject,
  findAvailablePort as findAvailableRegistryPort,
  PORT_RANGE_START,
  PORT_RANGE_END,
  LEGACY_PORT_BOUNDARY,
  findProjectByPath,
  ProjectIdCollisionError,
} from '../registry';

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
    // Fallback: kernel-level probe (registry corrupt or absent)
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(preferred, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        if (preferred >= PORT_RANGE_END) {
          console.error(
            `No available ports found between ${PORT_RANGE_START}-${PORT_RANGE_END}. ` +
            `Stop other Waymark projects first.`,
          );
          process.exit(1);
        }
        resolve(findAvailablePort(preferred + 1));
      });
    });
  }
}

/**
 * Probe whether `port` is currently free. We listen exactly the same way the
 * real server does (no explicit host → all interfaces, dual-stack), so this
 * matches what would happen at actual bind time and catches IPv4/IPv6
 * dual-stack collisions.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

/**
 * Parse `--port <n>` from process.argv. Returns null when not provided.
 * Validates the value is a positive integer < 65536. Exits with a readable
 * error on garbage input rather than silently ignoring.
 */
function parsePortFlag(argv: string[]): number | null {
  const idx = argv.indexOf('--port');
  if (idx === -1) return null;
  const raw = argv[idx + 1];
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536 || String(port) !== raw) {
    console.error(`Invalid --port value: "${raw}". Expected an integer 1-65535.`);
    process.exit(1);
  }
  return port;
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
        const port = saved.port || PORT_RANGE_START;
        console.log('Waymark is already running.');
        console.log(`Dashboard:  http://localhost:${port}`);
        console.log('Run "npx @way_marks/cli stop" to stop it.');
        process.exit(0);
      }
    } catch {
      // stale/corrupt PID file — continue to start
    }
  }

  const projectName = kebabCase(path.basename(projectRoot));
  const dbPath = path.join(projectRoot, '.waymark', 'waymark.db');

  // Load project config — used for the optional `port` pin.
  let projectConfig: { port?: number } = {};
  try {
    projectConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse waymark.config.json: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Port resolution precedence: --port flag > config.port > auto-allocate.
  const flagPort = parsePortFlag(process.argv.slice(3));
  const configPort = typeof projectConfig.port === 'number' ? projectConfig.port : null;
  const pinnedPort = flagPort ?? configPort;
  const pinnedSource: 'flag' | 'config' | null =
    flagPort !== null ? 'flag' : configPort !== null ? 'config' : null;

  let port: number;
  if (pinnedPort !== null) {
    if (!(await isPortFree(pinnedPort))) {
      const existing = findProjectByPath(projectRoot);
      const owner = (() => {
        // Best-effort: try to identify which Waymark project owns the port.
        // We can't reach into other processes; just advise `waymark list`.
        return null;
      })();
      console.error(
        `Port ${pinnedPort} is already in use ` +
        `(pinned via ${pinnedSource === 'flag' ? '--port flag' : 'waymark.config.json'}).\n` +
        `  → Run "npx @way_marks/cli list" to see other Waymark projects.\n` +
        `  → Or remove the pin to auto-allocate from ${PORT_RANGE_START}-${PORT_RANGE_END}.`,
      );
      void existing; void owner; // reserved for future "owner is project X" diagnostics
      process.exit(1);
    }
    port = pinnedPort;
  } else {
    // Migration notice: if this project's prior registry entry used a legacy port,
    // the auto-allocator may pick a fresh modern port instead. Emit a one-line
    // notice so the user understands why their bookmark might shift.
    const prior = findProjectByPath(projectRoot);
    const newPort = await findAvailablePort(PORT_RANGE_START);
    if (
      prior &&
      typeof prior.port === 'number' &&
      prior.port < LEGACY_PORT_BOUNDARY &&
      newPort !== prior.port
    ) {
      console.log(
        `[waymark] Reallocating from legacy port :${prior.port} to :${newPort}.\n` +
        `          Set "port": ${prior.port} in waymark.config.json to keep the old one.`,
      );
    }
    port = newPort;
  }

  // Pre-flight: surface any project-id collision *before* spawning children,
  // so we never leave orphan processes when registration would fail.
  const colliding = (() => {
    try {
      // Probe by performing a fake registerProject() that we immediately undo
      // would risk corrupting the file; instead read directly via findProjectByPath
      // and check the registry's keying contract here.
      const otherAtSamePath = findProjectByPath(projectRoot);
      if (otherAtSamePath && otherAtSamePath.id === projectName) return null;
      // Different path with same id → ask registry for the entry by id.
      // findProjectByPath already returned null, so we need a different lookup.
      // Use require-time access to the same module's getProject.
      const reg = require('../registry') as typeof import('../registry');
      const sameId = reg.getProject(projectName);
      if (
        sameId &&
        path.resolve(sameId.projectRoot) !== path.resolve(projectRoot) &&
        ((sameId.mcp_pid != null && (() => { try { process.kill(sameId.mcp_pid!, 0); return true; } catch { return false; } })()) ||
          sameId.status === 'running')
      ) {
        return sameId;
      }
      return null;
    } catch {
      return null;
    }
  })();
  if (colliding) {
    console.error(
      `Another running Waymark project named "${projectName}" is registered at ${colliding.projectRoot}.\n` +
      `This start request is at ${projectRoot}.\n` +
      `  → Stop the other project first ("npx @way_marks/cli stop" in ${colliding.projectRoot}),\n` +
      `  → or rename one of the directories so the project ids differ.`,
    );
    process.exit(1);
  }

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
    if (err instanceof ProjectIdCollisionError) {
      // Race: another start landed between our pre-flight and registration.
      // Tear down the children we just spawned so we don't leak processes.
      try { apiProc.pid && process.kill(apiProc.pid); } catch {}
      try { mcpProc.pid && process.kill(mcpProc.pid); } catch {}
      try { fs.unlinkSync(pidFile); } catch {}
      console.error(err.message);
      process.exit(1);
    }
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
