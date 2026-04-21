# Feature 03: Email Notifications — Testing Guide

> **[← Overview](./README.md)** | [Setup Guide](./setup-guide.md)

---

## Before You Begin

Complete the [Setup Guide](./setup-guide.md) and confirm:

- [ ] SMTP environment variables are set and Waymark server has been restarted
- [ ] Test email (via **Settings → Notifications → Send Test Email**) arrived successfully
- [ ] Approval routing policies are configured for `src/db/migrations/**` and `deploy/**`
- [ ] You have access to the inbox of `WAYMARK_APPROVAL_EMAIL` recipient during testing
- [ ] The `acme-api` demo project directory exists and Waymark is running in it

> **Tip for local testing**: Use a service like [Mailhog](https://github.com/mailhog/MailHog) (free, local SMTP server with web UI) or [Mailtrap](https://mailtrap.io) (free tier) to capture test emails without sending to real inboxes.

---

## Test Suite 1: Approval Request Email Delivered

### Test Steps

1. Start Waymark in `acme-api`:
   ```bash
   cd acme-api && npx @way_marks/cli start
   ```

2. Using Claude Code, trigger an action requiring approval:
   ```
   Prompt: "Create a migration to add a created_at column to the accounts table"
   ```
   **Expected**: Agent attempts to write `src/db/migrations/0002_add_accounts_created_at.sql`

3. Wait up to 60 seconds. Check the inbox of `WAYMARK_APPROVAL_EMAIL`.
   **Expected**: Email arrives with subject: `[Waymark] Approval Required: src/db/migrations/0002_add_accounts_created_at.sql`

4. Open the email and verify the content includes:
   - File path
   - Proposed file content (preview or full, depending on file size)
   - Requesting agent name / session ID
   - Request timestamp
   - **Approve** button/link
   - **Reject** button/link
   - Link to the Waymark dashboard

5. Click the **Approve** link in the email.
   **Expected**: Browser opens the Waymark dashboard and shows the approval confirmation. Action is marked as "Approved" in the Pending Actions queue.

6. Verify the file was written to disk:
   ```bash
   ls acme-api/src/db/migrations/
   ```
   **Expected**: Migration file exists.

7. Check the Waymark dashboard **History** tab.
   **Expected**: Entry shows: email sent timestamp, link-click timestamp, approval recorded.

### Verification Checklist
- [ ] Email arrived within 60 seconds
- [ ] Email subject identifies the correct file path
- [ ] Email body contains proposed content preview
- [ ] Approve link worked and triggered action execution
- [ ] Audit log records email delivery and link activation

---

## Test Suite 2: Rejection via Email

### Test Steps

1. Trigger another approval-required action:
   ```
   Prompt: "Update the deploy script at deploy/production/deploy.sh to add a health check"
   ```
   **Expected**: Agent attempts to write `deploy/production/deploy.sh`

2. Wait for the approval email to arrive.

3. Click the **Reject** link in the email.
   **Expected**: Browser opens a rejection form in the Waymark dashboard (or inline rejection if supported).

4. Enter a rejection reason: `"Production deploy scripts require a PR review — do not modify via AI agent directly"`.
   **Expected**: Rejection is recorded. Action is blocked.

5. Check that the file was **not** written:
   ```bash
   cat acme-api/deploy/production/deploy.sh
   ```
   **Expected**: File content is unchanged (empty from setup).

6. Check the audit log.
   **Expected**: Rejection reason, rejector, and timestamp are recorded.

### Verification Checklist
- [ ] Rejection email link opened dashboard
- [ ] Rejection reason was captured and stored
- [ ] File was not modified after rejection
- [ ] Audit log shows rejection with full context

---

## Test Suite 3: Security Block Alert Email

### Test Steps

1. Prompt Claude Code with a command that matches `blockedCommands`:
   ```
   Prompt: "Clean up test data by running DROP TABLE test_sessions in the database"
   ```
   **Expected**: Command is blocked immediately.

2. Wait up to 60 seconds. Check the inbox of `WAYMARK_SECURITY_EMAIL`.
   **Expected**: Security alert email arrives with subject: `[Waymark Security Alert] Blocked command attempt`

3. Verify the email body includes:
   - Full command text that was blocked
   - Agent session ID
   - Timestamp
   - Policy rule matched (e.g., "Matched blockedCommands: DROP TABLE")
   - Link to the session in the Waymark dashboard

### Verification Checklist
- [ ] Security alert email arrived
- [ ] Email contains full command text
- [ ] Policy rule matched is identified
- [ ] Dashboard link works and shows the blocked event

---

## Test Suite 4: Confirmation Email After Approval

### Test Steps

1. Trigger a new approval-required action (any path in `requireApproval`).

2. Approve the action from the Waymark dashboard (not via email this time).

3. Check the inbox configured as the agent/session owner notification recipient.
   **Expected**: A confirmation email arrives: `[Waymark] Approved: {path}`

4. Verify the email contains:
   - The approved file path
   - Approver name/identity
   - Timestamp of approval
   - Link to the audit entry

### Verification Checklist
- [ ] Confirmation email arrived after dashboard approval
- [ ] Approver identity is shown in the email

---

## Test Suite 5: Notification Log in Dashboard

### Test Steps

1. After running Test Suites 1–4, navigate to **Settings → Notifications → Delivery Log** (or the equivalent in the dashboard).

2. Verify each email sent during testing appears in the log with:
   - Recipient address
   - Event type (pending approval, security block, rejection confirmation, etc.)
   - Timestamp sent
   - Status (sent / failed)

### Verification Checklist
- [ ] All emails sent during testing appear in the delivery log
- [ ] Each log entry has complete metadata (recipient, event, timestamp)
- [ ] No missing entries for events that should have triggered notifications

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|-------------|------------|
| Email not received | SMTP credentials incorrect | Re-check env vars; send test email from Settings |
| Email goes to spam | From address not verified | Set up SPF/DKIM for the sending domain |
| Approve link doesn't work | Link expired or already used | One-time tokens expire — approve from dashboard instead |
| Email received but no content | Template rendering issue | Check Waymark server logs: `npx @way_marks/cli logs` |
| Duplicate emails | Multiple Waymark instances running | Ensure only one `npx @way_marks/cli start` process is active |

---

## Cleanup

```bash
# Remove demo migration files created during testing
rm -f acme-api/src/db/migrations/0002_add_accounts_created_at.sql

# Stop Waymark
npx @way_marks/cli stop
```

---

*[← Back to Feature Overview](./README.md)*
