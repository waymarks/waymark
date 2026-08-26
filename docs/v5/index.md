# Waymark v5 — Unified Architecture

Waymark v5 replaces the per-project server model with a single global daemon. One URL, one process, zero friction for multi-project teams.

## What Changed

| | v4 (legacy) | v5 (unified) |
|---|---|---|
| Process model | 2 processes per project | 1 global daemon |
| Dashboard URL | Different port per project | Always `localhost:47000` |
| MCP registration | 1 entry per project in Claude Desktop | 1 universal `waymark` entry |
| Tool names | `mcp__waymark-my-app__write_file` | `mcp__waymark__write_file` |
| Policy | Per-project only | Global → project inheritance |
| Team | Per-project roster | Global `~/.waymark/team.json` |
| Start command | `cd project && waymark start` | `waymark daemon start` (once) |

---

## Dashboard refinements (5.0.1 – 5.0.5)

The unified daemon shipped in 5.0.0; the following patches hardened the multi-project dashboard:

- **Active Project switcher** (5.0.2) — a sidebar dropdown switches every view to the selected project. The daemon serves each project's data directly from its database, and the footer always shows the daemon port `:47000`.
- **In-dashboard project navigation** (5.0.4) — the **Hub** "Open" button and **Settings → Projects** links switch the active project via `?project=<id>` (no more dead per-project port links). Stale `:3001` references were corrected to `:47000`.
- **Copilot CLI over MCP** (5.0.4) — the legacy shell wrapper was removed; `waymark init --platform copilot-cli` registers Waymark as an MCP server, giving Copilot CLI the same policy enforcement, approvals, and rollback as Claude.
- **Agent Monitor project scoping** (5.0.3, 5.0.5) — agent monitoring is machine-wide, but the `/agents` view now defaults to the **active project** (matched by working directory) with a `This project | All projects` toggle. It works even when the active project has no live per-project server. Rate Limits and Orphan Ports stay machine-wide.

---

## Quick Migration (existing users)

```bash
# 1. Register universal MCP (one-time)
waymark global-setup

# 2. Restart Claude Code once (last time ever for MCP changes)

# 3. Start the global daemon
waymark daemon start

# 4. Auto-start on login (optional but recommended)
waymark service install

# 5. Clean up old per-project MCP entries
waymark cleanup-mcp

# 6. Update CLAUDE.md in all your projects
waymark update-instructions --all

# 7. Add explicit IDs to your projects (optional but recommended)
# Add "id": "my-project" to each waymark.config.json
# Then: waymark doctor  to check health
```

---

## New Commands Reference

### Daemon
```bash
waymark daemon start           # start on port 47000
waymark daemon stop
waymark daemon restart
waymark daemon status          # list registered projects
waymark daemon logs [-f]       # view logs
```

### Universal MCP
```bash
waymark global-setup           # register universal MCP entry
waymark cleanup-mcp            # remove old per-project entries
```

`global-setup` registers one universal `waymark` server across **all supported hosts** — Claude Desktop (`claude_desktop_config.json`), Claude Code (`~/.claude/settings.json`), and GitHub Copilot CLI (`~/.copilot/mcp-config.json`). The single entry detects the project at call time, so it guards every project without per-project registration. `cleanup-mcp` removes stale per-project `waymark-*` entries from all three hosts while leaving unrelated MCP servers untouched.

### Project Health
```bash
waymark doctor                 # diagnose all issues
waymark relocate [path]        # update registry after rename/move
```

### Non-Interactive Init
```bash
waymark init --yes --platform claude --id my-service
waymark init --yes --policy-template strict --extend-global
waymark init --dry-run         # preview without writing
```

### CLAUDE.md Management
```bash
waymark update-instructions           # update current project
waymark update-instructions --all     # update all projects
waymark update-instructions --check   # CI: exit 1 if outdated
```

### Shell Prompt
```bash
waymark prompt-status                       # "⚑ 3 pending"
waymark shell-integration install           # add to ~/.zshrc
```

### System Service
```bash
waymark service install    # launchd (macOS) / systemd (Linux)
waymark service remove
waymark service status
waymark service logs [-f]
```

### Global Policy
```bash
waymark global-config init     # create ~/.waymark/global.config.json
waymark global-config show
waymark global-config edit
```

### Global Team
```bash
waymark team init
waymark team add alice@co.com --name "Alice" --role lead
waymark team list
```

### Workspaces
```bash
waymark workspace create "My Platform" --id platform
waymark workspace add-project platform /dev/frontend
waymark workspace start platform
```

---

## Backward Compatibility

All v4 features continue to work unchanged:
- `waymark start` (per-project) still works
- Per-project ports still allocate correctly
- Existing `waymark.config.json` files with no `"id"` field continue to work (with a deprecation warning)
- Per-project MCP entries in Claude Desktop still function until you run `cleanup-mcp`

---

## Configuration (v5 additions)

```json
{
  "id": "my-project",        // stable identity (new)
  "extends": "global",       // inherit global policy (new)
  "overrideGlobal": false,   // allow full policy override (new, use with caution)
  "version": "2",
  "platforms": ["claude"],
  "policies": { ... }
}
```

## Global Policy (`~/.waymark/global.config.json`)

```json
{
  "version": "1",
  "policies": {
    "blockedPaths": [".env", ".env.*", "/etc/**", "**/.ssh/**"],
    "blockedCommands": ["rm -rf", "DROP TABLE", "chmod 777"],
    "maxBashOutputBytes": 10000
  }
}
```

Projects that set `"extends": "global"` automatically inherit these rules. The global blocked lists are always enforced — projects can only add to them, never remove.

---

## Cross-Project API Endpoints

Available when the daemon is running:

| Endpoint | Description |
|---|---|
| `GET /api/daemon/status` | Daemon health, uptime, project list |
| `GET /api/global/approvals/pending` | All pending actions across all projects |
| `GET /api/global/analytics/summary?window=7d` | Aggregate stats |
| `GET /api/global/actions?status=pending` | Global action feed |
| `GET /api/global/audit/export?format=csv&window=30d` | Merged audit log |
| `POST /api/global/approvals/:id/approve` | Approve from any project |
| `POST /api/global/approvals/:id/reject` | Reject from any project |
| `GET /api/hub/projects` | Registry with live pending counts |
