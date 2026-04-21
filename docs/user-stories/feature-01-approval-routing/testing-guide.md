# Feature 01: Team Approval Routing — Testing Guide

> **[← Overview](./README.md)** | [Setup Guide](./setup-guide.md)

---

## Before You Begin

Complete the [Setup Guide](./setup-guide.md) and confirm:

- [ ] Waymark server is running (`http://localhost:3001` is accessible)
- [ ] `acme-api/waymark.config.json` is saved with approval routing policies
- [ ] Dashboard shows policies loaded under **Settings → Policies**
- [ ] (Optional) SMTP environment variables are set for email notification testing

---

## Test Suite 1: File Write Held for Approval

### Setup
Start Waymark in the `acme-api` directory:

```bash
cd acme-api
npx @way_marks/cli start
```

Open the dashboard at `http://localhost:3001` — confirm the **Pending Actions** queue is empty.

### Test Steps

1. Using Claude Code (or any connected AI agent), attempt to create a new migration file:
   ```
   Prompt: "Create a migration file to add an index on the users table email column"
   ```
   **Expected**: Agent attempts to write `src/db/migrations/0001_add_user_email_index.sql`

2. Observe the agent response.
   **Expected**: Agent receives a "pending approval" response and pauses — it does not retry or write to disk.

3. Check the dashboard at `http://localhost:3001`.
   **Expected**: A new entry appears in **Pending Actions** with:
   - File path: `src/db/migrations/0001_add_user_email_index.sql`
   - Content preview: the proposed SQL migration
   - Requesting agent: Claude Code (session ID visible)
   - Timestamp of request

4. Verify the file does **not** exist on disk yet:
   ```bash
   ls acme-api/src/db/migrations/
   ```
   **Expected**: Directory is empty.

5. In the dashboard, click the pending action to expand it. Review the proposed file content.
   **Expected**: Full file content is displayed exactly as the agent proposed.

6. Click **Approve** and enter a reason: `"Reviewed — index is safe for this table size"`.
   **Expected**: Action executes. Success confirmation appears in dashboard.

7. Verify the file now exists on disk:
   ```bash
   ls acme-api/src/db/migrations/
   cat acme-api/src/db/migrations/0001_add_user_email_index.sql
   ```
   **Expected**: File exists with the exact content the agent proposed.

8. Check the audit log in the dashboard under **History**.
   **Expected**: Entry shows: file path, action type (write), approver identity, approval timestamp, reason, and agent session ID.

### Verification Checklist
- [ ] File was not written to disk before approval
- [ ] Dashboard showed correct file path and content preview
- [ ] Approval reason is captured in audit log
- [ ] File content on disk matches exactly what was previewed

---

## Test Suite 2: Action Rejected — Write Permanently Blocked

### Test Steps

1. Prompt Claude Code to modify the staging environment file:
   ```
   Prompt: "Update the DATABASE_URL in .env.staging to point to the new replica"
   ```
   **Expected**: Agent attempts to write `.env.staging`

2. Observe the dashboard — a new pending action appears for `.env.staging`.

3. In the dashboard, click **Reject** and enter a reason: `"Do not modify staging env — use the secrets manager instead"`.
   **Expected**: Action is rejected. Dashboard shows "Rejected" status.

4. Observe the agent response.
   **Expected**: Agent receives a rejection response with the reason. It does not retry.

5. Verify `.env.staging` was not modified:
   ```bash
   cat acme-api/.env.staging
   ```
   **Expected**: File is unchanged (empty from setup).

6. Check audit log under **History**.
   **Expected**: Entry shows rejection reason, rejector identity, and timestamp.

### Verification Checklist
- [ ] File was not modified after rejection
- [ ] Agent received the rejection reason
- [ ] Audit log shows rejection with full context

---

## Test Suite 3: Shell Command Blocked (No Approval Path)

### Test Steps

1. Prompt Claude Code to perform a destructive cleanup:
   ```
   Prompt: "Drop the old sessions table — it's no longer needed"
   ```
   **Expected**: Agent attempts to execute a command containing `DROP TABLE`

2. Observe the agent response immediately.
   **Expected**: Command is blocked instantly — no approval queue entry is created. Agent receives: `"Action blocked by policy: matches blockedCommands pattern"`

3. Check the dashboard under **Security Events** (or **History → Blocked**).
   **Expected**: Blocked incident is logged with full command text, timestamp, and session ID.

4. Verify no database change occurred (the command never executed).

### Verification Checklist
- [ ] Blocked commands do not appear in Pending Actions queue
- [ ] Block is recorded in Security Events / audit log
- [ ] Agent received a clear block reason

---

## Test Suite 4: Allowed Path — No Interruption

This test confirms that non-sensitive paths are not affected by approval routing.

### Test Steps

1. Prompt Claude Code to modify an API handler:
   ```
   Prompt: "Add input validation to the /users POST endpoint in src/api/users.js"
   ```
   **Expected**: Agent writes to `src/api/users.js` directly — no approval gate triggered.

2. Verify the file is written immediately to disk.

3. Confirm no entry appears in the Pending Actions queue.

### Verification Checklist
- [ ] Write executed without interruption
- [ ] No pending action created for allowed paths
- [ ] Dashboard shows action in History with "Allowed" status

---

## Test Suite 5: Audit Trail Review

### Test Steps

1. After completing Test Suites 1–4, navigate to **History** in the dashboard.

2. Confirm the log shows all four action types:
   - Approved write (migration file)
   - Rejected write (.env.staging)
   - Blocked command (DROP TABLE)
   - Allowed write (src/api)

3. Export the audit log (if export is available in v1.0.2) and verify it includes: action type, file path or command, agent session ID, timestamp, policy matched, and reviewer identity where applicable.

### Verification Checklist
- [ ] All four action types present in History
- [ ] Each entry has complete context (no missing fields)
- [ ] Approver/rejector identity recorded on human-reviewed actions

---

## Cleanup

```bash
# Stop Waymark server
npx @way_marks/cli stop

# Remove demo files created during testing
rm -f acme-api/src/db/migrations/0001_add_user_email_index.sql
```

---

*[← Back to Feature Overview](./README.md)*
