#!/usr/bin/env node

const command = process.argv[2];

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
  case 'logs':
    require('./commands/logs').run();
    break;
  case 'list':
    require('./commands/list').run();
    break;
  case 'open':
    require('./commands/open').run();
    break;
  default:
    console.log('Usage: npx @way_marks/cli <init|start|stop|pause|resume|status|logs|list|open>');
    console.log('');
    console.log('Commands:');
    console.log('  init    Set up Waymark in the current project');
    console.log('  start   Start the Waymark dashboard and MCP server');
    console.log('  stop    Stop the running Waymark servers');
    console.log('  pause   Pause a project (keep port allocated)');
    console.log('  resume  Resume a paused project');
    console.log('  status  Show current Waymark status and pending count');
    console.log('  logs    Show recent action log');
    console.log('  list    List all registered Waymark projects');
    console.log('  open    Open a project dashboard or start it');
    process.exit(command ? 1 : 0);
}
