import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3001';

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function run(): Promise<void> {
  const pidFile = path.join(process.cwd(), '.waymark', 'waymark.pid');

  if (!fs.existsSync(pidFile)) {
    console.log('Waymark is not running. Start with: npx @shaifulshabuj-waymarks/cli start');
    return;
  }

  let saved: { api: number; mcp: number; startedAt: string };
  try {
    saved = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  } catch {
    console.log('Waymark is not running. Start with: npx @shaifulshabuj-waymarks/cli start');
    return;
  }

  if (!isAlive(saved.api) && !isAlive(saved.mcp)) {
    fs.unlinkSync(pidFile);
    console.log('Waymark is not running (crashed). Start with: npx @shaifulshabuj-waymarks/cli start');
    return;
  }

  try {
    const [countRes, actionsRes] = await Promise.all([
      fetch(`${BASE}/api/actions?count=true`),
      fetch(`${BASE}/api/actions`)
    ]);

    if (!countRes.ok || !actionsRes.ok) throw new Error('Bad response');

    const { count: pending } = await countRes.json() as { count: number };
    const actions = await actionsRes.json() as unknown[];
    const total = actions.length;

    console.log('Waymark status');
    console.log(`Dashboard:            ${BASE} (running)`);
    console.log(`Started:              ${saved.startedAt}`);
    console.log(`Pending approvals:    ${pending}`);
    console.log(`Total actions logged: ${total}`);
  } catch {
    console.log('Waymark is not running. Start with: npx @shaifulshabuj-waymarks/cli start');
  }
}
