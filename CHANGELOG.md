# Changelog

All notable changes to Waymark are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com)
Versioning follows [Semantic Versioning](https://semver.org)

---

## [0.5.2] — 2026-04-06

### Changed

- **Dashboard now shows project name** in the header. After running
  `npx @way_marks/cli start`, the dashboard title displays **waymark — your-project**
  instead of a generic "waymark". No configuration required — the name
  is derived automatically from the project directory.
- New API endpoint `GET /api/project` returns project metadata
  (`projectName`, `port`) for UI consumption.

---

## [0.5.1] — 2026-04-06

### Changed

- README and CHANGELOG updated with deprecation notice and migration
  steps for users coming from `@shaifulshabuj-waymarks` packages.
- No code changes — docs-only patch release.

---

## [0.5.0] — 2026-04-06

> ⚠️ **Package scope renamed in this release.**
> `@shaifulshabuj-waymarks/cli` and `@shaifulshabuj-waymarks/server` are now
> deprecated on npm. Switch to `@way_marks/cli` and `@way_marks/server`.
> See migration steps below.

### Migration from `@shaifulshabuj-waymarks`

```bash
# 1. Uninstall old packages
npm uninstall @shaifulshabuj-waymarks/cli @shaifulshabuj-waymarks/server

# 2. Install new packages
npx @way_marks/cli init

# 3. Restart Claude Code
```

Re-running `init` also updates your Claude Desktop MCP config to the new
`waymark-${projectName}` key format required for multi-project support.

### Added

- **Multi-project support**: Each project now gets its own isolated SQLite database
  at `.waymark/waymark.db`, an auto-selected port (3001–3010), and a named MCP
  server entry (`waymark-${projectName}`) in Claude Desktop config. Multiple
  Waymark projects can run simultaneously without conflict.
- **Port auto-selection**: `waymark start` probes ports 3001–3010 and picks the
  first available one. Port is stored in `.waymark/config.json`.
- **Project status command** (`waymark status`): Shows project name, root, DB
  path, port, dashboard URL, MCP key, and whether the server is currently running.

### Changed

- **Package scope renamed** from `@shaifulshabuj-waymarks` to `@way_marks`.
  Install with `npm install @way_marks/server` or `npx @way_marks/cli init`.
- **CLAUDE.md template** now uses mandatory enforcement language with exact MCP
  tool names (`mcp__waymark-${projectName}__write_file`, etc.) instead of polite
  suggestions. Claude Code will enforce Waymark tool usage without ambiguity.
- **MCP server registration** now uses `waymark-${projectName}` as the Claude
  Desktop config key instead of the generic `"waymark"`. Re-run `init` in each
  project to register the updated key.

### Fixed

- `waymark init` no longer overwrites other projects' MCP entries when registering
  a new project — it adds/updates only the current project's key.

### Breaking changes

- DB location moved from `data/waymark.db` to `.waymark/waymark.db`.
  Existing databases are not migrated automatically.
- MCP key in Claude Desktop config changes. Re-run `npx @way_marks/cli init`
  in each project after upgrading.

---

## [0.4.0] — 2026-04-04

### Fixed

- **Security**: Approving a pending `write_file` action now re-checks current policies
  before writing. If a policy was tightened after the action was queued, the approval
  is rejected with an explanation rather than silently executing.
- **Security**: Actions logged without an explicit policy decision no longer default
  to `allow`. The safe default is now `pending`.
- **Behaviour**: Paths listed in `requireApproval` no longer hold `read_file` actions
  pending. Read operations are idempotent — only writes require approval.
- **Reliability**: Bash command output is now capped at `maxBashOutputBytes`
  (default 10 000) with a `[OUTPUT TRUNCATED]` marker appended when the limit
  is exceeded.
- **Compatibility**: Node binary detection now uses `process.execPath` instead of
  reading NVM alias files. Works correctly with Homebrew, system Node, and any
  version manager.
- **CLI**: `waymark logs` no longer crashes on rows with malformed `input_payload`.
- **CLI**: Date display in `waymark logs` is now consistent regardless of whether
  the database stores timestamps with a space or a `T` separator.

---

## [0.3.0] — 2026-04-04

### CLI output fixes

- All command hints in CLI output now show the full
  `npx @way_marks/cli <cmd>` form —
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
- npx @way_marks/cli init — one command project setup
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
