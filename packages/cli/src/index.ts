#!/usr/bin/env node

import { runVersionCheckAsync } from './utils/version-check';

function getVersion(): string {
  // dist/index.js → ../package.json (when published or installed globally)
  // dev (ts-node from src/) → ../package.json relative to repo
  try { return require('../package.json').version || 'unknown'; } catch {}
  try { return require('../../package.json').version || 'unknown'; } catch {}
  return 'unknown';
}

function printVersion(): void {
  console.log(`@way_marks/cli ${getVersion()}`);
}

function printHelp(): void {
  console.log(`waymark ${getVersion()} — control what AI agents can do in your codebase`);
  console.log('');
  console.log('Usage: waymark <command> [options]   (also: way_marks, npx @way_marks/cli)');
  console.log('');
  console.log('Commands:');
  console.log('  init                  Set up Waymark in the current project');
  console.log('  start [--port <n>]    Start the Waymark dashboard and MCP server');
  console.log('  stop                  Stop the running Waymark servers');
  console.log('  pause                 Pause a project (keep port allocated)');
  console.log('  resume                Resume a paused project');
  console.log('  status                Show current Waymark status and pending count');
  console.log('  update                Check for and install the latest version');
  console.log('  logs                  Show recent action log');
  console.log('  agents                List running AI agent sessions');
  console.log('  list                  List all registered Waymark projects');
  console.log('  open                  Open a project dashboard or start it');
  console.log('');
  console.log('Top-level flags:');
  console.log('  -v, --version         Print the installed version');
  console.log('  -h, --help            Show this help');
  console.log('');
  console.log('Notes:');
  console.log('  • Default port range is 47000-47999 (avoids collisions with dev servers).');
  console.log('  • Pin a port per-project: add "port": 47100 to waymark.config.json.');
  console.log('  • Override at runtime: waymark start --port 47200');
}

const command = process.argv[2];

// Top-level flags / aliases handled before the command switch so that
// `waymark -v`, `waymark --version`, and `waymark version` all work.
if (command === '-v' || command === '--version' || command === 'version') {
  printVersion();
  process.exit(0);
}
if (command === '-h' || command === '--help' || command === 'help' || command === undefined) {
  printHelp();
  process.exit(command === undefined ? 0 : 0);
}

// Fire off version check asynchronously (non-blocking)
runVersionCheckAsync(1000).catch(() => {
  // Silently ignore any errors from version check
});

switch (command) {
  case 'init':
    require('./commands/init').run();
    break;
  case 'start':
    require('./commands/start').run();
    break;
  case 'stop':
    require('./commands/stop').run();
    break;
  case 'pause':
    require('./commands/pause').run();
    break;
  case 'resume':
    require('./commands/resume').run();
    break;
  case 'status':
    require('./commands/status').run();
    break;
  case 'update':
    require('./commands/update').run();
    break;
  case 'logs':
    require('./commands/logs').run();
    break;
  case 'agents':
    require('./commands/agents').run();
    break;
  case 'list':
    require('./commands/list').run();
    break;
  case 'open':
    require('./commands/open').run();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run "waymark --help" for usage.');
    process.exit(1);
}
