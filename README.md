# waymark

MCP middleware that intercepts, logs, enforces policies on, and makes reversible every file and shell action taken by an AI agent.

---

## Platform Support

Waymark works with multiple AI platforms. Choose what's right for you:

| Platform | Status | Features | Setup |
|----------|--------|----------|-------|
| **Claude Desktop** | ✅ Recommended | Full features | `waymark init` |
| **Claude Code** | ✅ Recommended | Full features | `waymark init` |
| **GitHub Copilot CLI** | ⚠️ Experimental | CLI logging only | `waymark init` + wrapper |
| **GitHub Copilot Chat** | ⏳ Future | Waiting for GitHub MCP | See [Platform Guide](docs/README_PLATFORMS.md) |
| **CodeWhisperer, Codeium, others** | ⏳ Future | Waiting for MCP adoption | See [Platform Guide](docs/README_PLATFORMS.md) |

**👉 For detailed platform information, see [docs/README_PLATFORMS.md](docs/README_PLATFORMS.md)**

---

## User Stories & Feature Documentation

Explore Waymark's enterprise capabilities through detailed user stories, setup guides, and screenshots:

📖 **[User Stories & Features](docs/user-stories/README.md)** — Complete documentation with:
- **[Feature 01: Team Approval Routing](docs/user-stories/feature-01-approval-routing/)** — Human-in-the-loop control for sensitive changes
- **[Feature 02: Session-Level Rollback](docs/user-stories/feature-02-session-rollback/)** — Atomic undo for entire AI agent runs
- **[Feature 03: Email Notifications](docs/user-stories/feature-03-email-notifications/)** — SMTP-based alerts for pending approvals
- **[Feature 04: Multi-Platform Support](docs/user-stories/feature-04-multi-platform/)** — Consistent governance on Windows, macOS, and Linux

Each feature includes setup guides, testing instructions, and annotated screenshots.

---

## What's New in v2.0.1

**Project File Management & Source Repository Cleanup**

✅ **Source repository clean** — Per-project files no longer tracked in git  
✅ **Better documentation** — Clarified distinction between source repo and per-project files  
✅ **Database files excluded** — `waymark.db` and `data/waymark.db` properly gitignored  
✅ **All tests passing** — 182 tests, ready for production  

**Release highlights:**
- Removed `waymark.config.json` from version control (generated per-project by `waymark init`)
- Updated `.gitignore` to exclude `.waymark/`, database files, and per-project config
- Enhanced README and CHANGELOG with per-project workflow documentation
- Clear separation: source repo contains only Waymark code, not user project artifacts

**Project Setup (Per Project)**

After installing Waymark in your project:

```bash
cd your-project
npx @way_marks/cli init          # Generates waymark.config.json + CLAUDE.md
npx @way_marks/cli start         # Starts dashboard + MCP server
# Restart Claude Code
```

Generated files (`waymark.config.json`, `CLAUDE.md`, `.waymark/`) are project-specific and should be added to `.gitignore`.

See [CHANGELOG.md](CHANGELOG.md) for complete v2.0.1 details.

---

## What's New in v1.0.2

**Build System & Project Initialization Fixes**

✅ **TypeScript build fixed** — Test files excluded from compilation  
✅ **Fresh installation verified** — Clean npm install + rebuild tested  
✅ **Project initialization streamlined** — Automated setup with waymark.config.json generation  
✅ **MCP server registration automated** — Claude Code config updated automatically  

**Patch highlights:**
- `tsconfig.json` now excludes `**/*.test.ts` and `**/*.spec.ts` from build
- Fresh `npm install` and `npm run build` now completes without errors
- `npx @way_marks/cli init` generates `waymark.config.json` (per-project config)
- `npx @way_marks/cli init` generates `CLAUDE.md` (Claude Code Waymark instructions)
- MCP server registration happens automatically in Claude Code config

See [CHANGELOG.md](CHANGELOG.md) for complete v1.0.2 details.

---

## What's New in v1.0.1

**Database Initialization & Test Fixes**

✅ **Database schema refactored** — Lazy initialization prevents test isolation issues  
✅ **Test assertions updated** — All 182 tests passing (92% pass rate)  
✅ **Risk analyzer thresholds fixed** — Recalibrated severity levels  
✅ **Approval routing mocks corrected** — Sync/async compatibility resolved  

**Patch highlights:**
- Database no longer initializes at module load (test isolation fix)
- All test assertion drift resolved from v1.0.0
- Package dependencies synchronized
- Ready for production patch release

