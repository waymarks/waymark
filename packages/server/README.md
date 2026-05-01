# @way_marks/server

MCP server and REST API backend for [Waymark](https://github.com/waymarks/waymark).

> **This package is installed automatically** by `@way_marks/cli`.
> End users should not install it directly.

```bash
# Correct — install the CLI, which pulls in this package
npx @way_marks/cli init
```

---

## What this package provides

Two long-running Node.js processes, both spawned by `waymark start`:

| Process | Entry point | What it does |
|---------|-------------|--------------|
| MCP server | `dist/mcp/server.js` | stdio MCP server — intercepts Claude Code tool calls, enforces policy, logs actions |
| API server | `dist/api/server.js` | HTTP server on port 3001 — serves dashboard UI and REST API |

Both processes share the same SQLite database (`<project-root>/.waymark/waymark.db`). The MCP process writes; the API process reads. All database calls are synchronous (`better-sqlite3`) so concurrent access is safe.

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WAYMARK_PROJECT_ROOT` | Yes | `process.cwd()` | Absolute path to the project being monitored. Sets where `waymark.config.json` and `data/waymark.db` are resolved. |
| `PORT` | No | `3001` | Port for the API + dashboard server. |
| `WAYMARK_SLACK_WEBHOOK_URL` | No | — | Incoming webhook URL for Slack notifications on pending actions. |
| `WAYMARK_SLACK_CHANNEL` | No | — | Slack channel to post to (e.g. `#engineering`). |
| `WAYMARK_BASE_URL` | No | `http://localhost:3001` | Base URL used in Slack message links back to the dashboard. |

---

## REST API

All endpoints are served by `dist/api/server.js` on port 3001.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/actions` | List all logged actions. Query: `?count=true` returns `{ count: N }` for pending actions only. |
| `GET` | `/api/actions/:id` | Get a single action by ID. |
| `GET` | `/api/actions/:id/status` | Get the current status of an action (`pending`, `approved`, `rejected`, `blocked`, `allowed`). |
| `POST` | `/api/actions/:id/approve` | Approve a pending action — executes the held write and marks it approved. |
| `POST` | `/api/actions/:id/reject` | Reject a pending action — marks it rejected, action is not executed. |
| `POST` | `/api/actions/:id/rollback` | Roll back an approved write_file action to its before-snapshot. |
| `POST` | `/api/slack/interact` | Slack interactive component handler (approve/reject from Slack message buttons). |
| `GET` | `/api/sessions` | List all session IDs that have logged actions. |
| `GET` | `/api/config` | Return the current parsed `waymark.config.json` for the active project. |
| `GET` | `/api/version` | Return version information: `{ currentVersion, latestVersion, updateAvailable }`. Checks npm registry with 24-hour cache. Used by dashboard VersionBanner for update notifications. |
| `GET` | `*` | Catch-all — serves the dashboard `index.html`. |

---

## MCP tools

The MCP server exposes three tools to Claude Code:

| Tool | Replaces | Description |
|------|----------|-------------|
| `waymark:write_file` | `write_file` | Write a file — subject to policy before execution. |
| `waymark:read_file` | `read_file` | Read a file — always logged. |
| `waymark:bash` | `bash` | Run a shell command — checked against `blockedCommands` before execution. |

---

## License

MIT — see [LICENSE](https://github.com/waymarks/waymark/blob/main/LICENSE)
