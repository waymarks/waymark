# CLI Reference

Waymark's CLI is the operator entry point for initialization, lifecycle management, review, and observability.

## Command summary

| Command | Description |
|---------|-------------|
| `waymark init [--dry-run]` | Initialize Waymark in a project |
| `waymark start [--port N]` | Start MCP + API servers as daemons |
| `waymark stop` | Stop background processes |
| `waymark status` | Check server health + pending count |
| `waymark logs [--pending] [--blocked] [--limit N]` | View action history |
| `waymark agents [--json] [--agent X] [--active]` | Live agent session monitor |
| `waymark watch` | ANSI terminal live dashboard |
| `waymark explain <id>` | Human-readable action summary |
| `waymark setup-hook` | Install Claude Code rate-limit Stop hook |
| `waymark list` | List registered projects |
| `waymark open <project>` | Open dashboard in browser |
| `waymark pause [PROJECT_NAME]` | Pause a registered project |
| `waymark resume [PROJECT_NAME]` | Resume a paused project |
| `waymark update` | Update Waymark to latest version |
| `waymark cache-clear` | Clear version cache |

## Global behavior

- `waymark --help`, `-h`, `help`, or no command prints help and exits 0.
- `waymark --version`, `-v`, or `version` prints `@way_marks/cli <version>` and exits 0.
- Unknown commands write an error to stderr and exit 1.

## `waymark init [--dry-run]`

Initialize the current project for Waymark.

### What it does

- selects target platforms
- creates `waymark.config.json`
- generates `CLAUDE.md` and/or `COPILOT.md`
- updates MCP configuration
- adds `.waymark/` to `.gitignore`
- resolves or installs `@way_marks/server`

### Flags

| Flag | Meaning |
|---|---|
| `--dry-run` | preview files that would be created or modified without writing them |

### Exit codes

- `0` on success or preview
- `1` when server installation fails

### Example

```bash
waymark init --dry-run
```

## `waymark start [--port N]`

Start the detached API and MCP server processes for the current project.

### Flags

| Flag | Meaning |
|---|---|
| `--port N` | explicit port override, higher priority than `waymark.config.json.port` |

### Port precedence

1. `--port`
2. `waymark.config.json.port`
3. auto-allocation from `47000-47999`

### Exit codes

- `0` on success or when already running
- `1` for missing config, parse errors, invalid port, port conflict, or project-id collision

### Example output

```text
Waymark started (background)
Dashboard:  http://localhost:47000
MCP server: active (stdio)
Run "npx @way_marks/cli stop" to stop.
```

## `waymark stop`

Stop the API and MCP processes recorded in `.waymark/waymark.pid`.

### Exit codes

- `0` on success
- `0` if Waymark is not running in the current project

## `waymark status`

Show project, database, port, dashboard URL, MCP key, running state, pending count, and version information.

### Exit codes

- `0` for normal status output
- no explicit non-zero exit path in current source for missing config; it prints guidance instead

### Example output

```text
Waymark — Project Status
───────────────────────────────────
Project:    waymark
Port:       47000
Dashboard:  http://localhost:47000
Server:     running ✅
Pending:    2 actions
```

## `waymark logs [--pending] [--blocked] [--limit N]`

Fetch recent actions from `/api/actions` and print a compact table.

### Flags

| Flag | Meaning |
|---|---|
| `--pending` | show only pending actions |
| `--blocked` | show only blocked actions |
| `--limit N` | number of rows to display (default `20`) |

### Exit codes

- `0` on success
- no explicit non-zero exit in current source when the server is unreachable; it prints guidance and returns

## `waymark agents [--json] [--agent X] [--active] [--limit N]`

List live agent sessions from the Agent Monitor API.

### Flags

| Flag | Meaning |
|---|---|
| `--json` | print raw JSON session output |
| `--agent claude|codex|copilot` | filter by agent type |
| `--active` | show active sessions (`thinking` or `executing`) |
| `--limit N` | cap output rows (default `20`) |

### Exit codes

- `0` on success
- `1` if Waymark is not initialized or the server is unreachable

## `waymark watch`

Open the ANSI live dashboard in the terminal. It polls `/api/actions` and `/api/agent-monitor/snapshot` every two seconds.

### Exit codes

- `0` while running normally
- interrupt with `Ctrl+C`

## `waymark explain <id>`

Explain one action row in a more human-readable format.

### Exit codes

- `0` on success
- `1` when no action id is provided, the server is unreachable, or the action is missing

### Example

```bash
waymark explain act-1234
```

## `waymark setup-hook`

Install the Claude Code Stop hook used for rate-limit monitoring.

### What it writes

- `~/.claude/waymark-rate-limit-hook`
- an entry in `~/.claude/settings.json`

### Exit codes

- `0` on success or if already installed
- `1` on filesystem write failures

## `waymark list`

List registered projects from the global registry.

### Exit codes

- `0` on success

## `waymark open <project>`

Open a registered project's dashboard in the browser. If the project is stopped or paused, the CLI attempts to start it first.

### Exit codes

- `0` on success
- `1` for missing arguments or unknown projects

## `waymark pause [PROJECT_NAME]`

Pause a registered project in the machine-wide registry while keeping its port allocated.

> Current source pauses by **project name**, not by PID.

### Exit codes

- `0` on success or if already paused
- `1` when the project cannot be found or the registry update fails

## `waymark resume [PROJECT_NAME]`

Resume a paused project from the registry.

### Exit codes

- `0` on success
- `1` when the project is missing, not paused, or resume fails

## `waymark update`

Check npm for the latest release and install it globally.

### Exit codes

- `0` when already up to date or after a successful update
- `1` if the version check or global npm install fails

## `waymark cache-clear`

Clear version cache files from `.waymark/`.

### Exit codes

- `0` on success
- prints informational output if no cache files exist

## Environment variables

| Variable | Description |
|---|---|
| `WAYMARK_PROJECT_ROOT` | Override the project root used by CLI/server interactions |
| `WAYMARK_DB_PATH` | Override the SQLite database path |
| `WAYMARK_PORT` | Override port discovery for the running process |
| `SLACK_WEBHOOK_URL` | Enable Slack notifications for pending approvals |

## Related output surfaces

- browser dashboard
- `waymark logs`
- `waymark watch`
- `waymark agents`
- REST API under `/api/*`

!!! tip "Use the CLI as the control plane"
    `init`, `start`, `status`, `logs`, `watch`, and `agents` are the everyday workflow. The dashboard becomes richer once the CLI has established the project-local server and ledger.
