#!/usr/bin/env node

const command = process.argv[2];

switch (command) {
  case 'init':
    require('./commands/init').run();
    break;
  case 'start':
    require('./commands/start').run();
    break;
  case 'status':
    require('./commands/status').run();
    break;
  case 'logs':
    require('./commands/logs').run();
    break;
  default:
    console.log('Usage: waymark <init|start|status|logs>');
    console.log('');
    console.log('Commands:');
    console.log('  init    Set up Waymark in the current project');
    console.log('  start   Start the Waymark dashboard and MCP server');
    console.log('  status  Show current Waymark status and pending count');
    console.log('  logs    Show recent action log');
    process.exit(command ? 1 : 0);
}
