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

export function run(): void {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, 'waymark.config.json');

  if (!fs.existsSync(configPath)) {
    console.error('waymark.config.json not found. Run waymark init first.');
    process.exit(1);
  }

  const nodeBin = process.execPath;
  const mcpBin = resolveServerBin('mcp');
  const apiBin = resolveServerBin('api');
  const env = { ...process.env, WAYMARK_PROJECT_ROOT: projectRoot };

  console.log('Starting Waymark...');

  const apiProc = spawn(nodeBin, [apiBin], { env, stdio: 'inherit' });
  const mcpProc = spawn(nodeBin, [mcpBin, '--project-root', projectRoot], { env, stdio: 'ignore' });

  // Open browser after short delay for server startup
  setTimeout(() => openBrowser('http://localhost:3001'), 1500);

  console.log('');
  console.log('Waymark running');
  console.log('Dashboard:  http://localhost:3001');
  console.log('MCP server: active (stdio)');
  console.log('Press Ctrl+C to stop');

  const cleanup = () => {
    apiProc.kill();
    mcpProc.kill();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
