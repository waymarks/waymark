import * as fs from 'fs';
import * as path from 'path';
import { unregisterProject, updateProjectStatus, findProjectByPath, releasePort } from '../registry';

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

  // Unregister from global registry and release port (Phase 2+ & Phase 4)
  try {
    const project = findProjectByPath(process.cwd());
    if (project) {
      releasePort(project.id);  // Phase 4: Release port for reuse
      unregisterProject(project.id);
    }
  } catch (err) {
    // ignore — registry cleanup is optional
  }

  if (killedApi || killedMcp) {
    console.log('Waymark stopped.');
  } else {
    console.log('Waymark was not running (stale PID file removed).');
  }
}