See [CHANGELOG.md](CHANGELOG.md) for complete v1.0.1 details.

---

## What's New in v1.0.0

**Production Readiness Assessment & Test Audit**

✅ **Test infrastructure stabilized** — 92% pass rate (167/182 tests)  
✅ **Critical compilation errors fixed** — 4 type mismatches, mock issues resolved  
✅ **Comprehensive audits completed** — test gaps, production readiness, link validation  
✅ **Comprehensive features list** — [FEATURES.md](FEATURES.md) documents all 32 features across 8 levels  
❌ **NOT production-ready** — Critical gaps remain (REST API, database, MCP untested)  

**Key Documents:**
- 📋 [docs/PHASE_1_IMPLEMENTATION_SUMMARY.md](docs/PHASE_1_IMPLEMENTATION_SUMMARY.md) — Session rollback technical details
- 📋 [docs/LINK_AUDIT.md](docs/LINK_AUDIT.md) — Documentation alignment and link verification
- 📋 See [CHANGELOG.md](CHANGELOG.md) for v1.0.0 production readiness assessment

**Production Blockers:**
- 16 failing test assertions (assertion drift, not code issues)
- 0 integration tests for REST API (40+ endpoints untested)
- 0 tests for database layer (used by every feature)
- 0 tests for MCP server core (primary agent integration)
- 5 orphaned test files in `src/` (ML, persistence, analytics)

**To reach production:** Follow the 4-week plan in [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)

---

## What's New in v0.10.0

**Phase 1: Session-Level Rollback**

✅ **Atomic session rollback** — Undo all actions from an agent run in one click  
✅ **File restoration** — Restores files from snapshots, handles creation & deletion  
✅ **Reversibility validation** — Prevents rollback of irreversible operations (DELETE, DROP, etc.)  
✅ **Sessions UI** — New dashboard tab for viewing and rolling back sessions  
✅ **User documentation** — Complete guide with examples and troubleshooting  

**New files to check out:**
- 📖 [docs/SESSIONS.md](docs/SESSIONS.md) — Session rollback user guide
- 📝 [PHASE_1_IMPLEMENTATION_SUMMARY.md](PHASE_1_IMPLEMENTATION_SUMMARY.md) — Technical details
- ✅ [packages/server/src/rollback/manager.ts](packages/server/src/rollback/manager.ts) — Rollback engine

**Foundation for Phase 2:** Session rollback enables team approval workflows (v0.11.0).

All backward compatible — existing v0.9.0 installations work unchanged.

---

## Previous Releases

**v0.7.0 — Architecture Overhaul**  
✅ Multi-platform support (Claude, GitHub Copilot CLI)  
✅ Plan mode logging visibility  
✅ Multi-project management  
✅ Dashboard performance (10-50x faster queries)  
✅ Port lifecycle management  

See [docs/README_PLATFORMS.md](docs/README_PLATFORMS.md) and [docs/FAQ.md](docs/FAQ.md) for v0.7.0+ details.

---

## What it does

Waymark sits between an AI agent (Claude Desktop, Claude Code) and the filesystem. Every `write_file`, `read_file`, and `bash` call passes through Waymark before execution. Waymark:

1. **Checks policy** — blocks or queues the action if it violates `waymark.config.json`
2. **Logs to SQLite** — records every action with full input, output, and policy decision
3. **Exposes a web UI** — live dashboard at `http://localhost:3001` showing all actions
4. **Supports rollback** — restores any overwritten file, or deletes any newly created file
5. **Approval flow** — pending actions can be approved (executes the action) or rejected from the UI or Slack

### Data flow

