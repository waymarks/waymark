import * as fs from 'fs';
import * as path from 'path';

async function fetchJSON(url: string, timeoutMs = 3000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? res.json() : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function render(port: number): Promise<void> {
  process.stdout.write('\x1b[2J\x1b[H');
  const [actionsData, agentsData] = await Promise.all([
    fetchJSON(`http://localhost:${port}/api/actions`),
    fetchJSON(`http://localhost:${port}/api/agent-monitor/snapshot`),
  ]);

  const now = new Date().toLocaleTimeString();
  console.log(`WAYMARK WATCH — port :${port} — ${now}`);
  console.log('─'.repeat(50));

  const sessions = agentsData?.sessions ?? [];
  if (sessions.length > 0) {
    console.log('\nAGENTS:');
    for (const s of sessions) {
      const ctx = `ctx:${Math.round(s.contextPercent ?? 0)}%`;
      const ctxWarn = (s.contextPercent ?? 0) >= 85 ? ' ⚠' : '';
      const wBadge = s.isWaymarkControlled ? '[W] ' : '    ';
      console.log(`  ${wBadge}${(s.agentCli ?? 'agent').padEnd(12)} ${(s.status ?? '').padEnd(14)} ${ctx}${ctxWarn}`);
    }
  }

  const actions = actionsData?.actions ?? [];
  const pending = actions.filter((a: any) => a.status === 'pending');
  const blocked = actions.filter((a: any) => a.status === 'blocked');

  if (pending.length > 0) {
    console.log(`\nPENDING APPROVALS (${pending.length}):`);
    for (const a of pending.slice(0, 8)) {
      const id = (a.action_id ?? '').slice(0, 8);
      const target = a.target_path ?? a.matched_rule ?? '';
      console.log(`  [${id}] ${a.tool_name} ${target}`);
    }
  }

  if (blocked.length > 0) {
    console.log(`\nRECENT BLOCKS (${blocked.length}):`);
    for (const a of blocked.slice(0, 3)) {
      const id = (a.action_id ?? '').slice(0, 8);
      console.log(`  [${id}] ${a.tool_name} — ${a.policy_reason ?? a.matched_rule ?? ''}`);
    }
  }

  if (pending.length === 0 && sessions.length === 0) {
    console.log('\nNo active agents or pending actions.');
  }

  console.log('\n' + '─'.repeat(50));
  console.log('Press Ctrl+C to exit');
}

export async function run(): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.waymark', 'config.json');

  let port = 47000;
  if (fs.existsSync(configPath)) {
    try {
      const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (c.port) port = c.port;
    } catch { /* use default */ }
  }

  await render(port);
  setInterval(() => render(port), 2000);
}
