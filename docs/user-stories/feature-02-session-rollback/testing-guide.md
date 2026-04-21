# Feature 02: Session-Level Rollback — Testing Guide

> **[← Overview](./README.md)** | [Setup Guide](./setup-guide.md)

---

## Before You Begin

Complete the [Setup Guide](./setup-guide.md) and confirm:

- [ ] Waymark server is running (`http://localhost:3001` accessible)
- [ ] `acme-api` demo project is created with `src/models/user.js` and `src/api/index.js` present
- [ ] `waymark.config.json` includes `captureBeforeSnapshot: true`
- [ ] Sessions tab in the dashboard is accessible and currently empty (or you can identify new sessions)

Record the current content of the pre-existing files before testing:

```bash
cat acme-api/src/models/user.js     # Should output: // User model
cat acme-api/src/api/index.js       # Should output: // API routes
```

---

## Test Suite 1: Session Grouping — Multiple Writes in One Session

### Test Steps

1. Start Waymark in the `acme-api` directory:
   ```bash
   cd acme-api && npx @way_marks/cli start
   ```

2. Run a multi-file AI agent task. Example prompt to Claude Code:
   ```
   Prompt: "Refactor the acme-api project: add a getById method to the User model,
   add a GET /users/:id route to the API, and create a new src/utils/validators.js
   file with an email validation function."
   ```
   **Expected**: Agent writes to `src/models/user.js`, `src/api/index.js`, and creates `src/utils/validators.js`.

3. After the agent task completes, open the dashboard and navigate to **Sessions**.
   **Expected**: A new session entry appears, showing 3 operations (or more, depending on agent behavior).

4. Click the session to expand it.
   **Expected**: Each file write is listed individually with:
   - File path
   - Operation type (create / modify)
   - A before/after diff for modified files
   - "New file" indicator for created files

5. Click on the diff for `src/models/user.js`.
   **Expected**: The diff shows the original `// User model` content on the left and the agent's changes on the right.

### Verification Checklist
- [ ] All writes from the session are grouped under one session entry
- [ ] Each file shows correct operation type (create vs. modify)
- [ ] Before/after diff is accurate for modified files
- [ ] New file creation is indicated clearly

---

## Test Suite 2: Rolling Back an Entire Session

### Test Steps (continuing from Test Suite 1)

1. Verify the files currently exist with their new content:
   ```bash
   cat acme-api/src/models/user.js    # Should show the agent's new version
   cat acme-api/src/api/index.js      # Should show the agent's new version
   ls acme-api/src/utils/             # Should show validators.js
   ```

2. In the dashboard, locate the session from Test Suite 1. Click **Rollback Session**.
   **Expected**: A confirmation dialog appears listing all files that will be affected.

3. Review the confirmation dialog and click **Confirm Rollback**.
   **Expected**: Rollback executes. Dashboard shows a success message: "Session rolled back — N files restored."

4. Verify all files are restored to their original state:
   ```bash
   cat acme-api/src/models/user.js    # Should output: // User model  (original)
   cat acme-api/src/api/index.js      # Should output: // API routes  (original)
   ls acme-api/src/utils/             # Should output: no such file or directory
   ```
   **Expected**: Modified files are restored to pre-session content. Created files are deleted.

5. Check the dashboard **History** tab.
   **Expected**: A rollback event is logged with:
   - Session reference
   - Number of files restored
   - Initiator identity
   - Timestamp

### Verification Checklist
- [ ] Modified files restored to exact pre-session content
- [ ] Files created by agent are deleted
- [ ] Dashboard shows rollback confirmation
- [ ] Audit log records the rollback event with full context

---

## Test Suite 3: Irreversible Operation Flagging

### Test Steps

1. Prompt Claude Code to perform a task that includes a shell command alongside file writes:
   ```
   Prompt: "Create a script at scripts/cleanup.sh and run it to list the contents of src/"
   ```
   **Expected**: Agent creates `scripts/cleanup.sh` (reversible) and runs `ls src/` (a shell command — may or may not be flagged depending on command pattern).

   > For a more definitive test of irreversible flagging, if your config allows it temporarily, prompt a command that Waymark marks as potentially irreversible (e.g., a curl to an external URL or a database query).

2. In the dashboard, open the session. Look for any operations flagged with a warning icon or "Irreversible" label.
   **Expected**: Shell commands that have external side effects are visually flagged as irreversible.

3. Attempt to roll back the session.
   **Expected**: If irreversible operations exist, a warning is shown: "This session contains N operation(s) that cannot be rolled back. Reversible operations will be undone."

4. Confirm the rollback.
   **Expected**: File writes are rolled back. A note in the audit log identifies the irreversible operations that were not undone.

### Verification Checklist
- [ ] Irreversible operations are visually flagged in session view
- [ ] Rollback warning clearly lists what can and cannot be undone
- [ ] Rollback proceeds for reversible operations only
- [ ] Audit log distinguishes rolled-back vs. not-rolled-back operations

---

## Test Suite 4: Rollback After Session Ends (Asynchronous)

This test confirms rollback works even when initiated after the AI agent has disconnected.

### Test Steps

1. Complete a multi-file AI agent task and wait for the agent session to fully complete/disconnect.

2. Stop and restart the Waymark server:
   ```bash
   npx @way_marks/cli stop
   npx @way_marks/cli start
   ```

3. Open the dashboard and navigate to **Sessions**.
   **Expected**: The previous session is still listed (within retention window).

4. Initiate a rollback on the completed session.
   **Expected**: Rollback succeeds. Files are restored.

### Verification Checklist
- [ ] Session persists across Waymark server restarts (within retention window)
- [ ] Rollback works on sessions that are no longer active

---

## Cleanup

```bash
# Restore any files that were not fully cleaned up
echo "// User model" > acme-api/src/models/user.js
echo "// API routes" > acme-api/src/api/index.js
rm -rf acme-api/src/utils acme-api/scripts

# Stop Waymark
npx @way_marks/cli stop
```

---

*[← Back to Feature Overview](./README.md)*
