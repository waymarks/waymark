# Feature 01: Team Approval Routing — Setup Guide

> **[← Overview](./README.md)** | [Testing Guide](./testing-guide.md)

---

## Prerequisites

Before configuring approval routing, ensure the following are in place:

1. **Waymark CLI installed** — `npx @way_marks/cli --version` returns `1.0.2` or later
2. **Waymark server running** — `npx @way_marks/cli start` should be active; dashboard accessible at `http://localhost:3001`
3. **MCP configured** — Waymark is registered as an MCP server in your Claude Code or Claude Desktop settings
4. **Reviewer email(s)** — You have the email addresses of the designated approvers (required for email notification integration)
5. **Test project** — A clean project directory you can safely write to during testing

---

## Configuration Reference

Approval routing is controlled by the `policies` block in `waymark.config.json` at your project root.

### Minimal Configuration (File Path Approval)

The following example configures approval routing for database migrations and environment files in a fictional `acme-api` project:

```json
{
  "version": "2",
  "platforms": ["claude"],
  "policies": {
    "allowedPaths": [
      "src/**",
      "tests/**",
      "docs/**"
    ],
    "blockedPaths": [
      ".env.production",
      "secrets/**"
    ],
    "blockedCommands": [
      "DROP TABLE",
      "DROP DATABASE",
      "rm -rf",
      "truncate"
    ],
    "requireApproval": [
      "src/db/migrations/**",
      "src/db/schema.sql",
      "deploy/**",
      "infrastructure/**",
      ".env.staging"
    ]
  }
}
```

### Configuration Fields Explained

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Config schema version — always `"2"` for current releases |
| `platforms` | array | Which AI agent platforms this policy applies to (`claude`, `copilot`) |
| `allowedPaths` | array | Glob patterns for paths the AI agent may write freely, no approval needed |
| `blockedPaths` | array | Glob patterns for paths that are unconditionally denied — no approval path |
| `blockedCommands` | array | Shell command substrings that are unconditionally blocked |
| `requireApproval` | array | Glob patterns for paths that require human approval before write executes |

> **Policy evaluation order**: `blockedPaths` and `blockedCommands` are checked first. If a path or command matches a block rule, it is denied immediately — it never reaches the approval queue. `requireApproval` is only checked for actions that cleared the block rules.

### Advanced: Extended Approval Configuration (Future Schema)

> Note: The following fields are on the roadmap and may not be available in v1.0.2. Check the dashboard at `http://localhost:3001/settings` for currently available options.

```json
{
  "requireApproval": [
    {
      "pattern": "src/db/migrations/**",
      "approvers": ["dba@acme.com"],
      "escalateTo": "engineering-lead@acme.com",
      "escalateAfterHours": 4,
      "requireReason": true,
      "minApprovals": 1
    },
    {
      "pattern": "deploy/production/**",
      "approvers": ["tech-lead@acme.com"],
      "escalateTo": "cto@acme.com",
      "escalateAfterHours": 2,
      "requireReason": true,
      "minApprovals": 2
    }
  ]
}
```

---

## Environment Variables

For email notification integration with approval routing, set the following in your environment before starting the Waymark server:

```bash
# SMTP configuration (required for email notifications on approvals)
export WAYMARK_SMTP_HOST="smtp.yourdomain.com"
export WAYMARK_SMTP_PORT="587"
export WAYMARK_SMTP_USER="waymark@yourdomain.com"
export WAYMARK_SMTP_PASS="your-smtp-password"
export WAYMARK_SMTP_FROM="waymark-alerts@yourdomain.com"

# Default approval recipient (used when per-path approvers are not configured)
export WAYMARK_APPROVAL_EMAIL="team-lead@yourdomain.com"
```

See the [Email Notifications setup guide](../feature-03-email-notifications/setup-guide.md) for full SMTP configuration instructions.

---

## Verifying Configuration Is Active

After saving `waymark.config.json` and restarting Waymark:

1. Open the dashboard at `http://localhost:3001`
2. Navigate to **Settings → Policies**
3. Confirm your `requireApproval` paths are listed under "Approval-Required Paths"
4. Confirm your `blockedPaths` and `blockedCommands` are listed under "Block Rules"

If paths are not appearing, restart the Waymark server:

```bash
npx @way_marks/cli stop
npx @way_marks/cli start
```

---

## acme-api Demo Project Setup

The testing guide uses a fictional `acme-api` project. To create it:

```bash
mkdir acme-api && cd acme-api
mkdir -p src/db/migrations src/api deploy/production infrastructure
touch src/db/schema.sql
touch .env.staging
echo '{"version":"2","platforms":["claude"],"policies":{"allowedPaths":["src/api/**","tests/**"],"blockedPaths":[".env.production"],"blockedCommands":["DROP TABLE","DROP DATABASE","rm -rf"],"requireApproval":["src/db/migrations/**","src/db/schema.sql","deploy/**","infrastructure/**",".env.staging"]}}' > waymark.config.json
```

This creates the exact structure used in the testing guide scenarios.

---

*[Testing Guide →](./testing-guide.md)*