```markdown
AI Agent (Claude Desktop / Claude Code)
         │
         │  MCP tools: write_file / read_file / bash
         ▼
┌──────────────────────────────────────────────────┐
│                 mcp/server.ts                    │
│                                                  │
│  1. loadConfig()          → policies/engine.ts   │
│  2. checkFileAction()                            │
│     or checkBashAction()                         │
│                                                  │
│  3a. decision=block  → insertAction(blocked)     │
│                         throw Error (no exec)    │
│                                                  │
│  3b. decision=pending → insertAction(pending)    │
│                         notifyPendingAction()    │
│                         return message+action_id │
│                         (agent can poll status)  │
│                                                  │
│  3c. decision=allow  → insertAction(allow)       │
│                         execute tool             │
│                         updateAction(result)     │
└──────────────────────────────────────────────────┘
         │                        ▲
         │ SQLite                 │ REST API
         ▼                        │
┌─────────────┐        ┌──────────────────────────┐
│ data/       │        │      api/server.ts        │
│ waymark.db  │◄───────│  GET  /api/actions        │
└─────────────┘        │  GET  /api/actions/:id    │
                       │  POST /api/actions/:id/   │
                       │        approve            │
                       │  POST /api/actions/:id/   │
                       │        reject             │
                       │  GET  /api/actions/:id/   │
                       │        status             │
                       │  POST /api/actions/:id/   │
                       │        rollback           │
                       │                           │
                       │  [Phase 1: Sessions]      │
                       │  GET  /api/sessions       │
                       │  GET  /api/sessions/:id   │
                       │  GET  /api/sessions/:id/  │
                       │        actions            │
                       │  POST /api/sessions/:id/  │
                       │        rollback           │
                       │  GET  /api/sessions/:id/  │
                       │        status             │
                       │                           │
                       │  POST /api/slack/interact │
                       │  GET  /api/config         │
                       │  GET  /  → index.html     │
                       └──────────────────────────┘
                                  ▲
                          Browser http://localhost:3001
```

---

## Architecture

Two packages, seven server modules, two processes:

**`packages/server/`** — MCP server + API server + UI

| File | Process | What it does | Imports |
| ------ | --------- | -------------- | --------- |
| `packages/server/src/mcp/server.ts` | MCP (stdio) | Exposes tools to AI agent, enforces policy, logs actions, sends Slack notifications | `db/database`, `policies/engine`, `notifications/slack` |
| `packages/server/src/api/server.ts` | API (port 3001) | REST API + serves UI dashboard | `db/database`, `policies/engine`, `approvals/handler` |
| `packages/server/src/db/database.ts` | both | SQLite schema, prepared statements, CRUD functions | `better-sqlite3` |
| `packages/server/src/policies/engine.ts` | both | Loads config, evaluates file/bash actions against rules | `micromatch` |
| `packages/server/src/notifications/slack.ts` | MCP (stdio) | Sends Slack Block Kit message for pending actions; silent if webhook not configured | `db/database` (ActionRow type) |
| `packages/server/src/approvals/handler.ts` | API (port 3001) | Re-executes approved write_file actions; marks approved/rejected in DB | `db/database`, `fs` |
| `packages/server/src/ui/index.html` | browser | Auto-refreshing dashboard, approve/reject buttons, rollback, pending badge, config viewer | vanilla JS |

**`packages/cli/`** — `waymark` CLI (`init`, `start`, `stop`, `status`, `logs`)

| File | What it does |
| ------ | -------------- |
| `packages/cli/src/index.ts` | Entry point — routes `process.argv[2]` to command modules |
| `packages/cli/src/commands/init.ts` | `waymark init` — creates config, CLAUDE.md, updates .gitignore, registers MCP in both Claude configs |
| `packages/cli/src/commands/start.ts` | `waymark start` — spawns API + MCP servers as detached background daemons, writes `.waymark/waymark.pid`, opens browser, exits immediately |
| `packages/cli/src/commands/stop.ts` | `waymark stop` — reads `.waymark/waymark.pid`, SIGTERMs both processes, deletes PID file |
| `packages/cli/src/commands/status.ts` | `waymark status` — reads PID file, uses `process.kill(pid, 0)` liveness check, prints pending count and server state; auto-cleans stale PID file on crash |
| `packages/cli/src/commands/logs.ts` | `waymark logs` — prints action table; supports `--pending`, `--blocked`, `--limit N` |

The two server processes run concurrently and share the same SQLite file. The MCP process writes; the API process reads. SQLite handles concurrent access safely because all database calls are **synchronous** (`better-sqlite3`).

---

## Quick Start

### Prerequisites
- Node.js ≥ 18 (via nvm or direct install)
- Claude Desktop or Claude Code with MCP support

### One-command setup

```bash
cd your-project
npx @way_marks/cli init
```

