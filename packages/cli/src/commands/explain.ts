import * as fs from 'fs';
import * as path from 'path';

export async function run(): Promise<void> {
  const action_id = process.argv[3];
  if (!action_id) {
    console.error('Usage: waymark explain <action_id>');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.waymark', 'config.json');

  let port = 47000;
  if (fs.existsSync(configPath)) {
    try {
      const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (c.port) port = c.port;
    } catch { /* use default */ }
  }

  let action: any;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`http://localhost:${port}/api/actions/${action_id}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.error(`Action ${action_id} not found (HTTP ${res.status})`);
      process.exit(1);
    }
    action = await res.json();
  } catch (err: any) {
    console.error(`Could not reach Waymark at port ${port}. Is it running? (${err.message})`);
    process.exit(1);
  }

  console.log('');
  console.log(`Action:      ${action.tool_name}`);
  console.log(`Time:        ${action.created_at}`);
  console.log(`Session:     ${action.session_id}`);
  console.log(`Status:      ${action.status}`);
  console.log(`Decision:    ${action.decision} (${action.policy_reason || 'no reason'})`);
  if (action.matched_rule) console.log(`Matched rule: ${action.matched_rule}`);
  if (action.target_path) console.log(`Target:      ${action.target_path}`);
  if (action.tool_name === 'bash') {
    try {
      const cmd = JSON.parse(action.input_payload || '{}').command || '';
      if (cmd) console.log(`Command:     ${cmd}`);
    } catch { /* ignore */ }
  }
  if (action.stdout) console.log(`\nStdout:\n${action.stdout}`);
  if (action.stderr) console.log(`\nStderr:\n${action.stderr}`);
  if (action.error_message) console.log(`\nError: ${action.error_message}`);

  if (action.status === 'pending') {
    console.log('');
    console.log('Status: PENDING — approve with:');
    console.log(`  curl -X POST http://localhost:${port}/api/actions/${action_id}/approve`);
    console.log('Or open the dashboard:');
    console.log(`  http://localhost:${port}`);
  }
  console.log('');
}
