# Frequently Asked Questions

## General

### What is Waymark?

Waymark is an MCP (Model Context Protocol) middleware that intercepts, logs, enforces policies on, and makes reversible every file and shell action taken by an AI agent like Claude Desktop or Claude Code.

Think of it as a "dashboard for AI agent operations" — you can see everything the AI is trying to do, approve actions before they execute, and roll back any mistakes.

### Why do I need Waymark?

- **Visibility**: See exactly what the AI did to your codebase
- **Control**: Approve or reject sensitive operations
- **Rollback**: Undo any file write or command execution
- **Audit**: Full history of all AI agent actions
- **Policy**: Block dangerous operations before they execute

### Is Waymark safe?

Yes. Waymark is:
- **Local-first**: All logs stored in `.waymark/waymark.db` (your machine only)
- **Open-source**: MIT licensed, auditable code
- **Permission-based**: You control what AI can do via `waymark.config.json`
- **Reversible**: All writes can be rolled back from the dashboard

---

## Platform Support

### Which AI platforms does Waymark support?

Currently:
- ✅ **Claude Desktop** (fully supported, MCP native)
- ✅ **Claude Code** (fully supported, MCP native)
- ⚠️ **GitHub Copilot CLI** (experimental, wrapper-based)

Future:
- ⏳ **GitHub Copilot Chat** (waiting for GitHub to add MCP support)
- ⏳ **Amazon CodeWhisperer** (waiting for AWS to add MCP support)
- ⏳ **Codeium** (waiting for Codeium to add MCP support)

### Why doesn't Waymark support GitHub Copilot Chat in VS Code?

GitHub Copilot Chat doesn't use MCP (Model Context Protocol). It uses GitHub's proprietary API. Waymark can't intercept operations without MCP or a public API.

**When will it work?** When GitHub adds MCP support to Copilot. No ETA, but we're ready to integrate immediately once they do.

**Workaround:** Use Claude Code in VS Code instead (same IDE integration, full Waymark support).

### Why doesn't Waymark support CodeWhisperer / Codeium?

Same reason as GitHub Copilot Chat — they don't use MCP protocol. They use platform-specific APIs.

**Workaround**: Use Claude (best Waymark support) or ask these platforms to adopt MCP.

### Can I use multiple platforms?

Yes! During `waymark init`, choose "Both" to set up both Claude and GitHub Copilot CLI.

- Claude: Works in IDE (VSCode, JetBrains, etc.)
- Copilot CLI: Works in terminal

Use whichever feels natural. They log to the same Waymark dashboard.

### How do I switch platforms later?

Edit `waymark.config.json`:

```json
{
  "platforms": ["claude"]  // Remove copilot-cli if needed
}
```

Then restart Waymark:

```bash
npx @way_marks/cli stop
npx @way_marks/cli start
```

---

## Setup & Installation

### How do I install Waymark?

```bash
cd your-project
npx @way_marks/cli init  # Choose platform(s)
npx @way_marks/cli start  # Start Waymark
```

Then restart your AI client (Claude Desktop, Claude Code, etc).

### What does `waymark init` do?

1. Creates `waymark.config.json` (policy rules)
2. Creates `CLAUDE.md` (for Claude IDE integration)
3. Updates `.gitignore` (adds `.waymark/`)
4. Registers MCP in Claude configs
5. Creates `.waymark/` directory (gitignored)

### Where do logs go?

- **Local DB**: `.waymark/waymark.db` (SQLite, gitignored)
- **Dashboard**: `http://localhost:3001` (web UI)
- **Terminal**: `npx @way_marks/cli logs` (CLI view)

All are local only — nothing leaves your machine.

### Can I use Waymark in multiple projects?

Yes! Run `waymark init` in each project. Each project gets its own database and MCP registration, but they all show up in the unified hub dashboard (`waymark list`).

### Can Waymark work with my CI/CD pipeline?

Yes, but:
- MCP is interactive (requires AI agent like Claude)
- CI/CD is usually automated (no interactive approval)
- Workaround: Use Waymark locally for development, skip it in CI (optional)

---

## GitHub Copilot CLI

### How do I set up Copilot CLI with Waymark?

1. Choose "GitHub Copilot CLI" during `waymark init`
2. Run: `npx @way_marks/cli setup-copilot-wrapper`
3. Test: `copilot --version` (should work)

See **COPILOT_CLI.md** for detailed steps.

### What does the wrapper do?

The wrapper script:
1. Intercepts your `copilot` command
2. Logs it to Waymark API
3. Passes through to the original `copilot` binary

You don't notice any difference — transparent drop-in replacement.

### Does the wrapper slow down commands?

No. Logging is non-blocking (1-second timeout). Even if Waymark is down, your `copilot` commands run normally.