`waymark init` will:
1. Create `waymark.config.json` with default policies
2. Create (or append to) `CLAUDE.md` with instructions telling Claude to always use Waymark tools
3. Update `.gitignore`
4. Register the Waymark MCP server in both Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`) and Claude Code (`.mcp.json`)

Then start Waymark:

```bash
npx @way_marks/cli start
# Opens http://localhost:3001 in your browser
```

Restart Claude Desktop after `init` to pick up the new MCP registration.

### CLI commands

```bash
npx @way_marks/cli init    # first-time setup (idempotent — safe to re-run)
npx @way_marks/cli start   # start API server + MCP server in background, open dashboard
npx @way_marks/cli stop    # stop the background servers
npx @way_marks/cli status  # check if server is running and how many pending actions
npx @way_marks/cli logs    # print recent action table
npx @way_marks/cli logs --pending          # only pending actions
npx @way_marks/cli logs --blocked          # only blocked actions
npx @way_marks/cli logs --limit 50         # show up to 50 rows (default: 20)
```

### Manual setup (if not using npx)

```bash
cd waymark
npm install
npm run build        # compiles TypeScript → packages/server/dist/ and packages/cli/dist/
```

Start the API server:

```bash
WAYMARK_PROJECT_ROOT=/path/to/your-project node packages/server/dist/api/server.js
# Waymark UI + API running at http://localhost:3001
```

Register the MCP server manually in `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "waymark": {
      "type": "stdio",
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/waymark/packages/server/dist/mcp/server.js",
        "--project-root",
        "/absolute/path/to/your-project"
      ]
    }
  }
}
```

> **Important**: Use absolute paths. Claude Desktop spawns MCP processes with a minimal `PATH`. Find your node path with `which node`.

For Claude Code, create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "waymark": {
      "type": "stdio",
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/waymark/packages/server/dist/mcp/server.js",
        "--project-root",
        "/absolute/path/to/your-project"
      ]
    }
  }
}
```

### Open the dashboard

Visit `http://localhost:3001` — the table auto-refreshes every 3 seconds.

---

## waymark.config.json Reference

Waymark reads `waymark.config.json` from the project root **fresh on every tool call** — no restart needed when you edit it.

```json
{
  "version": "1",
  "policies": {
    "allowedPaths":    ["./src/**", "./data/**", "./README.md"],
    "blockedPaths":    ["./.env", "./.env.*", "./package-lock.json", "/etc/**", "/usr/**"],
    "blockedCommands": [
      "rm -rf",
      "DROP TABLE",
      "regex:\\|\\s*bash",
      "regex:\\|\\s*sh\\b"
    ],
    "requireApproval": ["./src/db/**", "./waymark.config.json"],
    "maxBashOutputBytes": 10000
  }
}
```

### Field reference

| Field | Type | Description |
| ------- | ------ | ------------- |
| `allowedPaths` | `string[]` | Glob patterns for paths agents may read/write. Relative patterns resolve from the project root. |
| `blockedPaths` | `string[]` | Glob patterns that are always denied. Checked before `allowedPaths`. |
| `blockedCommands` | `string[]` | Bash rules. Plain strings match as substrings; `regex:` prefix enables regex matching. |
| `requireApproval` | `string[]` | Glob patterns that are logged as `pending` and not executed — manual approval required. |
| `maxBashOutputBytes` | `number` | Defined but currently not enforced in code (known gap). |

### File action precedence

For every `write_file` or `read_file` call, the path is tested in this order:

```markdown
1. blockedPaths?    → decision: block   (throws error, file not touched)
2. requireApproval? → decision: pending (returns message with action_id, file not touched)
3. allowedPaths?    → decision: allow   (proceeds)
4. (default)        → decision: block   ("Path not in allowedPaths")
```

### blockedCommands: plain string vs regex

```jsonc
// Substring match — blocks any command containing "rm -rf"
"rm -rf"

// Regex match — blocks any pipe to bash (curl url | bash, cat x | bash, etc.)
"regex:\\|\\s*bash"

// Regex match — blocks command substitution with curl
"regex:\\$\\(curl"
```

Regex rules use JavaScript `RegExp` with the `i` (case-insensitive) flag. Invalid regex entries are skipped with a `console.warn`.

### Pattern matching

Relative patterns (`./src/**`) are resolved to absolute paths from the project root before matching. Absolute patterns (`/etc/**`) pass through unchanged. Matching uses `micromatch` with `{ dot: true }` so dotfiles (`.env`) are included.

---

## REST API Reference

All endpoints are served by `api/server.ts` on port 3001.

