/**
 * waymark list — List all registered Waymark projects
 *
 * Shows project name, port, status, uptime, and user.
 */

import { listProjects, cleanupStaleEntries } from '../registry';

export function run(): void {
  cleanupStaleEntries();

  const projects = listProjects();

  if (projects.length === 0) {
    console.log('No Waymark projects registered.');
    console.log('Run: waymark init && waymark start');
    return;
  }

  // Format output
  console.log('\n📋 Waymark Projects');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const p of projects) {
    const statusEmoji = p.status === 'running' ? '🟢' : p.status === 'paused' ? '⏸️ ' : '🔴';
    const started = new Date(p.startedAt);
    const uptime = p.status === 'running'
      ? Math.floor((Date.now() - started.getTime()) / 1000)
      : 0;

    const uptimeStr = uptime > 3600
      ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
      : `${Math.floor(uptime / 60)}m`;

    console.log(`${statusEmoji} ${p.projectName}`);
    console.log(`   ID:     ${p.id}`);
    console.log(`   Port:   http://localhost:${p.port}`);
    console.log(`   Status: ${p.status}${p.status === 'running' ? ` (${uptimeStr})` : ''}`);
    console.log(`   User:   ${p.user}@${p.hostname}`);
    console.log(`   Path:   ${p.projectRoot}`);
    console.log('');
  }

  const running = projects.filter(p => p.status === 'running').length;
  const paused = projects.filter(p => p.status === 'paused').length;
  const stopped = projects.filter(p => p.status === 'stopped').length;

  console.log(`Summary: ${running} running, ${paused} paused, ${stopped} stopped`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (running === 0) {
    console.log('💡 Tip: Run "waymark open PROJECT_NAME" to start a project');
  }
}
