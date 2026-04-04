import * as fs from 'fs';
import * as path from 'path';

function tryKill(pid: number): boolean {
  try { process.kill(pid, 'SIGTERM'); return true; } catch { return false; }
}

export function run(): void {
  const pidFile = path.join(process.cwd(), '.waymark', 'waymark.pid');

  if (!fs.existsSync(pidFile)) {
    console.log('Waymark is not running.');
    return;
  }

  let saved: { api: number; mcp: number };
  try {
    saved = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  } catch {
    fs.unlinkSync(pidFile);
    console.log('Waymark is not running.');
    return;
  }

  const killedApi = tryKill(saved.api);
  const killedMcp = tryKill(saved.mcp);

  try { fs.unlinkSync(pidFile); } catch { /* already gone */ }

  if (killedApi || killedMcp) {
    console.log('Waymark stopped.');
  } else {
    console.log('Waymark was not running (stale PID file removed).');
  }
}