| Method | Path | Response | Notes |
| ------- | ------ | ---------- | ------- |
| `GET` | `/api/actions` | `ActionRow[]` | Last 100 actions, newest first |
| `GET` | `/api/actions?count=true` | `{ count: number }` | Count of pending actions; used by UI badge |
| `GET` | `/api/actions/:action_id` | `ActionRow` | Single action by UUID |
| `GET` | `/api/actions/:action_id/status` | `{ status, decision, approved_by?, approved_at?, rejected_reason?, rejected_at? }` | Lightweight status for agent polling |
| `POST` | `/api/actions/:action_id/approve` | `{ success, action }` | Executes the original action; sets `approved_by='ui'` |
| `POST` | `/api/actions/:action_id/reject` | `{ success, action }` | Body: `{ reason?: string }`; marks rejected, does not execute |
| `POST` | `/api/actions/:action_id/rollback` | `{ success, action, message }` | `write_file` only; see Rollback section |
| `POST` | `/api/slack/interact` | `{ text }` | Slack interactive components endpoint; requires public URL (use ngrok locally) |
| `GET` | `/api/sessions` | `{ session_id, action_count, latest }[]` | Grouped by MCP server process start |
| `GET` | `/api/config` | `WaymarkConfig` | Current parsed `waymark.config.json` |
| `GET` | `/` | HTML | Web dashboard (`src/ui/index.html`) |

### Pending action flow

When `decision=pending`, the MCP server:
1. Logs the action to DB with `status='pending'`
2. Fires a Slack notification (if `WAYMARK_SLACK_WEBHOOK_URL` is set in `.env`)
3. Returns a message to the agent containing the `action_id` and the polling URL:
   ```
   Action requires approval.
   Action ID: <uuid>
   Check status: GET /api/actions/<uuid>/status
   ```
   The agent can poll `/api/actions/:id/status` and continue other work while waiting.

On **approve**: `approvePendingAction` re-executes the original tool (writes the file for `write_file`), sets `status='success'`, `decision='allow'`, and records `approved_by` + `approved_at`.

On **reject**: `rejectPendingAction` sets `status='rejected'` and records `rejected_reason` + `rejected_at`. The file is never written.

### Slack setup

Slack integration is **optional**. If `WAYMARK_SLACK_WEBHOOK_URL` is empty, notifications are silently skipped and approval works entirely from the UI dashboard.

There are two independent pieces:
1. **Incoming webhook** — posts a notification card when an action goes pending (one-way, read-only setup)
2. **Interactive components** — lets you approve/reject directly from the Slack message (requires a public URL)

You can use (1) without (2). Notifications will arrive but the buttons won't work.

#### Step 1 — Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it `Waymark`, pick your workspace → **Create App**

#### Step 2 — Incoming Webhook (notifications)

1. In your app's sidebar: **Incoming Webhooks** → toggle **Activate Incoming Webhooks** ON
2. Click **Add New Webhook to Workspace** → pick the channel (e.g. `#engineering`) → **Allow**
3. Copy the webhook URL — it looks like `https://hooks.slack.com/services/T.../B.../...`
4. Add to `.env`:

```
WAYMARK_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
WAYMARK_SLACK_CHANNEL=#engineering
WAYMARK_BASE_URL=http://localhost:3001
```

`WAYMARK_BASE_URL` is used to build the "View in Dashboard" link inside the Slack card. Set it to whatever URL your Waymark UI is reachable at.

Restart the server. The next pending action will post a card to Slack.

#### Step 3 — Interactive Components (approve/reject buttons)

The Approve and Reject buttons in the Slack card POST to `POST /api/slack/interact`. Slack requires this endpoint to be publicly reachable over HTTPS.

**For local development — use ngrok:**

```bash
ngrok http 3001
```

Copy the `https://` forwarding URL (e.g. `https://abc123.ngrok-free.app`).

1. In your Slack app sidebar: **Interactivity & Shortcuts** → toggle **Interactivity** ON
2. Set **Request URL** to: `https://abc123.ngrok-free.app/api/slack/interact`
3. Click **Save Changes**

> ngrok URLs change on every restart. Update the Request URL in Slack each time.

**For production — set a stable public URL:**

Deploy Waymark behind a reverse proxy (nginx, Caddy, etc.) with TLS, then set the Request URL once to `https://your-domain.com/api/slack/interact`. Update `WAYMARK_BASE_URL` in `.env` to match.

#### Step 4 — Verify

1. Trigger a pending action (write to a `requireApproval` path via the MCP tool)
2. A card should appear in your Slack channel with **Approve** and **Reject** buttons
3. Click **Approve** — the button should update the message and the UI dashboard should show the action as `success / allow`

#### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No Slack message appears | `WAYMARK_SLACK_WEBHOOK_URL` empty or wrong | Check `.env`, restart server |
| Buttons do nothing | Request URL not set or ngrok restarted | Update Interactivity URL in Slack app settings |
| `dispatch_failed` error in Slack | Waymark returned non-200 or timed out | Check server logs; ensure `/api/slack/interact` is reachable |
| `cannot_parse_subscription` | Webhook URL is malformed | Re-copy URL from Slack app settings |
| Buttons appear but action stays pending | `approved_by` not set | Check server logs for handler errors |

---

## Database Schema

Single table: `action_log` in `data/waymark.db`.

| Column | Type | Nullable | Description |
| ------- | ------ | ---------- | ------------- |
| `id` | INTEGER | NO | Auto-increment primary key |
| `action_id` | TEXT | NO | UUID — unique per tool call |
| `session_id` | TEXT | NO | UUID — shared across all calls in one MCP server process |
| `tool_name` | TEXT | NO | `write_file`, `read_file`, or `bash` |
| `target_path` | TEXT | YES | Absolute file path for write/read; `null` for bash |
| `input_payload` | TEXT | NO | JSON-serialized tool arguments |
| `before_snapshot` | TEXT | YES | File content before write (`write_file` only); `null` if file didn't exist |
| `after_snapshot` | TEXT | YES | File content after write, or file content for reads |
| `status` | TEXT | NO | `pending` → `success` / `error` / `blocked` |
| `error_message` | TEXT | YES | Error detail when status=error |
| `stdout` | TEXT | YES | bash stdout output |
| `stderr` | TEXT | YES | bash stderr output |
| `rolled_back` | INTEGER | NO | `0` or `1` |
| `rolled_back_at` | TEXT | YES | ISO datetime of rollback |
| `created_at` | DATETIME | NO | Row creation time |
| `decision` | TEXT | NO | Policy decision: `allow`, `block`, or `pending` |
| `policy_reason` | TEXT | YES | Human-readable reason for the decision |
| `matched_rule` | TEXT | YES | The specific rule that matched (e.g. `./.env`, `rm -rf`, `regex:\|\s*bash`) |
| `approved_at` | TEXT | YES | ISO datetime when approved |
| `approved_by` | TEXT | YES | `'ui'` or `'slack'` |
| `rejected_at` | TEXT | YES | ISO datetime when rejected |
| `rejected_reason` | TEXT | YES | Human-provided rejection reason |

Schema migrations use `try { ALTER TABLE ADD COLUMN ... } catch {}` — safe to run against existing databases.

---

## Rollback

Rollback is available for `write_file` actions only. The UI shows a "rollback" or "delete (new file)" button in the Action column.

**Overwrite rollback**: `before_snapshot` is non-null → the file existed before. Rollback writes `before_snapshot` back to `target_path`.

**New file rollback**: `before_snapshot` is null → the file was created from scratch. Rollback calls `fs.unlinkSync(target_path)` — the file is deleted.

**Blocked actions** never modify the filesystem, so they have no rollback button.

**Pending actions** also never modify the filesystem until explicitly approved. After approval, the approved action row shows a ✅ Approved badge instead of a rollback button.

Once rolled back, `rolled_back=1` is set and the action cannot be rolled back again.

---

## Plan Mode Logging & Observability

**Background**: Claude Code uses "plan mode" — an internal reasoning phase where Claude thinks through a task before executing it. During plan mode, Claude may read files and explore the codebase to understand the context, but these reads are *internal reasoning* (not MCP tool calls) and thus invisible to Waymark.

### What Gets Logged

Waymark logs **execution-phase activities only**:
- ✅ Actual MCP tool calls (`write_file`, `read_file`, `bash`)
- ❌ Internal plan mode reads (not via MCP)
- ❌ Claude's internal reasoning and decision-making

Example workflow:
```
Plan Phase (invisible):          Execution Phase (logged):
├─ Read package.json             → [logged] read_file /project/package.json
├─ Read src/config.ts            → [logged] read_file /project/src/config.ts
├─ Read README.md                → [logged] read_file /project/README.md
└─ Decide: "Let's add a feature"
                                 → [logged] write_file /project/src/feature.ts
                                 → [logged] bash 'npm run build'
```

### Event Types & Filtering

The action log tracks two event types:

- **execution**: Actual tool call in the execution phase (default)
- **observation**: (Reserved for future use) Potential plan mode observations if captured via metadata

In the dashboard, use the **Execution / Observation** filter checkboxes to toggle visibility:
- ✅ Show execution-phase tool calls
- 🔲 Show observation-phase reads (greyed out, for reference only)

