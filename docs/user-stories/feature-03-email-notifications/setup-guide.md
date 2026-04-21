# Feature 03: Email Notifications — Setup Guide

> **[← Overview](./README.md)** | [Testing Guide](./testing-guide.md)

---

## Prerequisites

- [ ] Waymark CLI v1.0.2 or later installed
- [ ] Waymark server running — `http://localhost:3001` accessible
- [ ] SMTP relay credentials available (company mail server, SendGrid, AWS SES, or similar)
- [ ] Recipient email addresses for: approvers, security contact, escalation contact
- [ ] Approval routing policies configured (see [Feature 01 Setup Guide](../feature-01-approval-routing/setup-guide.md))

---

## SMTP Environment Variables

Email notifications are configured entirely via environment variables. Set these before starting the Waymark server:

```bash
# Required: SMTP connection
export WAYMARK_SMTP_HOST="smtp.yourdomain.com"
export WAYMARK_SMTP_PORT="587"                        # 587 (STARTTLS) or 465 (SSL) or 25
export WAYMARK_SMTP_USER="waymark-noreply@yourdomain.com"
export WAYMARK_SMTP_PASS="your-smtp-password-or-api-key"
export WAYMARK_SMTP_FROM="Waymark Alerts <waymark-noreply@yourdomain.com>"

# Required: Default approval recipient (used when per-path routing is not configured)
export WAYMARK_APPROVAL_EMAIL="tech-lead@yourdomain.com"

# Optional: Security alert recipient
export WAYMARK_SECURITY_EMAIL="security@yourdomain.com"

# Optional: Default escalation contact
export WAYMARK_ESCALATION_EMAIL="engineering-manager@yourdomain.com"
```

### Using a `.env` file (recommended for local development)

Create a `.env` file in your project root (add to `.gitignore`):

```dotenv
WAYMARK_SMTP_HOST=smtp.yourdomain.com
WAYMARK_SMTP_PORT=587
WAYMARK_SMTP_USER=waymark-noreply@yourdomain.com
WAYMARK_SMTP_PASS=your-smtp-password-or-api-key
WAYMARK_SMTP_FROM=Waymark Alerts <waymark-noreply@yourdomain.com>
WAYMARK_APPROVAL_EMAIL=tech-lead@yourdomain.com
WAYMARK_SECURITY_EMAIL=security@yourdomain.com
WAYMARK_ESCALATION_EMAIL=engineering-manager@yourdomain.com
```

Then start Waymark with the env file loaded:

```bash
# Using dotenv-cli
npx dotenv -e .env -- npx @way_marks/cli start

# Or export manually before starting
set -a && source .env && set +a && npx @way_marks/cli start
```

> **Security note**: Never commit SMTP credentials to version control. Use environment variables, a secrets manager, or an encrypted `.env` file.

---

## Common SMTP Provider Settings

### SendGrid

```bash
WAYMARK_SMTP_HOST=smtp.sendgrid.net
WAYMARK_SMTP_PORT=587
WAYMARK_SMTP_USER=apikey
WAYMARK_SMTP_PASS=SG.your-sendgrid-api-key
```

### AWS SES (us-east-1)

```bash
WAYMARK_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
WAYMARK_SMTP_PORT=587
WAYMARK_SMTP_USER=your-ses-smtp-username
WAYMARK_SMTP_PASS=your-ses-smtp-password
```

### Microsoft 365 / Exchange Online

```bash
WAYMARK_SMTP_HOST=smtp.office365.com
WAYMARK_SMTP_PORT=587
WAYMARK_SMTP_USER=waymark@yourdomain.com
WAYMARK_SMTP_PASS=your-password
```

### Gmail (for testing only — not recommended for production)

```bash
WAYMARK_SMTP_HOST=smtp.gmail.com
WAYMARK_SMTP_PORT=587
WAYMARK_SMTP_USER=your-gmail@gmail.com
WAYMARK_SMTP_PASS=your-app-password   # Use App Password, not account password
```

---

## waymark.config.json — Full Configuration with Notifications

```json
{
  "version": "2",
  "platforms": ["claude"],
  "notifications": {
    "onPendingApproval": true,
    "onApprovalGranted": true,
    "onActionRejected": true,
    "onEscalation": true,
    "onSecurityBlock": true,
    "onSessionRollback": true
  },
  "policies": {
    "allowedPaths": ["src/api/**", "tests/**", "docs/**"],
    "blockedPaths": [".env.production"],
    "blockedCommands": ["DROP TABLE", "DROP DATABASE", "rm -rf"],
    "requireApproval": [
      "src/db/migrations/**",
      "src/db/schema.sql",
      "deploy/**",
      "infrastructure/**"
    ]
  }
}
```

### Notification Configuration Fields

| Field | Default | Description |
|-------|---------|-------------|
| `onPendingApproval` | `true` | Send email when a new action enters the approval queue |
| `onApprovalGranted` | `true` | Send confirmation email when an approval is granted |
| `onActionRejected` | `true` | Send notification when an action is rejected (to requester) |
| `onEscalation` | `true` | Send escalation email when approval timeout is reached |
| `onSecurityBlock` | `true` | Send security alert when a blocked path or command is attempted |
| `onSessionRollback` | `false` | Send notification when a session is rolled back (disabled by default) |

---

## Verifying SMTP Configuration

After setting environment variables and starting Waymark, test the SMTP connection from the dashboard:

1. Open `http://localhost:3001`
2. Navigate to **Settings → Notifications**
3. Click **Send Test Email**
4. Enter your email address and click **Send**
5. Confirm the test email arrives in your inbox

If the test email does not arrive:
- Check `WAYMARK_SMTP_HOST`, `WAYMARK_SMTP_PORT`, and credentials
- Verify your SMTP relay allows connections from `localhost` (or your server IP)
- Check Waymark server logs: `npx @way_marks/cli logs`
- Check your spam folder

---

*[Testing Guide →](./testing-guide.md)*
