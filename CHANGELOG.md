# Changelog

All notable changes to Waymark are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com)
Versioning follows [Semantic Versioning](https://semver.org)

---

## [0.3.0] — 2026-04-04

### CLI output fixes

- All command hints in CLI output now show the full
  `npx @shaifulshabuj-waymarks/cli <cmd>` form —
  works correctly whether Waymark is installed
  globally or invoked via npx

---

## [0.2.0] — 2026-04-04

### Background daemon mode

- `waymark start` now runs servers in the background and returns to prompt immediately — closing the terminal no longer stops Waymark
- Added `waymark stop` command for clean shutdown
- `waymark status` now detects crashed servers and cleans up stale PID files automatically

---

## [0.1.0] — 2026-04-04

### First public release

#### Core Features
- MCP server for native Claude Code integration
- Intercepts write_file, read_file, and bash actions
  in real time before execution
- Policy engine with four control types:
  allowedPaths, blockedPaths,
  blockedCommands, requireApproval
- Regex pattern support in blockedCommands
  for flexible command matching
- Rollback any write_file action to its
  previous state with one click
- Approve or reject pending actions
  from the web dashboard
- Slack webhook notifications for
  pending approval actions
- SQLite action ledger — every action logged
  with full context and agent reasoning

#### Developer Experience
- npx @shaifulshabuj-waymarks/cli init — one command project setup
- Auto-generates waymark.config.json
- Auto-generates CLAUDE.md for always-on
  Claude Code activation
- Auto-registers MCP server in Claude
  desktop config
- waymark start — launches dashboard
  and MCP server together
- waymark logs — terminal action viewer
  with --pending and --blocked filters
- waymark status — quick health check

#### Security
- Regex-based command blocking catches
  pipe-to-shell attacks (curl | bash variants)
- Default deny for paths not in allowedPaths
- blockedPaths take priority over allowedPaths
- Pending actions never execute without
  explicit human approval
- Double-approve and double-rollback guards
