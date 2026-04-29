import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentSession {
  agentCli: string;
  pid: number;
  sessionId: string;
  cwd: string;
  projectName: string;
  startedAt: number;
  status: string;
  model: string;
  contextPercent: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  turnCount: number;
  currentTasks: string[];
  memMb: number;
}

interface SessionsResponse {
  sessions: AgentSession[];
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPort(): number | null {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.waymark', 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return cfg.port ?? null;
  } catch {
    return null;
  }
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    });
    req.setTimeout(3000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
  });
}

function ageStr(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function statusIcon(status: string): string {
  switch (status) {
    case 'thinking': return '🤔';
    case 'waiting':  return '⏳';
    case 'done':     return '✅';
    case 'error':    return '❌';
    default:         return '❔';
  }
}

// ─── Parse args ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { agent: string; active: boolean; json: boolean; limit: number } {
  let agent = 'all';
  let active = false;
  let json = false;
  let limit = 20;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--agent' && argv[i + 1]) { agent = argv[++i]; continue; }
    if (argv[i] === '--active') { active = true; continue; }
    if (argv[i] === '--json') { json = true; continue; }
    if (argv[i] === '--limit' && argv[i + 1]) { limit = parseInt(argv[++i], 10) || 20; continue; }
  }

  return { agent, active, json, limit };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));

  // Find port
  const envPort = process.env.WAYMARK_PORT;
  const port = envPort ? parseInt(envPort, 10) : getPort();
  if (!port) {
    console.error('Waymark not initialized. Run: npx @way_marks/cli init && npx @way_marks/cli start');
    process.exit(1);
  }

  const base = `http://localhost:${port}/api/agent-monitor`;
  let qs = '';
  if (args.agent !== 'all') qs += `agent=${encodeURIComponent(args.agent)}&`;
  if (args.active) qs += 'status=active&';

  const url = `${base}/sessions${qs ? '?' + qs.replace(/&$/, '') : ''}`;

  let data: SessionsResponse;
  try {
    data = await fetchJson(url) as SessionsResponse;
  } catch (err: any) {
    console.error(`Cannot reach Waymark server on port ${port}: ${err.message}`);
    console.error('Start it with: npx @way_marks/cli start');
    process.exit(1);
  }

  const sessions = data.sessions.slice(0, args.limit);

  if (args.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }

  if (sessions.length === 0) {
    console.log('No agent sessions found.');
    if (args.agent !== 'all') console.log(`(filtered by --agent ${args.agent})`);
    if (args.active) console.log('(filtered by --active)');
    return;
  }

  // ── Table output ─────────────────────────────────────────────────────────────
  const COL = { agent: 8, pid: 7, status: 9, ctx: 7, tokens: 9, task: 32, age: 6 };
  const header = [
    pad('Agent', COL.agent),
    pad('PID', COL.pid),
    pad('Status', COL.status),
    pad('Ctx %', COL.ctx),
    pad('Tokens', COL.tokens),
    pad('Current task', COL.task),
    pad('Age', COL.age),
  ].join('  ');
  const divider = '─'.repeat(header.length);

  console.log(`\nAgent sessions — ${data.count} total${args.limit < data.count ? ` (showing ${args.limit})` : ''}`);
  console.log(divider);
  console.log(header);
  console.log(divider);

  for (const s of sessions) {
    const tokens = s.totalInputTokens + s.totalOutputTokens;
    const task = s.currentTasks?.[0] ?? '—';
    const row = [
      pad(s.agentCli, COL.agent),
      pad(String(s.pid), COL.pid),
      `${statusIcon(s.status)} ${pad(s.status, COL.status - 2)}`,
      pad(`${Math.round(s.contextPercent)}%`, COL.ctx),
      pad(tokens > 0 ? String(tokens) : '—', COL.tokens),
      pad(task.length > COL.task ? task.slice(0, COL.task - 1) + '…' : task, COL.task),
      pad(ageStr(s.startedAt), COL.age),
    ].join('  ');
    console.log(row);
  }

  console.log(divider);
  console.log(`Dashboard: http://localhost:${port}`);
}
