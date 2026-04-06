import * as fs from 'fs';
import * as path from 'path';

export async function run(): Promise<void> {
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.waymark', 'config.json');

  if (!fs.existsSync(configPath)) {
    console.log('Waymark not initialized in this directory.');
    console.log('Run: npx @way_marks/cli init');
    return;
  }

  let waymarkConfig: { port: number; projectRoot: string; projectName: string; startedAt: string };
  try {
    waymarkConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    console.log('Waymark config is corrupt. Re-run: npx @way_marks/cli init');
    return;
  }

  const { port, projectName, startedAt } = waymarkConfig;
  const mcpKey = `waymark-${projectName}`;
  const base = `http://localhost:${port}`;

  // Check if server is running (2s timeout)
  let running = false;
  let pending = 0;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${base}/api/actions?count=true`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      running = true;
      const data = await res.json() as { count: number };
      pending = data.count;
    }
  } catch { /* not running */ }

  console.log('Waymark — Project Status');
  console.log('─'.repeat(35));
  console.log(`Project:    ${projectName}`);
  console.log(`Root:       ${projectRoot}`);
  console.log(`Database:   .waymark/waymark.db`);
  console.log(`Port:       ${port}`);
  console.log(`Dashboard:  ${base}`);
  console.log(`MCP key:    ${mcpKey}`);
  console.log('─'.repeat(35));
  console.log(`Server:     ${running ? 'running ✅' : 'not running ❌'}`);
  if (running) console.log(`Pending:    ${pending} actions`);
  if (!running) console.log(`Start with: npx @way_marks/cli start`);
  if (startedAt) console.log(`Started:    ${startedAt}`);
}
