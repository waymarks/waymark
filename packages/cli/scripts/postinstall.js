#!/usr/bin/env node
/**
 * Friendly post-install banner.
 *
 * Runs only when @way_marks/cli is installed globally (so it doesn't
 * spam users who add it as a dev-dep). Anything that goes wrong is
 * silently swallowed — postinstall must never fail the install.
 */

try {
  // npm sets npm_config_global=true for `npm i -g`. We only want the banner
  // for global installs; in dev (added as a dep) it would be noise.
  const isGlobal =
    process.env.npm_config_global === 'true' ||
    process.env.npm_global === 'true';
  if (!isGlobal) process.exit(0);

  // Skip in CI to avoid spamming logs. Don't gate on isTTY — npm pipes child
  // stdout through itself during install, so isTTY is always false even when
  // the user is at an interactive terminal.
  if (process.env.CI) process.exit(0);

  const pkg = require('../package.json');
  const version = pkg.version || 'unknown';

  const lines = [
    '',
    `  ✓ @way_marks/cli@${version} installed.`,
    '',
    '    Run:  waymark init     — set up Waymark in your current project',
    '          waymark start    — launch the dashboard + MCP server',
    '          waymark --help   — full command list',
    '',
    '    Tip: the binary is `waymark` (also accepts `way_marks`).',
    '',
  ];
  // Write to stderr so npm forwards it reliably during global install.
  // (npm buffers install-script stdout at the default log level; stderr is
  // surfaced as a notice.)
  for (const l of lines) process.stderr.write(l + '\n');
} catch {
  // never block npm install on banner failure
  process.exit(0);
}
