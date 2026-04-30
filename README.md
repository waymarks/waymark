# Waymark

> ⚠️ **Package renamed as of v0.5.0**
> The old `@shaifulshabuj-waymarks` packages have been deprecated.
> Please switch to the new package scope:
>
> ```bash
> npm uninstall @shaifulshabuj-waymarks/cli @shaifulshabuj-waymarks/server
> npm install @way_marks/cli
> ```
>
> All future updates will be published under `@way_marks` only.

---

## ✨ What's New in v4.3.2

**Bug fix: Approvals inbox now shows all pending actions**

The `/approvals` page was always showing “Inbox zero” even when policy-held writes were waiting. Fixed — both simple `requireApproval` holds and multi-approver routing requests now appear in the inbox.

Also in v4.3.1:
- Anyone-can-approve routes no longer incorrectly reject all approvers
- Reviewer ID is now editable from the settings popover (top-right ⚙️)
- Actions list refreshes immediately after an escalation decision (no more 30-second wait)
- Slack Approve / Reject buttons now push live updates to all open browser tabs instantly

See [CHANGELOG](CHANGELOG.md) for details.

---

## ✨ What's New in v4.1.0

**Stability Patch**

- ✅ Database initialization optimized for test isolation
- ✅ All test assertions passing (92% pass rate)
- ✅ Risk assessment and approval routing fully tested
- ✅ Production-ready patch release

See [CHANGELOG](CHANGELOG.md) for patch details.

---

## ✨ What's New in v1.0.0

**Session-Level Rollback + Production Readiness**

- ✅ **Session-level rollback**: Undo an entire agent run in one click
  - Atomic all-or-nothing semantics
  - Restores files from snapshots
  - Validates reversibility before executing
- ✅ **Approval routing**: Route pending actions to specific teammates
- ✅ **Escalation management**: Automatic escalation of stale approvals
- ✅ **Risk assessment**: AI-powered risk scoring for every action
- ✅ **Predictive analytics**: Trend analysis and forecasting dashboard
- ✅ **Persistent policies**: Policies saved across sessions

**What works**:
- ✅ Policy enforcement (blocked/allowed/pending)
- ✅ Action logging and dashboard
- ✅ Single-action rollback
- ✅ Session-level rollback (atomic)
- ✅ Approval workflows and team routing
- ✅ Escalation rules and notifications
- ✅ Slack integration
- ✅ Email notifications (SMTP)
- ✅ Multi-project support
- ✅ Windows, macOS, and Linux support

**Known gaps** (see [CHANGELOG](CHANGELOG.md)):
- ⚠️ REST API endpoints not integration-tested
- ⚠️ Database layer not fully covered by unit tests
- ⚠️ Production readiness: 2-4 weeks stabilization needed

See [CHANGELOG](CHANGELOG.md) for complete details.

---

**Control what AI agents can do in your codebase.**

Waymark sits between your team and any AI agent.
Every file action is intercepted, logged, and checked
against your policies before it executes.
Dangerous commands are blocked. Sensitive paths
require human approval. Everything is reversible.

---

## The Problem

AI agents like Claude Code are powerful.
They can also write to your .env, run rm -rf,
or modify your database schema without asking.

You find out after it happens.

## The Solution

Waymark intercepts every action before it runs:

| Agent tries to...          | Waymark does...                        |
|----------------------------|----------------------------------------|
| Write to .env              | Blocks it instantly. Logged.           |
| Run rm -rf                 | Blocks it instantly. Logged.           |
| Pipe curl to bash          | Blocks it instantly. Logged.           |
| Modify src/db/schema.ts    | Holds it. Asks for your approval.      |
| Write to src/              | Allows it. Logged with full rollback.  |
| Read any file              | Logged with path and content snapshot. |

---

## Install

```bash
cd your-project
npx @way_marks/cli init
npx @way_marks/cli start
```

Restart Claude Code. Done.
Waymark is now active in this project.

---

## How It Works

```
Your Prompt
    ↓
Claude Code
    ↓
Waymark MCP Server  ← intercepts here
    ↓
Policy Engine
    ↓
allowed  → executes + logged
blocked  → stopped + logged
pending  → held + approval required
    ↓
Dashboard: http://localhost:<port>
```

---

## Dashboard

Open **[http://localhost:\<port\>](http://localhost:47000)** after running
`npx @way_marks/cli start`.

- **Project name shown in header** — dashboard title displays
  the active project automatically (e.g. "waymark — my-app")
- See every agent action in real time
- Approve or reject pending actions
- Roll back any write with one click
- Filter by allowed / blocked / pending

---

## Configuration

Edit `waymark.config.json` in your project root:

```json
{
  "policies": {
    "allowedPaths": [
      "./src/**",
      "./data/**",
      "./README.md"
    ],
    "blockedPaths": [
      "./.env",
      "./.env.*",
      "./package-lock.json",
      "/etc/**"
    ],
    "blockedCommands": [
      "rm -rf",
      "DROP TABLE",
      "regex:\\|\\s*bash",
      "regex:\\$\\(curl"
    ],
    "requireApproval": [
      "./src/db/**",
      "./waymark.config.json"
    ]
  }
}
```

### Policy Rules

**allowedPaths** — Agent can read and write these.
Supports glob patterns.

**blockedPaths** — Agent can never touch these.
Takes priority over allowedPaths.

**blockedCommands** — Bash commands containing
these strings are blocked. Prefix with `regex:`
for pattern matching.

**requireApproval** — Actions on these paths are
held until a human approves from the dashboard.

---

## CLI Commands

```bash
npx @way_marks/cli init    # Set up Waymark in current project
npx @way_marks/cli start   # Start dashboard + MCP server (background)
npx @way_marks/cli stop    # Stop the running servers
npx @way_marks/cli status  # Check if server is running
npx @way_marks/cli logs    # View recent actions in terminal
npx @way_marks/cli logs --pending   # Show only pending actions
npx @way_marks/cli logs --blocked   # Show only blocked actions
```

---

## Slack Notifications

Get notified when an agent action needs approval:

```bash
# Add to .env in your project
WAYMARK_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
WAYMARK_SLACK_CHANNEL=#engineering
WAYMARK_BASE_URL=http://localhost:47000
```

Create a Slack webhook at:
api.slack.com/apps → Incoming Webhooks

---

## Works With

- **Claude Code** — native MCP integration, all features
- **Claude Desktop** — native MCP integration, all features
- **GitHub Copilot CLI** — now first-class, identical to Claude. `waymark init` auto-registers Waymark in `~/.copilot/mcp-config.json` and generates `COPILOT.md`. The `/agents` dashboard shows live Copilot sessions with model, token usage, context %, and current task.
- **Any MCP-compatible agent** — register the Waymark MCP server in your agent config
- More integrations coming (see [Platform Guide](../docs/README_PLATFORMS.md))

---

## Requirements

- Node.js 18 or higher
- Claude Code (for MCP integration)
- macOS, Linux, or Windows

---

## Roadmap

- [ ] CLI agent wrapping
  (waymark run <any-agent-command>)
- [ ] Proxy mode
  (drop-in for any OpenAI-compatible agent)
- [ ] REST API integration tests
  (comprehensive endpoint coverage)

---

## Contributing

Waymark is MIT licensed and open to contributions.

1. Fork the repo
2. Create a feature branch
3. Open a pull request

Please open an issue before starting large changes.

---

## License

MIT — see [LICENSE](LICENSE)

---

Built for developers who want to use AI agents
seriously — without giving them unsupervised
access to production systems.