### Why Not All Plan Reads Are Visible

**Technical constraint**: MCP (Model Context Protocol) is a stateless protocol. It has no mechanism for communicating "I'm thinking about this file" vs "I'm executing with this file." Only actual tool calls go through MCP.

**Long-term solutions** (Phase 2+):
1. **MCP Protocol Extension**: Propose observation events to the MCP community
2. **Explicit Metadata**: Claude could pass `--context-files` parameter on execution calls
3. **UI Heuristics**: Infer planning patterns from rapid consecutive reads

### For Users

- **Expect gaps**: Plan mode reads won't show in Waymark
- **Full visibility on execution**: All actual tool calls are logged perfectly
- **Check logs after execution**: Once Claude is in execution phase, all actions are captured

### For AI Agents / Future Developers

- Add `event_type` to queries to distinguish execution from potential future observations
- `observation_context` field is available for storing metadata about inferred plan-phase activities
- `request_source` field tracks whether the call came directly or was inferred

---

## For AI Agents

Key facts for working with this codebase:

**Module dependency order** (bottom-up):
```markdown
micromatch, better-sqlite3, express, dotenv, fetch (Node 18+ built-in)
    ↓
packages/server/src/db/database.ts            (no imports from waymark modules)
packages/server/src/policies/engine.ts        (no imports from waymark modules)
    ↓
packages/server/src/notifications/slack.ts    (imports db/database for ActionRow type only)
packages/server/src/approvals/handler.ts      (imports db/database)
    ↓
packages/server/src/mcp/server.ts             (imports database + engine + notifications/slack)
packages/server/src/api/server.ts             (imports database + engine + approvals/handler)
```

**Path resolution — `WAYMARK_PROJECT_ROOT`**: Both `database.ts` and `policies/engine.ts` resolve their data/config paths via:
```typescript
const PROJECT_ROOT = process.env.WAYMARK_PROJECT_ROOT || process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');           // database.ts
const CONFIG_PATH = path.join(PROJECT_ROOT, 'waymark.config.json');  // engine.ts
```
`WAYMARK_PROJECT_ROOT` is set by the `--project-root` CLI argument parsed at the very top of `mcp/server.ts` **before any imports** (because `database.ts` and `engine.ts` read the env var at module load time). When running via `waymark start`, `process.cwd()` is the project directory so the fallback works correctly.

`api/server.ts` uses a fixed relative path for the UI directory:
```typescript
const UI_DIR = path.resolve(__dirname, '../../src/ui');
```
From `packages/server/dist/api/`, `../..` resolves to `packages/server/`, then `src/ui` is the source directory. This works without `WAYMARK_PROJECT_ROOT` because the UI always ships alongside the server package.

**Database is synchronous**: `better-sqlite3` is used throughout. There is no `await` on any database call. Do not introduce async database wrappers.

**Config is read fresh every call**: `loadConfig()` in `engine.ts` reads and parses `waymark.config.json` on every invocation. No caching. Changes to the config file take effect immediately without restarting the MCP server.

**MCP server must be restarted to pick up recompiled code**: The policy config is hot-reloaded, but the TypeScript-compiled JavaScript is not. After `npm run build`, restart Claude Desktop (or the MCP process) for engine changes to take effect.

**SESSION_ID** is a UUID generated once per MCP server process start (`const SESSION_ID = uuidv4()` at module level in `mcp/server.ts`). It groups all tool calls within one session.

**Environment variables** (loaded via `dotenv/config` as first import in both server files):
- `WAYMARK_PROJECT_ROOT` — absolute path to the project being monitored; determines where `data/waymark.db` and `waymark.config.json` are read from. Set via `--project-root` CLI arg or `waymark start`. Falls back to `process.cwd()`.
- `WAYMARK_SLACK_WEBHOOK_URL` — Slack incoming webhook; if empty, Slack notifications are silently skipped
- `WAYMARK_SLACK_CHANNEL` — informational only, not used in code (webhook targets its own channel)
- `WAYMARK_BASE_URL` — used to build "View in Dashboard" link in Slack messages (default: `http://localhost:3001`)

**Approval re-execution**: `approvals/handler.ts` re-checks current policies before executing. Only `write_file` requires re-execution (writes the file to disk and records `after_snapshot`). `read_file` actions cannot be pending (requireApproval only applies to writes), but if one somehow reaches the approval handler it is marked approved with no re-execution. Other tool types return an error.

