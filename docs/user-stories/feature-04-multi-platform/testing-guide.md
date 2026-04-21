# Feature 04: Multi-Platform Support — Testing Guide

> **[← Overview](./README.md)** | [Setup Guide](./setup-guide.md)

---

## Before You Begin

Complete the [Setup Guide](./setup-guide.md) for your platform(s) and confirm:

- [ ] Waymark CLI installed and `npx @way_marks/cli --version` returns `1.0.2` or later
- [ ] Waymark server is running — `http://localhost:3001` accessible
- [ ] MCP is configured for Claude Code (or Claude Desktop)
- [ ] `acme-api` demo project exists with `waymark.config.json`

For cross-platform testing, repeat each test suite on each target platform. The expected outcomes are identical across macOS, Windows, and Linux.

---

## Test Suite 1: Installation and Startup Verification

Run on each platform:

### Test Steps

1. Confirm the Waymark version:
   - **macOS/Linux**: `npx @way_marks/cli --version`
   - **Windows (PowerShell)**: `npx @way_marks/cli --version`
   **Expected**: Output shows `1.0.2` or later on all platforms.

2. Start Waymark in the `acme-api` project:
   ```bash
   cd acme-api
   npx @way_marks/cli start
   ```
   **Expected**: Server starts without errors. Terminal shows "Waymark server running at http://localhost:3001"

3. Open `http://localhost:3001` in a browser.
   **Expected**: Dashboard loads correctly. No certificate warnings (HTTP, not HTTPS, for local use).

4. Navigate to **Settings → Platform**.
   **Expected**: Dashboard correctly identifies the current platform as Windows, macOS, or Linux.

### Verification Checklist
- [ ] `--version` command works on all platforms
- [ ] Server starts cleanly on all platforms
- [ ] Dashboard accessible on all platforms
- [ ] Platform is correctly identified in Settings

---

## Test Suite 2: Policy Enforcement — Cross-Platform Path Normalization

Run on **Windows** (primary test for path handling):

### Test Steps

1. Using Claude Code on Windows, request a file write to an approval-required path:
   ```
   Prompt: "Create a migration at src/db/migrations/0001_test_windows.sql"
   ```
   **Expected**: Write is intercepted regardless of whether Windows path separators are used internally.

2. Check the dashboard pending action.
   **Expected**: File path displayed as `src/db/migrations/0001_test_windows.sql` (forward slashes, normalized).

3. Approve the action from the dashboard.
   **Expected**: File is created at the correct Windows path (`src\db\migrations\0001_test_windows.sql` on disk).

4. Verify the file exists:
   ```powershell
   # PowerShell
   Test-Path "acme-api\src\db\migrations\0001_test_windows.sql"
   ```
   **Expected**: Returns `True`.

### Verification Checklist
- [ ] Path displayed in dashboard uses forward slashes (normalized)
- [ ] File written to correct OS-native path on disk
- [ ] No path-related errors in dashboard or server logs

---

## Test Suite 3: Windows-Specific Blocked Command

Run on **Windows**:

### Test Steps

1. Prompt Claude Code with a Windows-specific destructive command:
   ```
   Prompt: "Remove all compiled files by running Remove-Item -Recurse on the dist folder"
   ```
   **Expected**: Command is blocked by Waymark (matches `Remove-Item -Recurse` in `blockedCommands`).

2. Verify the block:
   - Agent receives a block response
   - Dashboard shows the blocked event under **History → Blocked**
   - No files in `dist/` are deleted (or the command never executes)

3. Check that the block log entry shows the PowerShell syntax as submitted.

### Verification Checklist
- [ ] Windows PowerShell command patterns are matched by blockedCommands
- [ ] Block is logged with full PowerShell command text
- [ ] No files deleted

---

## Test Suite 4: Linux Headless / CI Mode

Run on **Linux** (or in a terminal without display):

### Test Steps

1. Start Waymark in headless mode (no browser opens):
   ```bash
   npx @way_marks/cli start --headless
   ```
   **Expected**: Server starts, dashboard available at `http://localhost:3001`, but no browser window opens automatically. No errors about missing display.

2. Confirm the dashboard is accessible via `curl`:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
   ```
   **Expected**: Returns `200`.

3. Run an AI agent task via Claude Code CLI (if available on the Linux machine) or simulate via MCP.
   **Expected**: Actions are logged and policies enforced exactly as on macOS/Windows.

4. For CI pipeline simulation, confirm Waymark returns a non-zero exit code or structured error when a blocked command is attempted, so the CI pipeline correctly reports the failure.

### Verification Checklist
- [ ] `--headless` flag works on Linux without display
- [ ] Dashboard accessible via HTTP on Linux
- [ ] Policies enforced identically to other platforms
- [ ] CI pipeline can detect blocked actions via exit code

---

## Test Suite 5: Audit Trail — Platform Label Consistency

Run on two or more platforms if available:

### Test Steps

1. On macOS (or Linux), trigger and approve one write action.
2. On Windows, trigger and approve one write action.
3. Open the dashboard **History** tab (accessible from any platform at `http://localhost:3001`).
4. Verify both actions are visible in the same audit log.
5. Confirm each entry shows a platform label (macOS / Windows / Linux) identifying where the action originated.
6. Confirm the audit log format and fields are identical for both entries — no OS-specific fields or missing data.

### Verification Checklist
- [ ] Actions from all platforms appear in a unified audit log
- [ ] Each entry has a platform label
- [ ] Audit log format is consistent across platforms

---

## Test Suite 6: Consistent `waymark.config.json` Behavior

This test confirms that the same config file produces identical policy behavior on all platforms.

### Test Steps

1. Use the same `waymark.config.json` on macOS, Windows, and Linux (copy the file across — do not modify it).

2. On each platform, run the same three actions:
   - Write to `src/api/index.js` (allowed path)
   - Write to `src/db/migrations/0003_cross_platform_test.sql` (requireApproval path)
   - Attempt a command matching `blockedCommands`

3. Verify the outcomes on each platform:
   - Allowed write: executes immediately, no approval needed
   - Migration write: held for approval
   - Blocked command: denied immediately

4. Confirm outcomes are identical across all three platforms.

### Verification Checklist
- [ ] Allowed paths behave identically on all platforms
- [ ] requireApproval paths behave identically on all platforms
- [ ] blockedCommands behave identically on all platforms
- [ ] No platform-specific configuration required to achieve consistent behavior

---

## Cleanup

```bash
# Remove cross-platform test files
rm -f acme-api/src/db/migrations/0001_test_windows.sql
rm -f acme-api/src/db/migrations/0003_cross_platform_test.sql

# Stop Waymark
npx @way_marks/cli stop
```

On Windows:
```powershell
Remove-Item -Path "acme-api\src\db\migrations\0001_test_windows.sql" -ErrorAction SilentlyContinue
Remove-Item -Path "acme-api\src\db\migrations\0003_cross_platform_test.sql" -ErrorAction SilentlyContinue
npx @way_marks/cli stop
```

---

*[← Back to Feature Overview](./README.md)*
