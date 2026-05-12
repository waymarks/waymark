# Waymark

**Control what AI agents can do in your codebase.**

Waymark sits between your AI agent and your codebase.
Every file write and shell command is intercepted,
checked against your policies, logged, and made reversible
before it executes. Dangerous commands are blocked.
Sensitive paths require human approval.

---

## Platform Support

| Platform | Status |
|----------|--------|
| **Claude Code** | ✅ Recommended |
| **Claude Desktop** | ✅ Recommended |
| **GitHub Copilot CLI** | ✅ Supported |
| **GitHub Copilot Chat** | ⏳ Future (waiting for GitHub MCP) |

---

## The Problem

AI agents are powerful.
They can also write to your `.env`, run `rm -rf`,
or modify your database schema without asking.

You find out after it happens.

## The Solution

Waymark intercepts every action before it runs:

| Agent tries to...          | Waymark does...                        |
|----------------------------|----------------------------------------|
| Write to `.env`            | Blocks it instantly. Logged.           |
| Run `rm -rf`               | Blocks it instantly. Logged.           |
| Pipe `curl` to `bash`      | Blocks it instantly. Logged.           |
| Modify `src/db/schema.ts`  | Holds it. Asks for your approval.      |
| Write to `src/`            | Allows it. Logged with full rollback.  |
| Read any file              | Logged with path and content snapshot. |

---

## Install

```bash
cd your-project
npx @way_marks/cli init
npx @way_marks/cli start
```

Choose your platform during `init` (Claude Code, Claude Desktop, or GitHub Copilot CLI).
Restart your agent. Done. Waymark is now active.

---

## How It Works

```
Your Prompt
    ↓
Claude Code / GitHub Copilot CLI
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

Open the dashboard after running `npx @way_marks/cli start`:

```bash
npx @way_marks/cli status   # prints the dashboard URL
```

- See every agent action in real time
- Approve or reject pending actions
- Roll back any write with one click
- Filter by allowed / blocked / pending
- **Hub view** — manage every Waymark project on this machine from one screen

---

## Agent Monitor

See every AI agent running on your machine — live:

```bash
$ waymark agents
Agent     PID    Status      Ctx%  Tokens   Task                        Age
copilot   39897  thinking     52%  146,032  Refactor auth module          1m
claude    64586  waiting      37%   75,060  (idle)                       12m

$ waymark agents --json           # full token/tool/turn breakdown
$ waymark agents --agent copilot  # filter to one agent
```

Also available on the dashboard at `http://localhost:<port>/agents`.

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

**allowedPaths** — Agent can read and write these (glob patterns).

**blockedPaths** — Agent can never touch these. Takes priority over `allowedPaths`.

**blockedCommands** — Bash commands containing these strings are blocked.
Prefix with `regex:` for pattern matching.

**requireApproval** — Actions on these paths are held until a human approves
from the dashboard or Slack.

---

## CLI Commands

```bash
npx @way_marks/cli init          # Set up Waymark in current project
npx @way_marks/cli start         # Start dashboard + MCP server (background)
npx @way_marks/cli stop          # Stop the running servers
npx @way_marks/cli status        # Check if server is running + version info
npx @way_marks/cli logs          # View recent actions in terminal
npx @way_marks/cli logs --pending   # Show only pending actions
npx @way_marks/cli logs --blocked   # Show only blocked actions
npx @way_marks/cli agents        # Live view of all running AI agents
npx @way_marks/cli update        # Install latest version from npm
npx @way_marks/cli cache-clear   # Clear cached version check (troubleshooting)
```

The CLI automatically checks for updates on startup (non-blocking, 24-hour cache).

---

## Slack Notifications

Get notified when an agent action needs approval:

```bash
# Add to .env in your project
WAYMARK_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
WAYMARK_SLACK_CHANNEL=#engineering
WAYMARK_BASE_URL=http://localhost:<port>
```

Create a Slack webhook at: api.slack.com/apps → Incoming Webhooks

---

## Requirements

- Node.js 18 or higher
- macOS, Linux, or Windows

---

## What's Included

✅ **Policy enforcement** — Block paths, commands, require approvals  
✅ **Action logging** — Full audit trail with before/after snapshots  
✅ **Rollback** — Undo any write with one click  
✅ **Agent monitor** — Live view of every AI agent on your machine  
✅ **Slack integration** — Approve or reject actions from Slack  
✅ **Team approval routing** — Assign approvals to specific teammates  
✅ **Session-level rollback** — Undo an entire agent run at once  
✅ **Hub view** — Manage all your Waymark projects from one dashboard  
✅ **GitHub Copilot CLI** — First-class support alongside Claude  
✅ **Multi-platform** — macOS, Linux, and Windows  

---

## Contributing

Waymark is MIT licensed and open to contributions.

1. Fork the repo: [github.com/shaifulshabuj/waymark](https://github.com/shaifulshabuj/waymark)
2. Create a feature branch
3. Open a pull request

Please open an issue before starting large changes.

---

## License

MIT — see [LICENSE](LICENSE)

---

Built for developers who want to use AI agents seriously —
without giving them unsupervised access to production systems.