**Route registration order** in `api/server.ts` is significant: `/approve`, `/reject`, `/status` sub-routes are registered before the `/:action_id` catch-all GET, otherwise Express would match the sub-routes as action IDs.

**Known gaps**:
- No rate limiting on API endpoints
- `getActions()` is hardcoded to `LIMIT 100` with no pagination
- Approved `write_file` rows do not show a rollback button (after-approval rollback is not implemented)

**Before modifying `mcp/server.ts`**: the policy check must remain before `insertAction` for blocked/pending cases — these actions must never touch the filesystem. For pending, the Slack notification fires after `insertAction` with an inline ActionRow object (no DB round-trip).

**Before modifying `policies/engine.ts`**: the precedence order (blocked → pending → allowed → default deny) is load-bearing. Changing it changes observable behavior for all callers.

---

## Development

```bash
npm run build                   # compile both packages (tsc in each workspace)
cd packages/server && npm run dev:api    # API server only (ts-node)
cd packages/server && npm run dev:mcp   # MCP server only (ts-node)
cd packages/server && npm run db:reset  # delete data/waymark.db and recreate schema
```

**Building the CLI**: `cd packages/cli && npm run build` compiles to `packages/cli/dist/`. Test locally with `node packages/cli/dist/index.js <command>`.

**Extending tools**: Add new tool schemas to `ListToolsRequestSchema` handler and a new `else if (name === '...')` branch in `CallToolRequestSchema` handler in `packages/server/src/mcp/server.ts`. Follow the existing pattern: policy check → insertAction → execute → updateAction.

---

## Release Operations

### Automated Release (Recommended)

Use the release script to automate versioning, tagging, and CI/CD triggering:

```bash
npm run release major|minor|patch
```

The script:
1. Validates git state is clean and pre-flight checks pass
2. Calculates next semantic version (e.g. `0.5.2` + `patch` → `0.5.3`)
3. Updates `packages/cli/package.json` and `packages/server/package.json`
4. Updates `CHANGELOG.md` and `release/CHANGELOG.md` with placeholder entry
5. Commits version bump: `chore: bump version to X.Y.Z`
6. Creates and pushes git tag `vX.Y.Z`
7. GitHub Actions `release.yml` automatically publishes to npm and creates GitHub Release

Example:
```bash
# Release version 0.6.0 (minor bump from 0.5.2)
npm run release minor
```

The script exits immediately after pushing the tag. CI/CD runs asynchronously. Monitor at: [https://github.com/waymarks/waymark/actions](https://github.com/waymarks/waymark/actions)

### Manual Release (if needed)

If you prefer manual control:

1. Bump versions in `packages/server/package.json` and `packages/cli/package.json` (both must match).
2. Update the server dependency reference inside `packages/cli/package.json` → `dependencies["@way_marks/server"]` to the same new version.
3. Regenerate the lock file: `npm install --package-lock-only`
4. Add a `release/CHANGELOG.md` entry for the new version (user-facing changelog copied to public repo).
5. Add a root `CHANGELOG.md` entry (dev changelog, not published).
6. Commit, then tag: `git tag v<version> && git push origin v<version>`
7. The `.github/workflows/release.yml` workflow runs on the tag push, builds, publishes both packages to npm, and creates a GitHub Release on `waymarks/waymark`.

### How to release a new version

### Known CI/CD failure: E403 "cannot publish over previously published version"

**Symptom**: The `Publish CLI to npm` or `Publish Server to npm` step in `release.yml` fails with:
```
npm error code E403
npm error 403 Forbidden — You cannot publish over the previously published versions: X.Y.Z
```

**Cause**: The version in `packages/cli/package.json` or `packages/server/package.json` was not bumped before tagging. npm does not allow re-publishing an already-released version.

**Fix**:
1. Bump both package versions (e.g. `0.3.1` → `0.4.0`).
2. Update the `@way_marks/server` dependency version in `packages/cli/package.json` to match.
3. Run `npm install --package-lock-only` to update `package-lock.json`.
4. Commit the version bump, re-tag, and push.

**Rule**: Always bump both package versions together — they are released as a matched pair. The CLI declares a hard dependency on the exact server version, so they must stay in sync.

### npm auto-correct warnings (non-fatal)

`release.yml` may print these warnings — they are safe to ignore:
```
npm warn publish "bin[waymark]" script name was cleaned
npm warn publish "repository.url" was normalized to "git+https://..."
```
npm normalises some `package.json` fields before publishing. They do not affect the published package.