### Can I disable the wrapper?

Yes:

```bash
# Remove wrapper
sudo rm /usr/local/bin/copilot

# Restore original
sudo mv /usr/local/bin/copilot-original /usr/local/bin/copilot
```

### Why is Copilot CLI support "experimental"?

Because:
- ⚠️ Wrapper-based (not native MCP support)
- ⚠️ CLI-only (doesn't work in VS Code)
- ⚠️ Less feature-rich than Claude MCP
- ⚠️ Fewer users testing it

But it works well! File bugs if you find issues.

---

## Dashboard & Usage

### How do I access the dashboard?

```bash
npx @way_marks/cli start  # Automatically opens http://localhost:3001
```

Or manually: `http://localhost:3001`

### Why are some actions in blue (plan mode)?

**Plan mode observations** (read-only actions during Claude's thinking process) appear styled differently to show they're observations, not executions.

See Phase 1 implementation for details.

### Can I search the action log?

Yes! The dashboard has:
- Text search (by file path, command, etc.)
- Status filter (pending, blocked, approved, executed)
- Tool filter (write_file, read_file, bash, copilot, etc.)
- Date range filter

### Can I rollback changes?

Yes! Click any "write" action in the dashboard and click "Rollback":
- File writes: Restored to previous version
- File creates: Deleted
- Commands: (Can't rollback executed commands, but logged for audit)

### How long are logs kept?

By default, 30 days in the main database. Older actions are moved to `action_archive` table for long-term storage.

Change this:

```bash
npx @way_marks/cli stop

# Edit packages/server/src/db/database.ts:
# Change archiveOldActions(30) to archiveOldActions(90) etc.

npx @way_marks/cli start
```

---

## Troubleshooting

### Waymark isn't logging my Claude actions

1. **Is Waymark running?**
   ```bash
   npx @way_marks/cli status
   ```
   Should show "running" with a port number.

2. **Did you restart Claude after init?**
   Close and reopen Claude Desktop or VS Code.

3. **Is the dashboard accessible?**
   Open `http://localhost:3001` in browser. If "Cannot reach server", Waymark isn't running.

4. **Check logs:**
   ```bash
   npx @way_marks/cli logs --limit 10
   ```

### GitHub Copilot CLI wrapper isn't working

1. **Is wrapper installed?**
   ```bash
   which copilot
   # Should output: /usr/local/bin/copilot (wrapper script)
   
   file /usr/local/bin/copilot
   # Should show: Bourne-Again shell script
   ```

2. **Is original binary still there?**
   ```bash
   ls -la /usr/local/bin/copilot-original
   # Should exist
   ```

3. **Is Waymark running?**
   ```bash
   curl http://localhost:3001/api/health
   # Should return 200 OK
   ```

See **COPILOT_CLI.md** Troubleshooting section for more.

### Dashboard is slow

If you have 1000+ actions:

1. **Check database size:**
   ```bash
   ls -lh .waymark/waymark.db
   ```

2. **Archive old actions:**
   ```bash
   npx @way_marks/cli stop
   # Edit config to change archive threshold
   # Or manually call: curl -X POST http://localhost:3001/api/maintenance/archive
   ```

3. **Restart:**
   ```bash
   npx @way_marks/cli start
   ```

Dashboard now queries paginated data (Phase 3 optimization). Should be fast even with 10,000+ actions.

### Port 3001 is already in use

Waymark will automatically try the next available port (3002, 3003, etc). Check the terminal output:

```
Dashboard: http://localhost:3002
```

Or manually specify:

```bash
WAYMARK_PORT=3005 npx @way_marks/cli start
```

### I see "Action blocked by policy"

This is working as intended! Waymark blocked an operation. To fix:

1. Check **Blocked** tab in dashboard to see reason
2. Update `waymark.config.json` to allow the action
3. Retry in Claude

See **README.md** policy documentation.

---

## Technical Questions

### What's MCP (Model Context Protocol)?

**MCP** is a standard protocol for AI agents to interact with tools and data.

- Created by Anthropic
- Used by Claude Desktop, Claude Code
- Standardized, extensible
- Similar to LSP (Language Server Protocol) for editors

Waymark is an MCP server that sits between Claude and your filesystem.

### Can I extend Waymark?

Yes! Waymark is open-source MIT licensed. Common extensions:

- Custom policy rules (more patterns in `waymark.config.json`)
- Custom notifications (Slack webhook already supported)
- Custom approvers (Slack buttons, email, etc.)
- Database integrations (send logs to external system)

See `CONTRIBUTING.md` for development guide.

### Where is data stored?

- `.waymark/waymark.db` — SQLite database (local, gitignored)
- `.waymark/waymark.pid` — Process IDs (local, gitignored)
- `~/.waymark/registry.json` — Global project registry (shared across all projects)

Everything local. Nothing sent anywhere.

### Can I backup/restore logs?

Yes!

```bash
# Backup
cp .waymark/waymark.db .waymark/waymark.db.backup

# Restore
cp .waymark/waymark.db.backup .waymark/waymark.db
```

Database is SQLite, fully portable.

### Can I run Waymark without an IDE?

Yes! You can:
- Use `waymark logs` in terminal (CLI dashboard)
- Use `http://localhost:3001` in browser
- Integrate with CI/CD (though less useful without interactive approval)

---

## Contributing & Feedback

### How do I report a bug?

1. Open issue on GitHub with:
   - Your OS (macOS, Linux, Windows)
   - Waymark version: `npx @way_marks/cli --version`
   - Steps to reproduce
   - Error message (if any)

2. Check existing issues first (might be known)

### How do I request a feature?

1. Check existing issues/discussions
2. Open feature request with:
   - What you want to do
   - Why you need it
   - Example usage

3. Vote on existing requests with 👍

### Can I contribute code?

Yes! See **CONTRIBUTING.md** for:
- Development setup
- Code style
- Testing requirements
- PR process

---

## Performance & Limits

### How many actions can Waymark handle?

Practically unlimited (tested to 100k+ actions):
- **Recent data (< 30 days)**: Fast queries with indexes
- **Old data (> 30 days)**: Archived table, still queryable
- **Dashboard**: Paginated to 50/page, stays fast

### Does Waymark use much disk space?

Minimal:
- `.waymark/waymark.db` typically 1-10MB (depending on action volume)
- `.waymark/` directory: < 50MB including cache

### Can I run multiple Waymark instances?

Not recommended. Waymark expects one instance per project. If needed:

```bash
# Project A
WAYMARK_PORT=3001 npx @way_marks/cli start

# Project B
WAYMARK_PORT=3002 npx @way_marks/cli start
```

They'll have separate dashboards and databases.

---

## Security

### Is Waymark secure?

Yes, but consider:
- ✅ **Logs never leave your machine** (fully local)
- ✅ **No network calls** (except Slack webhook if configured)
- ✅ **SQLite has no default auth** (use OS file permissions)
- ✅ **All source code auditable** (MIT open-source)

⚠️ **Caveats**:
- Logs include file contents (keep `.waymark/` secure)
- Approval flow is manual (you must approve sensitive actions)
- Policies are optional (can be bypassed if configured incorrectly)

### Should I commit `.waymark/` to git?

No! It's already gitignored:
- Contains local database
- Contains sensitive file snapshots
- Project-specific, not shareable

### Can I use Waymark with private/confidential code?

Yes, but be careful:
- Action logs include file contents (read operations logged)
- Keep `.waymark/` directory private
- Consider excluding it from backups (if you have a secure backup solution)

---

## Advanced

### Can I use custom policy rules?

Yes! Edit `waymark.config.json`:

```json
{
  "policies": {
    "allowedPaths": ["./src/**", "./data/**"],
    "blockedPaths": ["./.env", ".git/**"],
    "blockedCommands": ["rm -rf", "DROP TABLE"],
    "requireApproval": ["./src/db/**"]
  }
}
```

See **README.md** policy documentation for full syntax.

### Can I integrate Waymark with Slack?

Yes! Set webhook in environment:

```bash
WAYMARK_SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
npx @way_marks/cli start
```

Pending actions will post to Slack with approve/reject buttons.

### Can I use Waymark in GitHub Actions / CI?

Technically yes, but:
- ⚠️ MCP is interactive (needs AI agent running)
- ⚠️ CI is usually non-interactive
- ⚠️ Approval flow doesn't make sense in CI

Better alternatives for CI:
- Linters, type checkers, tests
- Pre-commit hooks
- Code review process

---

## More Help

### Where's the documentation?

- `README.md` — Overview & architecture
- `README_PLATFORMS.md` — Platform support matrix
- `CLAUDE.md` — Claude IDE instructions
- `COPILOT_CLI.md` — GitHub Copilot CLI setup
- `CONTRIBUTING.md` — Development guide

### How do I get in touch?

- **GitHub Issues** — Bug reports, feature requests
- **GitHub Discussions** — General questions, feedback
- **Email** — shaiful@waymark.sh (maintainer)

### Is there a community?

Not yet! If you're using Waymark, consider:
- ⭐ Starring the repo (shows interest)
- 💬 Joining discussions (share feedback)
- 🐛 Filing issues (help improve)

---

Last updated: 2026-04-16  
For the latest info, see: https://github.com/shaifulshabuj/waymark
