# Feature 02: Session-Level Rollback — Setup Guide

> **[← Overview](./README.md)** | [Testing Guide](./testing-guide.md)

---

## Prerequisites

- [ ] Waymark CLI v1.0.2 or later installed
- [ ] Waymark server running — `http://localhost:3001` accessible
- [ ] MCP configured for your AI agent (Claude Code or Claude Desktop)
- [ ] A test project directory (the `acme-api` demo project from Feature 01 works well)

Session tracking is **enabled by default** in Waymark v1.0.2. No additional configuration is required to enable basic session grouping and rollback.

---

## How Sessions Are Created

Waymark automatically creates a new session each time an AI agent begins a connected invocation. A session groups all actions (writes, shell commands) that occur between agent start and agent completion or disconnection.

Sessions are named automatically using a timestamp and a short identifier derived from the agent's first action. You can rename sessions from the dashboard.

---

## Configuration Reference

Session retention and rollback behavior can be tuned in `waymark.config.json`:

```json
{
  "version": "2",
  "platforms": ["claude"],
  "sessions": {
    "retentionDays": 7,
    "captureBeforeSnapshot": true,
    "flagIrreversibleOperations": true,
    "requireConfirmationOnRollback": true
  },
  "policies": {
    "allowedPaths": ["src/**", "tests/**", "docs/**"],
    "blockedPaths": [".env.production"],
    "blockedCommands": ["DROP TABLE", "DROP DATABASE", "rm -rf"],
    "requireApproval": ["src/db/migrations/**", "deploy/**"]
  }
}
```

### Session Configuration Fields

| Field | Default | Description |
|-------|---------|-------------|
| `retentionDays` | `7` | How long before snapshots are automatically purged. Increase for compliance environments. |
| `captureBeforeSnapshot` | `true` | Whether to capture file content before each write. Must be `true` for rollback to function. |
| `flagIrreversibleOperations` | `true` | Whether to visually flag shell commands or operations that cannot be undone. |
| `requireConfirmationOnRollback` | `true` | Whether to show a confirmation dialog before executing a session rollback. Recommended: keep `true`. |

> **Important**: Setting `captureBeforeSnapshot` to `false` disables rollback entirely. Do not disable this in production environments unless you have an explicit reason.

---

## Dashboard: Sessions Tab

After one or more AI agent sessions have run, the **Sessions** tab in the dashboard (`http://localhost:3001/sessions`) shows:

- Session name and start/end timestamps
- Number of operations (writes, commands) in the session
- Reversibility status (all reversible / has irreversible operations)
- Rollback button (active if session is within retention window)
- Per-file diff view (before/after for each write)

---

## acme-api Demo Project Setup

If you haven't already created the demo project:

```bash
mkdir acme-api && cd acme-api
mkdir -p src/db/migrations src/api src/models deploy/production
echo "// User model" > src/models/user.js
echo "// API routes" > src/api/index.js
echo '{"version":"2","platforms":["claude"],"sessions":{"retentionDays":7,"captureBeforeSnapshot":true,"flagIrreversibleOperations":true,"requireConfirmationOnRollback":true},"policies":{"allowedPaths":["src/**","tests/**","docs/**"],"blockedPaths":[".env.production"],"blockedCommands":["DROP TABLE","DROP DATABASE","rm -rf"],"requireApproval":["src/db/migrations/**","deploy/**"]}}' > waymark.config.json
```

This creates pre-existing files (`src/models/user.js`, `src/api/index.js`) that the testing guide will use to demonstrate rollback of modifications to existing files.

---

## Verifying Session Tracking Is Active

1. Open the dashboard: `http://localhost:3001`
2. Navigate to **Sessions**
3. Start a short AI agent task (e.g., "Add a comment to src/api/index.js")
4. Confirm a new session entry appears in the Sessions tab after the task completes
5. Click the session to verify it shows the file write with a before/after diff

If no session appears, restart the Waymark server and ensure the MCP connection is active.

---

## Retention and Compliance Considerations

For teams operating under change management or audit requirements, consider increasing `retentionDays` to match your retention policy (e.g., 30 or 90 days). Before snapshots are stored locally by Waymark — ensure the host machine has adequate disk space if retention is extended.

---

*[Testing Guide →](./testing-guide.md)*
