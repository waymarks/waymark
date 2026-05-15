# Waymark Features Reference

A complete guide to every Waymark feature, from basic setup to enterprise capabilities. Organized by complexity level (0–7), with explanations of what each feature does and how to use it.

---

## Quick Navigation

| Level | Features | Purpose |
|-------|----------|---------|
| **0** | F-01 to F-04 | Getting Waymark up and running |
| **1** | F-05 to F-08 | Core policy enforcement & logging |
| **2** | F-09 to F-11B | Human control: approvals, rollback & notifications |
| **3** | F-12 to F-16 | Multi-project & platform support |
| **4** | F-17 to F-21 | Team workflows & session management |
| **5** | F-22 to F-25 | Risk assessment & remediation |
| **6** | F-26 to F-28 | ML predictions & analytics |
| **7** | F-29 to F-32 | Enterprise persistence & streaming |
| **8** | F-33 to F-46 | Advanced policy, CLI & dashboard (v4.7.0) |
| **9** | F-47 to F-53 | Agent monitoring & observability |

---

## Level 0: Getting Started

Everything needed to install and launch Waymark in a project.

## F-01: Installation

**What it is:**  
One-command project initialization that sets up Waymark from scratch.

**What it means:**  
Waymark is designed to be installed in seconds, not hours. A single command creates all necessary configuration files, registers your MCP server, generates a system prompt, and sets up the action ledger database.

**How to use it:**  
```bash
cd /path/to/your/project
npx @way_marks/cli init
```

This will:
1. Ask which AI platforms you use (Claude Desktop, Claude Code, GitHub Copilot CLI)
2. Create `waymark.config.json` with default policies
3. Generate `CLAUDE.md` with system prompt instructions
4. Register the MCP server in your Claude configuration
5. Create `.waymark/` directory (added to `.gitignore`)
6. Initialize the SQLite action ledger at `.waymark/waymark.db`

---

## F-02: Configuration File (`waymark.config.json`)

**What it is:**  
A JSON file that defines all policies: which paths/commands are allowed, blocked, or require approval.

**What it means:**  
This is the "policy engine config" — it controls every MCP tool call. Update this file to enforce new rules without restarting anything.

**How to use it:**  
Create or edit `waymark.config.json` in your project root:

```json
{
  "version": "2",
  "platforms": ["claude", "copilot-cli"],
  "policies": {
    "allowedPaths": [
      "./src/**",
      "./data/**",
      "./README.md"
    ],
    "blockedPaths": [
      "./.env",
      "./.env.*",
      "/etc/**"
    ],
    "blockedCommands": [
      "rm -rf",
      "DROP TABLE",
      "regex:\\|\\s*bash",
      "git push"
    ],
    "requireApproval": [
      "./src/db/**",
      "./waymark.config.json"
    ],
    "maxBashOutputBytes": 10000
  }
}
```

**Key fields:**
- `version` — schema version (`"1"` or `"2"`)
- `platforms` — array of `"claude"` and/or `"copilot-cli"`
- `allowedPaths` — glob patterns; relative paths resolve from project root
- `blockedPaths` — paths are hard-blocked (blocks both read and write)
- `blockedCommands` — substring matches or `regex:<pattern>` patterns for bash
- `requireApproval` — paths that require explicit human approval before writes execute
- `maxBashOutputBytes` — stdout/stderr truncation limit (default 10,000)

---

## F-03: MCP Tools

**What it is:**  
Three command-line tools that Claude can call to interact with your code. All three pass through Waymark policy checks before executing.

**What it means:**  
Instead of Claude directly accessing your filesystem or shell, all operations are logged, can be blocked, and can be rolled back. This is the core interception point.

**How to use it:**  
You don't call these directly — Claude calls them. When Claude wants to:
- **Write a file** → `write_file(path, content)`
- **Read a file** → `read_file(path)`
- **Run a command** → `bash(command)`

Waymark intercepts all three, applies policy, logs the action, and either executes or queues for approval.

In your `CLAUDE.md`, Waymark maps all built-in tools to these three:
```
(Built-in) write_file → (Waymark) mcp__waymark-<project>__write_file
(Built-in) read_file  → (Waymark) mcp__waymark-<project>__read_file
(Built-in) bash       → (Waymark) mcp__waymark-<project>__bash
```

---

## F-04: Server Lifecycle

**What it is:**  
Commands to start, stop, and check the status of the Waymark server.

**What it means:**  
Waymark runs as a background service, independent of Claude. You control it separately.

**How to use it:**

**Start the server** (creates port reservation, opens dashboard in browser):
```bash
waymark start
```
Output:
```
✓ Waymark server started on port 3001
✓ Dashboard: http://localhost:3001
✓ MCP key: waymark-my-project
```

**Check status** (shows port, pending actions, server health):
```bash
waymark status
```
Output:
```
Project: my-project
Port: 3001
Dashboard: http://localhost:3001
Server: running ✓
Pending actions: 2
```

**Stop the server** (clean shutdown, releases port):
```bash
waymark stop
```

---

## Level 1: Core Safety

What happens on every AI action — policy evaluation, logging, and audit trails.

## F-05: Policy Engine

**What it is:**  
The decision-making system that evaluates every MCP tool call against your policies.

**What it means:**  
Each time Claude calls `write_file`, `read_file`, or `bash`, Waymark checks:
1. Is the path/command blocked?
2. Does it require approval?
3. Is it allowed?
4. (Default: block if uncertain)

The result is one of four decisions: `allow` → execute immediately, `block` → log + reject, `pending` → queue for approval, or error.

**How to use it:**  
Edit `waymark.config.json` to change policies. Changes apply immediately (no restart needed):

```json
{
  "policies": {
    "allowedPaths": ["./src/**"],        // ✓ Claude can write here
    "blockedPaths": ["./.env"],          // ✗ Claude cannot touch this
    "requireApproval": ["./src/db/**"],  // ⏳ Requires human approval
    "blockedCommands": [
      "rm -rf",                          // ✗ Exact substring match
      "regex:DROP\\s+TABLE"              // ✗ Regex pattern match
    ]
  }
}
```

---

## F-06: Action Ledger

**What it is:**  
A SQLite database at `.waymark/waymark.db` that records every AI action with full context.

**What it means:**  
You have a complete, searchable audit trail. Every action is recorded with:
- Who took it (Claude / Copilot)
- When it happened
- What files/commands were affected
- Before/after state (for rollback)
- Whether it was approved, blocked, or executed

**How to use it:**  
The ledger is automatically populated. You access it through:
1. **Dashboard** (F-07) — browse actions graphically
2. **CLI** (F-08) — terminal viewer with filters
3. **REST API** — `GET /api/actions` for programmatic access

Key tables:
- `action_log` — all MCP calls with full context
- `sessions` — groups related actions
- `team_members` — team roster
- `approval_requests` — pending approvals
- `escalation_requests` — escalated decisions

---

## F-07: Dashboard UI

**What it is:**  
A real-time web interface for browsing actions, managing approvals, and configuring teams.

**What it means:**  
Instead of terminal commands, you have a graphical dashboard. Open it immediately after `waymark start`:
```bash
http://localhost:3001
```

**How to use it:**  
The dashboard has tabs:

**Actions Tab** (main)
- Full ledger of every MCP call (time, tool, decision, status)
- Filter by status (pending/approved/blocked), tool (write_file/bash), search by path
- See stdout/stderr for bash commands
- Click "Approve" or "Reject" on pending actions
- Click "Rollback" to undo a write_file

**Sessions Tab**
- Groups of related actions (one session per Claude run)
- Click "View" to expand and see all actions in a session
- Click "Rollback Session" to atomically undo the entire session

**Team Tab**
- Add/remove team members
- Fields: name, email, role, Slack ID

**Approvals Tab**
- Define routing rules (which team members approve which actions)
- See pending approvals and submit decisions

**Escalations Tab**
- Auto-escalate stale approvals after N hours
- Targets (usually managers) review escalated decisions

**Remediation Tab**
- Risk score and assessment
- Recommended remediation strategies
- Policy compliance check
- View and manage auto-blocks

---

## F-08: Terminal Action Viewer

**What it is:**  
Command-line tool to browse the action ledger without opening the dashboard.

**What it means:**  
Quick, terminal-native access to action history. Useful in headless environments or for quick audits.

**How to use it:**  
```bash
waymark logs
```
Output:
```
Time             Tool         Target                  Decision   Status
─────────────────────────────────────────────────────────────────────
2026-04-19 14:23 write_file   ./src/app.ts           allow      executed
2026-04-19 14:22 bash         npm install            block      blocked
2026-04-19 14:21 write_file   ./config.json          pending    approved
```

**Filters:**
```bash
waymark logs --pending              # Only pending approvals
waymark logs --blocked              # Only blocked actions
waymark logs --limit 50             # Show last 50 (default 20)
```

---

## Level 2: Human Control

Approve/reject actions and undo mistakes.

## F-09: Single-Action Approval

**What it is:**  
When Claude tries to write a file in a path marked `requireApproval`, the write is queued instead of executing immediately. A human must explicitly approve or reject.

**What it means:**  
You can designate sensitive paths (like database migrations, config files, or CI/CD scripts) that require a human in the loop. Claude will wait for your decision before proceeding.

**How to use it:**  
Mark paths in `waymark.config.json`:

```json
{
  "policies": {
    "requireApproval": [
      "./src/db/migrations/**",    // Database changes need approval
      "./package.json",            // Dependency updates need approval
      "waymark.config.json"        // Policy changes need approval
    ]
  }
}
```

When Claude tries to `write_file` to one of these paths:
1. Waymark logs the action with status `pending`
2. A Slack notification is sent (if configured)
3. The dashboard shows an "Approve" / "Reject" button
4. Claude is told the action is pending and waits

To approve/reject:
- **Dashboard**: Click the button on the action row
- **Slack**: Click "Approve" or "Reject" button in the notification
- **API**: `POST /api/actions/<action_id>/approve` or `/reject`

---

## F-10: Single-Action Rollback

**What it is:**  
Undo any file write that Claude has already made. Restores the file to its state before the write.

**What it means:**  
Even if an action was approved and executed, you can still undo it with one click. Waymark stores a `before_snapshot` of every write, so rolling back is instant and atomic.

**How to use it:**  
In the **Actions** tab of the dashboard:
1. Find the `write_file` action you want to undo
2. Click the "Rollback" button on that row
3. Waymark restores the file and marks the action as rolled back

Via API:
```bash
curl -X POST http://localhost:3001/api/actions/<action_id>/rollback
```

**What happens:**
- If the file was newly created → the file is deleted
- If the file was modified → the file is restored to its `before_snapshot`
- The action ledger marks the action as `rolled_back`
- A new log entry records the rollback

---

## F-11: Slack Notifications

**What it is:**  
When an action is pending approval, Waymark sends a Slack message with "Approve" / "Reject" buttons.

**What it means:**  
You don't have to check the dashboard constantly. Slack notifies you immediately, and you can approve/reject right from Slack.

**How to use it:**  
1. Create a Slack App and get a webhook URL: [https://api.slack.com/apps](https://api.slack.com/apps)
2. Set the environment variable:
   ```bash
   export WAYMARK_SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
   ```
3. Restart Waymark

When an action is pending, Slack receives:
```
🚀 Waymark — Approval Required

Tool: write_file
Target: ./package.json
Rule: requireApproval

[Approve] [Reject]
```

Click the button to approve/reject without leaving Slack.

---

## F-11B: Email Notifications

**What it is:**  
Waymark can send email notifications for pending approvals and escalations via SMTP.

**What it means:**  
Beyond Slack, you can receive approval notifications via email using your corporate email system or external mail service (SendGrid, AWS SES, Gmail, etc.).

**How to use it:**  
Configure SMTP in environment variables:
```bash
export WAYMARK_EMAIL_SMTP_HOST="smtp.gmail.com"
export WAYMARK_EMAIL_SMTP_PORT="587"
export WAYMARK_EMAIL_SMTP_USER="your-email@example.com"
export WAYMARK_EMAIL_SMTP_PASS="your-app-password"
export WAYMARK_EMAIL_FROM="waymark@example.com"
```

When an action requires approval, Waymark emails the required approvers with:
- Action details (tool, target, rule)
- Dashboard link to approve/reject
- Approval deadline (if escalation configured)

Both Slack and email can be active simultaneously. They use the same approval flow — approve/reject via either channel.

---

## Level 3: Multi-project & Platform Support

Run Waymark across multiple projects and different AI tools.

## F-12: CLAUDE.md System Prompt

**What it is:**  
A file created during `waymark init` that contains mandatory instructions for Claude about how to use Waymark MCP tools.

**What it means:**  
Claude (via Claude Desktop or Claude Code) gets instructions telling it: "Don't use your built-in file/shell tools. Use Waymark instead." This ensures all operations go through Waymark.

**How to use it:**  
During `waymark init`, Waymark auto-creates (or appends to) `CLAUDE.md`:

```markdown
<!-- waymark -->

## Waymark MCP Integration

Use these Waymark MCP tools for all file and shell operations:

| Operation | Built-in | Waymark MCP |
|-----------|----------|------------|
| Write file | `write_file` | `mcp__waymark-my-project__write_file` |
| Read file | `read_file` | `mcp__waymark-my-project__read_file` |
| Run bash | `bash` | `mcp__waymark-my-project__bash` |

**Important**: Always use the Waymark versions. Do not fall back to built-in tools.

Dashboard: http://localhost:3001
View pending actions and approve/reject.
```

Claude reads `CLAUDE.md` automatically and follows these instructions.

---

## F-13: Multi-project Support

**What it is:**  
Run Waymark in multiple projects simultaneously, each with its own isolated database, configuration, and port.

**What it means:**  
You can work on 5 different projects, and each gets:
- Its own `.waymark/waymark.db` (no data leakage)
- Its own port (3001–3010, auto-selected)
- Its own dashboard
- Its own MCP server registration

No conflicts, no manual port assignment.

**How to use it:**  
Just run `waymark init` in each project:

```bash
cd project-1
waymark init

cd ../project-2
waymark init
```

Each project independently can:
```bash
waymark start      # Starts on available port (e.g., 3001)
waymark stop
waymark status
```

---

## F-14: Project Registry

**What it is:**  
A global registry at `~/.waymark/registry.json` that tracks all your Waymark projects.

**What it means:**  
Instead of memorizing port numbers or dashboard URLs, you can list, open, pause, and resume projects by name.

**How to use it:**  
```bash
# List all projects
waymark list
```
Output:
```
Running:
  ✓ project-1    (port 3001, uptime 2h 15m)
  ✓ project-2    (port 3002, uptime 45m)

Paused:
  ⏸ project-3    (port 3003, no activity)

Stopped:
  ○ project-4
```

```bash
# Open a project's dashboard in your browser
waymark open project-1
# Opens http://localhost:3001

# Pause a project (reserves port, stops server)
waymark pause project-3

# Resume a project
waymark resume project-3
```

---

## F-15: GitHub Copilot CLI Support (Experimental)

**What it is:**  
Shell wrapper that logs GitHub Copilot CLI commands to Waymark's action ledger.

**What it means:**  
GitHub Copilot CLI doesn't support MCP (Model Context Protocol) yet, so Waymark can't intercept it directly. Instead, a shell wrapper logs Copilot commands for audit purposes (no approval flow, no rollback).

**How to use it:**  
1. During `waymark init`, choose "copilot-cli" platform
2. Follow setup in `docs/COPILOT_CLI.md` to install the wrapper
3. The wrapper logs every Copilot command to `.waymark/waymark.db`

What gets logged:
- Command text
- Timestamp
- Stdout/stderr

What doesn't:
- Approval flow (no interception)
- Rollback (no file snapshots)
- Policy blocking (no before execution check)

This is audit-only; use full Waymark features with Claude.

---

## F-16: Platform Comparison & Roadmap

**What it is:**  
Documentation comparing Waymark support across Claude Desktop, Claude Code, GitHub Copilot CLI, and future platforms.

**What it means:**  
Know which platforms are ready, which are experimental, and which are coming soon.

**How to use it:**  
See `docs/README_PLATFORMS.md` for:
- Feature matrix (MCP support, approval flow, rollback, logging)
- Status (ready, experimental, planned)
- Setup guide for each platform
- Roadmap for future platforms (GitHub Copilot VSCode, CodeWhisperer, Codeium)

---

## Level 4: Sessions & Team Workflows

Group actions and route approvals to teammates.

## F-17: Sessions

**What it is:**  
A logical grouping of all actions from a single Claude run. Every action belongs to exactly one session.

**What it means:**  
Instead of managing 50 individual actions, you can think in terms of "sessions" — each session is one discrete problem Claude solved.

**How to use it:**  
Sessions are automatic. When Claude connects to Waymark:
1. Waymark generates a session ID (UUID)
2. Every action Claude takes gets this session_id
3. Session is recorded in the `sessions` table with creation time, action count, status

View sessions:
- **Dashboard**: Sessions tab → see all sessions with action counts
- **API**: `GET /api/sessions` → list all sessions
- **API**: `GET /api/sessions/<session_id>/actions` → all actions in a session

---

## F-18: Atomic Session Rollback

**What it is:**  
Undo all file writes in an entire session in one operation. Either all actions rollback or none (all-or-nothing atomicity).

**What it means:**  
If a session goes sideways, you can undo the entire thing with one click. No need to manually rollback each action. Waymark validates that all actions are reversible before touching anything.

**How to use it:**  
**Dashboard → Sessions tab:**
1. Find the session you want to undo
2. Click "Rollback Session"
3. Waymark checks: Are all actions reversible? (no `DROP TABLE`, `rm -rf`, `git push`, etc.)
4. If yes → all files are restored to their `before_snapshot`, all actions marked rolled back
5. If no → rollback is rejected with an error listing the irreversible action

**API:**
```bash
curl -X POST http://localhost:3001/api/sessions/<session_id>/rollback
```

Response:
```json
{
  "success": true,
  "session_id": "sess-abc123",
  "actions_rolled_back": 5,
  "restored_files": ["./src/app.ts", "./package.json"],
  "deleted_files": ["./new_file.ts"]
}
```

---

## F-19: Team Management

**What it is:**  
Add teammates to Waymark so they can approve actions and make escalation decisions.

**What it means:**  
You're not the only person approving actions. Distribute approval responsibilities across your team based on roles and expertise.

**How to use it:**  
**Dashboard → Team tab:**
1. Click "Add Member"
2. Enter: name, email, role (optional), Slack ID (optional)
3. Member is added to the team roster

**API:**
```bash
curl -X POST http://localhost:3001/api/team/members \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice",
    "email": "alice@company.com",
    "role": "senior-engineer",
    "slack_id": "U123456"
  }'
```

Team members can then:
- Approve/reject actions assigned to them
- Be escalation targets for stale approvals
- View team-specific approval history

---

## F-20: Approval Routing Rules

**What it is:**  
Conditional rules that automatically assign approvals to specific team members based on action type/risk.

**What it means:**  
Instead of all approvals going to you, you can create rules like:
- "All database changes require Alice's approval"
- "High-risk changes require both Alice and Bob"
- "Only backend engineers approve API changes"

**How to use it:**  
**Dashboard → Approvals tab:**
1. Click "New Routing Rule"
2. Set: name, condition type (all_sessions / tool_name / action_count / risk_level)
3. Select required approvers
4. Save

**Condition types:**

| Type | Example |
|------|---------|
| `all_sessions` | Every session requires these approvers |
| `tool_name` | Sessions with `bash` actions require these approvers |
| `action_count` | Sessions with >10 actions require these approvers |
| `risk_level` | Sessions with critical risk require these approvers |

**API:**
```bash
curl -X POST http://localhost:3001/api/approval-routes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Database Changes",
    "condition_type": "tool_name",
    "condition_json": {"tool_name": "write_file", "path_pattern": "./src/db/**"},
    "required_approvers": ["alice@company.com", "bob@company.com"]
  }'
```

---

## F-21: Escalation Management

**What it is:**  
Auto-escalate stale approvals to managers after a configurable timeout.

**What it means:**  
If an approval is pending but no one approves for 24 hours, automatically notify escalation targets (e.g., your tech lead or manager) so the decision gets made.

**How to use it:**  
**Dashboard → Escalations tab:**
1. Click "New Escalation Rule"
2. Set: name, timeout (hours, default 24), escalation targets
3. Save

When an approval request created, Waymark checks escalation rules. If none of the required approvers respond within the timeout:
1. An `escalation_request` is created
2. Escalation targets (managers, on-calls, etc.) are notified
3. They submit "proceed" or "block" decision
4. Session rollback proceeds only if all say "proceed"

**API:**
```bash
curl -X POST http://localhost:3001/api/escalations/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manager Escalation",
    "timeout_hours": 24,
    "escalation_targets": ["manager@company.com", "tech-lead@company.com"]
  }'
```

---

## Level 5: Risk & Remediation

Quantify risk and suggest or enforce fixes automatically.

## F-22: Risk Assessment Engine

**What it is:**  
Evaluates a session and produces a 0–10 risk score plus a risk level (none / low / medium / high / critical).

**What it means:**  
Instead of guessing whether a session is safe, you get a quantified risk assessment. Critical risk (≥8) can auto-block the session.

**How to use it:**  
The risk score is calculated from five weighted factors:

| Factor | Weight | Examples |
|--------|--------|----------|
| Operation type | 25% | delete_file=2.5, bash=2.0, write_file=1.8, read=0 |
| Scale | 25% | 1 action=0, 2–5=0.5, 6–20=1.5, 20+=3.0 |
| Error pattern | 20% | no errors=0, transient=0.5, data_loss=2.0, system=3.0 |
| Time | 20% | <5min=0, 5–60min=0.5, 1–6h=1.5, 24h+=3.0 |
| System state | 10% | CPU/memory usage, request rate anomalies |

**Risk levels:**
- `none` — score <1.0
- `low` — 1.0–2.9
- `medium` — 3.0–4.8
- `high` — 4.9–7.9
- `critical` — ≥8.0

**Dashboard → Remediation tab:**
View risk score, breakdown by factor, and recommendations per risk level.

**API:**
```bash
curl -X POST http://localhost:3001/api/remediation/assess \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess-abc123"}'
```

Response:
```json
{
  "session_id": "sess-abc123",
  "risk_score": 7.5,
  "risk_level": "high",
  "factors": {
    "operation_type": 1.8,
    "scale": 1.5,
    "error_pattern": 2.0,
    "time": 1.2,
    "system_state": 1.0
  },
  "recommendations": [
    "Review all bash commands for destructive patterns",
    "Verify file modifications before approving"
  ]
}
```

---

## F-23: Remediation Recommender

**What it is:**  
Given a session's risk level, recommends one of five remediation strategies.

**What it means:**  
Not every high-risk session needs full rollback. Sometimes a partial rollback, retry, or expert review is better.

**How to use it:**  
**Dashboard → Remediation tab:**
1. Run "Risk Assessment"
2. See primary strategy, alternatives, estimated safety & downtime
3. Click to apply the recommended strategy

**Five strategy types:**

| Strategy | When | Example |
|----------|------|---------|
| `partial_rollback` | Safe ops only | Keep read-only changes, rollback destructive writes |
| `staged_rollback` | >10 actions | Rollback in phases with verification between each |
| `retry` | Transient errors | Retry instead of rolling back (network glitch, timeout) |
| `workaround` | Data fixable | Apply data-level fixes instead of file rollback |
| `escalation` | Uncertain | Manual expert review (always included as fallback) |

**API:**
```bash
curl -X POST http://localhost:3001/api/remediation/recommend \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess-abc123"}'
```

Response:
```json
{
  "primary_strategy": {
    "type": "partial_rollback",
    "description": "Roll back destructive writes, keep read-only changes",
    "estimated_safety": 92,
    "estimated_downtime_seconds": 15
  },
  "alternatives": [
    {"type": "escalation", "estimated_safety": 100}
  ],
  "requires_manual_review": false,
  "required_approvals": ["alice@company.com"]
}
```

---

## F-24: Auto-block Rules

**What it is:**  
Sessions with critical risk (score ≥ threshold, default 8.0) are automatically blocked from executing or rolling back without admin override.

**What it means:**  
You set a threshold, and Waymark prevents potentially dangerous sessions from proceeding unless explicitly unblocked by an admin.

**How to use it:**  
Auto-blocks are created automatically when risk ≥ threshold. No configuration needed (default works), but you can customize:

**Environment variable:**
```bash
export WAYMARK_RISK_AUTO_BLOCK_THRESHOLD=7.5  # Default 8.0
```

**Dashboard → Remediation tab:**
View "Active Block Rules" table:
- Session ID
- Reason (risk score, policy violation, etc.)
- Blocked at timestamp
- "Request Override" button (notifies admin)

**Admin override:**
Only users with `role: admin` can unblock:

```bash
curl -X POST http://localhost:3001/api/remediation/blocks/<block_id>/unblock \
  -H "Content-Type: application/json" \
  -H "x-user-role: admin" \
  -d '{"reason": "Reviewed and approved by security team"}'
```

---

## F-25: Policy Compliance Evaluation

**What it is:**  
Check whether a session's actions comply with policy templates (HIPAA, SOC2, PCI-DSS, or custom).

**What it means:**  
If you're regulated, you need to prove compliance. This feature checks a session against predefined policy templates and flags violations.

**How to use it:**  
**Dashboard → Remediation tab:**
Click "Run Compliance Check":
1. Select policy template (HIPAA, SOC2, PCI-DSS, or custom)
2. Get compliance verdict: compliant / with violations
3. See violation details with severity and remediation

**Compliance checks:**
- **HIPAA** — Data encryption, access controls, audit logging, authorized personnel only
- **SOC2** — System availability, processing integrity, confidentiality, authorized access
- **PCI-DSS** — Secure password handling, encrypted data transmission, access restrictions
- **Custom** — Define your own rules

**API:**
```bash
curl -X POST http://localhost:3001/api/remediation/evaluate-policy \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess-abc123",
    "policy_name": "HIPAA"
  }'
```

Response:
```json
{
  "policy_name": "HIPAA",
  "compliant": false,
  "violations": [
    {
      "rule": "data_encryption",
      "severity": "critical",
      "description": "Database backup written unencrypted",
      "action_id": "act-xyz"
    }
  ]
}
```

---

## Level 6: ML Predictions & Analytics

Machine learning-powered risk prediction and historical analysis.

## F-26: ML Risk Prediction

**What it is:**  
A Random Forest model trained on past decisions that predicts risk for new sessions.

**What it means:**  
Instead of just calculating risk from current factors, the ML model learns from your history. Over time, predictions become more accurate for your specific project patterns.

**How to use it:**  
The model is automatic. Once you have ≥10 historical decisions, Waymark trains a model:

```bash
curl -X POST http://localhost:3001/api/ml/model/train \
  -H "Content-Type: application/json" \
  -d '{
    "min_examples": 10,
    "test_split": 0.2
  }'
```

Response:
```json
{
  "model_version": "1",
  "trained_examples": 42,
  "accuracy": 0.89,
  "mae": 0.82,
  "rmse": 1.14,
  "feature_importance": {
    "operation_type": 0.32,
    "scale": 0.28,
    "error_pattern": 0.21,
    "time": 0.15,
    "system_state": 0.04
  }
}
```

**Single prediction:**
```bash
curl -X POST http://localhost:3001/api/ml/predict \
  -H "Content-Type: application/json" \
  -d '{
    "operationTypeRisk": 1.8,
    "scaleRisk": 1.5,
    "errorPatternRisk": 0.5,
    "timeRisk": 0.5,
    "systemStateRisk": 0.2,
    "policyViolationCount": 0
  }'
```

Response:
```json
{
  "predicted_risk": 7.2,
  "confidence": 0.87,
  "feature_importance": {...}
}
```

**Batch prediction:**
```bash
curl -X POST http://localhost:3001/api/ml/predict/batch \
  -H "Content-Type: application/json" \
  -d '{
    "predictions": [
      {...feature vector 1...},
      {...feature vector 2...}
    ]
  }'
```

---

## F-27: Decision History & Analysis

**What it is:**  
Analyzes all past decisions to compute per-strategy success rates, policy accuracy, and risk patterns.

**What it means:**  
See which remediation strategies work best for your project, which policies are too strict, which risk levels are most common.

**How to use it:**  
**Dashboard → Analytics (future tab):**
View charts:
- **Strategy success rates** — "partial_rollback": 94% success, "escalation": 100% success
- **Policy accuracy** — Your policies block true positives at 92%, false positives at 3%
- **Risk patterns** — Most sessions are low risk; 5% reach critical

**API:**
```bash
curl http://localhost:3001/api/ml/history \
  -H "Content-Type: application/json" \
  -d '{
    "time_range_days": 30,
    "group_by": "strategy"  # or "risk_level"
  }'
```

Response:
```json
{
  "strategies": {
    "partial_rollback": {
      "count": 12,
      "success_rate": 0.94,
      "avg_execution_time_seconds": 15,
      "trend": "improving"
    },
    "escalation": {
      "count": 3,
      "success_rate": 1.0,
      "avg_resolution_time_hours": 2.5,
      "trend": "stable"
    }
  }
}
```

---

## F-28: Predictive Analytics Dashboard

**What it is:**  
Time-series trends, risk forecasts, strategy performance, and overall health score derived from decision history.

**What it means:**  
See not just current state, but trends: Is risk going up or down? Which strategies are improving? Is your system healthier?

**How to use it:**  
**Dashboard → Remediation or Analytics tab:**

**Risk trend:**
- Chart: Risk scores over last 30 days, bucketed by day
- Trend: increasing / decreasing / stable
- Forecast: Predicted average risk for next 7 days (with confidence band)

**Strategy performance:**
- Bar chart: Success rate per strategy
- Line chart: Usage trend (which strategies used most recently)

**Health score:**
- "Health: GOOD" (or EXCELLENT / FAIR / POOR)
- Breakdown: Risk profile 40%, policy accuracy 30%, system stability 20%, team responsiveness 10%

**API:**
```bash
curl http://localhost:3001/api/analytics/dashboard
```

Response:
```json
{
  "health_score": "good",
  "risk_trend": {
    "direction": "decreasing",
    "forecast_7d": 5.2,
    "forecast_30d": 4.8
  },
  "strategy_performance": {
    "partial_rollback": {"success_rate": 0.94, "trend": "improving"},
    "escalation": {"success_rate": 1.0, "trend": "stable"}
  },
  "insights": [
    "Risk decreasing week-over-week",
    "Consider tightening blockedCommands policy (0 false negatives)",
    "Escalation strategy working well for critical cases"
  ]
}
```

---

## Level 7: Enterprise Persistence & Streaming

Cross-session state, pluggable databases, and real-time streaming.

## F-29: Real-time SSE Streaming

**What it is:**  
Server-Sent Events (SSE) connection that streams live dashboard updates to connected clients.

**What it means:**  
Instead of polling every 3 seconds, the dashboard can subscribe to live events. When an action is logged or a decision is made, the dashboard updates instantly.

**How to use it:**  
Automatic in the dashboard — all clients subscribe on page load:

```bash
GET /api/realtime/subscribe/sse
```

Events streamed (examples):
```
event: decision_recorded
data: {"session_id": "sess-123", "risk_score": 7.5, "timestamp": "..."}

event: metric_updated
data: {"metric": "pending_count", "value": 2}

event: policy_applied
data: {"session_id": "sess-123", "policy": "HIPAA", "compliant": false}
```

**Event types:**
- `decision_recorded` — new decision made
- `metric_updated` — statistics changed
- `alert_triggered` — critical alert
- `policy_applied` — policy compliance evaluated
- `execution_started` / `execution_completed` — remediation execution events
- `system_status` — server health updates

---

## F-30: Persistent Decision History

**What it is:**  
Cross-session record storage with pluggable database backends (in-memory, PostgreSQL, MongoDB).

**What it means:**  
Decision history persists across server restarts. You can use powerful databases (PostgreSQL, MongoDB) for complex queries and long-term analysis.

**How to use it:**  
By default, Waymark uses in-memory storage (decisions lost on restart). For production:

**Environment:**
```bash
export WAYMARK_PERSISTENCE_BACKEND=postgresql
export WAYMARK_DB_URL=postgresql://user:pass@localhost:5432/waymark
```

Supported backends:
- `in-memory` — default, fast, development-only
- `postgresql` — production-grade, complex queries
- `mongodb` — document-oriented, flexible schema

**API:**
```bash
curl http://localhost:3001/api/persistence/decisions \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess-abc123",
    "recommended_strategy": "partial_rollback",
    "user_decision": "execute",
    "outcome": "success",
    "execution_time_seconds": 15
  }'
```

Retrieve:
```bash
curl http://localhost:3001/api/persistence/decisions/sess-abc123/history
```

---

## F-31: Persistent Policies

**What it is:**  
Versioned, categorized policies stored in the database with audit trails.

**What it means:**  
Policies are no longer just `waymark.config.json`. They're managed, versioned, and categorized (compliance / security / operational / data / custom) with full change history.

**How to use it:**  
**Dashboard → Policies tab (future):**
1. Browse active policies by category
2. View policy history (versions, who changed it, when)
3. Create new policy using templates or from scratch
4. Policies auto-apply; no restart needed

**API — Create policy:**
```bash
curl -X POST http://localhost:3001/api/remediation/policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Database Changes Require Approval",
    "category": "compliance",
    "description": "All DB writes in /src/db must be approved",
    "rules": [
      {
        "type": "requireApproval",
        "path_pattern": "./src/db/**"
      }
    ],
    "severity": "high"
  }'
```

**API — List versions:**
```bash
curl http://localhost:3001/api/remediation/policies/policy-123/versions
```

---

## F-32: Database Backends & Migrations

**What it is:**  
Pluggable persistence layer supporting in-memory, PostgreSQL, and MongoDB with automatic schema migrations.

**What it means:**  
Waymark can scale from a single-user dev setup to enterprise deployments. Migrations are versioned and auto-applied.

**How to use it:**  
Set backend at startup:

```bash
export WAYMARK_PERSISTENCE_BACKEND=postgresql
export WAYMARK_DB_URL=postgresql://user:pass@host:5432/waymark

waymark start
```

Waymark automatically:
1. Connects to the database
2. Runs pending migrations (InitialSchema, PolicyTemplates, ExecutionPlans, AuditTrail)
3. Creates tables and indexes
4. Starts serving

**Supported backends:**

| Backend | Use case | Connection string |
|---------|----------|-------------------|
| `in-memory` | Development | (none, in-process) |
| `postgresql` | Production, ≥1000 decisions | `postgresql://user:pass@host:5432/db` |
| `mongodb` | Document-oriented, flexible | `mongodb://user:pass@host:27017/waymark` |

**Migrations auto-applied in order:**
1. **InitialSchema** — tables, indexes, constraints
2. **PolicyTemplates** — pre-load HIPAA/SOC2/PCI-DSS templates
3. **ExecutionPlans** — checkpoint tracking, verification checks
4. **AuditTrail** — comprehensive audit logging per operation

Check migration status:
```bash
curl http://localhost:3001/api/maintenance/migrations
```

Response:
```json
{
  "migrations": [
    {"name": "InitialSchema", "applied": true, "applied_at": "2026-04-19T10:00:00Z"},
    {"name": "PolicyTemplates", "applied": true, "applied_at": "2026-04-19T10:01:00Z"},
    {"name": "ExecutionPlans", "applied": true, "applied_at": "2026-04-19T10:02:00Z"},
    {"name": "AuditTrail", "applied": true, "applied_at": "2026-04-19T10:03:00Z"}
  ]
}
```

---

## Level 8: Advanced Policy, CLI & Dashboard (v4.7.0)

New capabilities from the v4.7.0 major release.

## F-33: Bash Approval Queue (`requireApprovalBash`)

**What it is:**  
Queue bash commands for human approval before execution — identical semantics to `requireApproval` for file writes, but applied to shell commands.

**What it means:**  
You can now require human sign-off on specific shell commands (e.g., `git push`, `npm publish`, database migrations) without blocking all bash globally.

**How to use it:**  
Add `requireApprovalBash` to `waymark.config.json`:

```json
{
  "requireApprovalBash": [
    "git push",
    "npm publish",
    "kubectl apply",
    "regex:^(docker|podman)\\s+run"
  ]
}
```

- Matching commands are queued without executing
- Dashboard shows pending bash actions alongside pending file writes
- Approve/reject from the Approvals inbox or via API

**Dashboard:** Commands appear in Approvals → Pending tab with the command text, session, and timestamp.

---

## F-34: Bash Command Allowlist (`allowedCommands`)

**What it is:**  
An explicit allowlist of bash commands that are always permitted, even when `blockedCommands` patterns are broad.

**What it means:**  
You might block all `rm` commands except `rm ./tmp/*`. `allowedCommands` lets you carve out safe exceptions from a broad blocklist without removing the block.

**How to use it:**  
```json
{
  "blockedCommands": ["regex:^rm\\s"],
  "allowedCommands": ["rm -rf ./tmp", "rm ./dist"]
}
```

Policy priority: `blockedCommands` → `allowedCommands` → `requireApprovalBash` → default allow. An `allowedCommands` match overrides a `blockedCommands` match.

---

## F-35: Policy Editor in Dashboard

**What it is:**  
A visual interface for managing `waymark.config.json` policy rules — add, remove, and reorder rules per category without editing JSON manually.

**What it means:**  
Non-technical team members can manage Waymark policy through a UI. Changes save live to `waymark.config.json` with no restart required.

**How to use it:**  
**Dashboard → Policy tab → Edit Rules:**
1. Select a category (Allowed Paths, Blocked Paths, Requires Approval, Blocked Commands, Requires Approval Bash, Allowed Commands)
2. Click "+" to add a rule (supports plain strings and `regex:` prefix)
3. Click "×" to remove a rule
4. Changes are saved immediately via `PATCH /api/config`

---

## F-36: Interactive Policy Testing

**What it is:**  
Test any file path or bash command against the active policy and see what decision Waymark would make — without actually executing anything.

**What it means:**  
Before updating a policy rule, verify it does what you expect. Test edge cases interactively from the dashboard or CLI.

**How to use it:**  
**Dashboard → Policy tab → Test a Rule:**
```bash
# API
curl -X POST http://localhost:PORT/api/policy/test \
  -H "Content-Type: application/json" \
  -d '{"action": "write", "path": "./src/db/schema.sql"}'

# Response
{
  "decision": "pending",
  "reason": "matches requireApproval pattern: ./src/db/**",
  "rule": "./src/db/**"
}

# Test a bash command
curl -X POST http://localhost:PORT/api/policy/test \
  -H "Content-Type: application/json" \
  -d '{"action": "bash", "command": "git push origin main"}'
```

`GET /api/policy/hits` returns the most frequently matched rules from the action log.

---

## F-37: `waymark explain` Command

**What it is:**  
A CLI command that prints a human-readable summary of any logged action by its ID.

**What it means:**  
Quickly understand what happened in a specific action — decision, path or command, rule that matched, timestamps — without opening the dashboard.

**How to use it:**  
```bash
waymark explain act-abc123

# Output
Action:    act-abc123
Type:      write_file
Path:      ./src/db/schema.sql
Decision:  pending
Reason:    matches requireApproval: ./src/db/**
Session:   sess-xyz789
Created:   2026-05-15 12:04:31
Status:    waiting for approval (2h 15m)
```

---

## F-38: `waymark watch` Terminal Dashboard

**What it is:**  
A live terminal dashboard that shows real-time action counts and a recent-action feed — no browser required.

**What it means:**  
Monitor Waymark from the terminal during a long agent run without switching to the browser dashboard.

**How to use it:**  
```bash
waymark watch
```

Output (ANSI colour, refreshes every 2 seconds):

```
Waymark — live  [port 47000]                2026-05-15 12:04:31
─────────────────────────────────────────────────────
  Pending: 3   Allowed: 47   Blocked: 2

Recent actions:
  12:04:29  ✅ allow   write_file  ./src/app.ts
  12:04:27  ⏳ pending write_file  ./src/db/schema.sql
  12:04:25  ✅ allow   read_file   ./README.md
  12:04:20  🚫 block   bash        rm -rf /
─────────────────────────────────────────────────────
  Press Ctrl-C to exit
```

---

## F-39: Session Diff View

**What it is:**  
A unified patch showing every file change made in a single session — aggregated across all `write_file` actions.

**What it means:**  
Review what an entire agent run changed, as a single diff, before deciding whether to approve or rollback.

**How to use it:**  
**Dashboard → Sessions → [session] → "View Diff" button**

**API:**
```bash
curl http://localhost:PORT/api/sessions/sess-abc123/diff
```

Response: a per-file unified patch:
```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -12,6 +12,10 @@
+  const newFeature = () => { ... }
```

---

## Level 9: Agent Monitoring & Observability

Live insight into running and completed AI agent sessions across all supported platforms.

## F-47: Agent Session History

**What it is:**  
Automatic persistence of completed agent sessions to a `agent_history` SQLite table, with a History tab in the Agent Monitor dashboard.

**What it means:**  
When a Claude or Codex process exits, its session data (tokens, turns, model, duration, Waymark-controlled flag) is preserved permanently. You can review what every past agent session did — even hours after the PID disappeared.

**How to use it:**  
Open the **Agent Monitor** (`/agents`) → **History** tab. Sessions are shown newest-first with:

| Column | Description |
|--------|-------------|
| Agent | `claude` / `codex` / `copilot` |
| Project | Project name (from CWD) |
| Duration | `hh:mm:ss` (start → end) |
| Tokens | Total input + output tokens |
| Turns | Number of conversation turns |
| Model | Model ID used |
| Waymark | ⬡ if tool calls were policy-controlled |
| Ended | Relative time ago |

Filter by agent type using the dropdown above the table.

**API:**
```bash
curl "http://localhost:3001/api/agent-monitor/history?limit=50&agent=claude"
```

---

## F-40: Audit Log Export

**What it is:**  
Download the complete Waymark action log as a CSV or JSON file for external compliance tools, SIEM systems, or manual review.

**What it means:**  
Satisfy compliance requirements by exporting the full audit trail with all metadata.

**How to use it:**  
**Dashboard → Actions → "Export" button**

**API:**
```bash
# CSV
curl "http://localhost:PORT/api/audit/export?format=csv" -o audit.csv

# JSON
curl "http://localhost:PORT/api/audit/export?format=json" -o audit.json
```

Each row includes: action ID, session ID, type, path/command, decision, reason, approved/rejected timestamps, and blocked-by-rule.

---

## F-41: Approve-with-Edit

**What it is:**  
Approve a pending `write_file` action while substituting your own version of the file content — without re-running the agent.

**What it means:**  
Instead of approving as-is or rejecting and asking the agent to retry, you can fix the content yourself before approving. The corrected content is written to disk.

**How to use it:**  
**Dashboard → Approvals → [pending action] → "Approve with edits"**

A Drawer opens with a textarea pre-filled with the pending file content. Edit it, then click "Approve". Your version is written to disk and logged.

**API:**
```bash
curl -X POST http://localhost:PORT/api/actions/act-abc123/approve-with-edit \
  -H "Content-Type: application/json" \
  -d '{"content": "# corrected file content\n..."}'
```

---

## F-42: Selective Session Rollback

**What it is:**  
Roll back only specific `write_file` actions within a session — not the entire session.

**What it means:**  
A session that wrote 10 files might have 9 good changes and 1 bad one. Selective rollback lets you undo just the bad action without touching the others.

**How to use it:**  
**Dashboard → Sessions → [session] → check individual write_file rows → "Rollback selected (N)"**

**API:**
```bash
curl -X POST http://localhost:PORT/api/sessions/sess-abc123/rollback-partial \
  -H "Content-Type: application/json" \
  -d '{"action_ids": ["act-1", "act-3"]}'
```

Response:
```json
{
  "success": true,
  "rolled_back": ["act-1", "act-3"],
  "skipped": [],
  "restored_files": ["./src/bad.ts"]
}
```

---

## F-43: Action Replay

**What it is:**  
Re-execute a previously rolled-back `write_file` action as a new pending action — without re-running the agent.

**What it means:**  
If you rolled back a write by mistake, or want to re-apply a change after reviewing it, replay queues the same content as a new pending write for approval.

**How to use it:**  
**Dashboard → Actions → [rolled-back action] → "Replay"**

**API:**
```bash
curl -X POST http://localhost:PORT/api/actions/act-abc123/replay
```

Response: the ID of the new pending action.

---

## F-44: Agent Pause / Resume

**What it is:**  
Temporarily freeze a running AI agent (SIGSTOP) and resume it (SIGCONT) from the dashboard — without killing the session.

**What it means:**  
If an agent is doing something unexpected, pause it mid-run to review what it's doing before deciding whether to let it continue or roll back.

**How to use it:**  
**Dashboard → Agents → [session card] → "Pause" / "Resume"**

The agent process receives SIGSTOP (pauses execution) or SIGCONT (resumes). The session status in the dashboard updates to `paused`.

---

## F-45: Analytics Summary

**What it is:**  
A summary of aggregate Waymark activity: top blocked paths, busiest hours of the day, and average approval latency.

**What it means:**  
Understand your team's Waymark usage patterns. Which paths are blocked most often? When are agents most active? How long do approvals take?

**How to use it:**  
**Dashboard → Stats → Summary card**

**API:**
```bash
curl http://localhost:PORT/api/analytics/summary
```

Response:
```json
{
  "top_blocked_paths": [
    {"path": ".env", "count": 23},
    {"path": "package-lock.json", "count": 11}
  ],
  "busiest_hours": [
    {"hour": 14, "action_count": 142},
    {"hour": 10, "action_count": 98}
  ],
  "avg_approval_latency_minutes": 18
}
```

---

## F-46: `waymark init --dry-run`

**What it is:**  
Preview what `waymark init` would create — without writing any files.

**What it means:**  
Use in CI or before onboarding a project to see exactly what Waymark would set up, including which platform-specific files would be generated.

**How to use it:**  
```bash
waymark init --dry-run

# Output
Would create:
  waymark.config.json         (policy configuration)
  CLAUDE.md                   (system prompt for Claude Desktop/Code)
  COPILOT.md                  (system prompt for GitHub Copilot CLI)
  .waymark/                   (data directory, gitignored)
  .waymark/waymark.db         (SQLite action ledger)
  .mcp.json                   (Claude Desktop MCP registration)

No files written (--dry-run mode).
```

---

## F-48: Waymark-Controlled Session Badge

**What it is:**  
Visual indicator (`⬡ Waymark`) on sessions whose tool calls actually flowed through Waymark's MCP policy enforcement layer.

**What it means:**  
Not every agent in the monitor is necessarily controlled by Waymark — an agent could be running without Waymark in its MCP config. This badge tells you at a glance which sessions were policy-enforced vs. merely observed.

**How to use it:**  
The badge appears automatically on:
- Session cards in the dashboard (Agent Monitor → Sessions tab)
- The History tab row
- `waymark agents` CLI output (W column)
- `waymark watch` live output (prefix `[W]`)

No configuration required — detected by cross-referencing each session's ID against the `action_log` table.

---

## F-49: Live Sparklines & Token Burn Rate

**What it is:**  
Inline SVG sparklines showing token usage history and context-window pressure over the last 20 turns, with a per-turn burn rate label.

**What it means:**  
See at a glance whether an agent is accelerating its token usage (context pressure growing) or running efficiently. Color-coded context sparkline (green < 60%, amber 60–85%, red > 85%) lets you spot context exhaustion before it happens.

**How to use it:**  
Sparklines appear automatically on each session card in the **Agent Monitor → Sessions** tab whenever `tokenHistory[]` or `contextHistory[]` data is present (requires Claude Code 1.x or later).

- **Token sparkline** (indigo): cumulative tokens per turn
- **Context sparkline** (color-coded): context window fill percentage per turn
- **Burn rate** (`+Nk/turn`): tokens added in the most recent turn

---

## F-50: Port Categorization, Visibility & Kill

**What it is:**  
Listening ports in agent sessions are classified by type, labeled with a public/private binding indicator, and can be terminated from the dashboard.

**What it means:**  
Instead of a raw list of PIDs and port numbers, you see whether port 3000 is a browser dev server (browser), port 5432 is a database (db), or port 8080 is an API server (api). You can tell whether the port is reachable from the network (🌐 public) or only from localhost (🔒 local). Orphan ports (processes whose parent session no longer exists) can be killed with one click.

**Port categories:**

| Category | Typical ports | Examples |
|----------|--------------|---------|
| `browser` | 3000, 3001, 4200, 5173, 8080–8081 | Vite, CRA, Angular dev servers |
| `api` | 4000–5000, 8000, 8888 | Express, FastAPI, Jupyter |
| `db` | 5432, 3306, 27017, 6379 | Postgres, MySQL, MongoDB, Redis |
| `system` | < 1024 | Well-known system ports |
| `other` | everything else | — |

**Kill action:**  
Dashboard → Agent Monitor → **Ports** tab → click **Kill** on any orphan row. Sends SIGTERM immediately, then SIGKILL after 2 seconds.

**CLI:**
```bash
# Kill orphan port process by PID
curl -X DELETE http://localhost:3001/api/agent-monitor/ports/<pid>
```

---

## F-51: Full-Content Tool Call Modal

**What it is:**  
Clicking any tool call row in the session detail panel opens a scrollable overlay showing the complete, untruncated tool argument.

**What it means:**  
Previously, long file paths, bash commands, and prompt snippets were hard-truncated at 120 characters in both the dashboard and the database. Now they're captured at up to 2000 characters and displayed in full inside a `<pre>` modal so you can read exactly what the agent wrote or executed.

**How to use it:**  
In the Agent Monitor → Sessions tab, expand a session card → tool calls list → click any row. The modal also applies to the "Initial prompt" section (click **view full**).

---

## F-52: Rate-Limit Monitoring & `waymark setup-hook`

**What it is:**  
Visual rate-limit pills and usage bars on the Agent Monitor → Rate Limits tab, plus a CLI command that installs the hook required to populate them.

**What it means:**  
Claude's 5-hour usage quota is invisible by default. Waymark surfaces it in the dashboard as soon as the data source is configured. The `waymark setup-hook` command handles configuration automatically — one command, then restart Claude Code.

**How to use it:**

**Step 1 — Install the Stop hook:**
```bash
waymark setup-hook
```
This installs `~/.claude/waymark-rate-limit-hook` (a bash script) and registers it as a Claude Code `Stop` hook in `~/.claude/settings.json`. The hook fires after every agent response turn, reads the transcript, extracts rate-limit information, and writes `~/.claude/abtop-rate-limits.json`.

**Step 2 — Restart Claude Code.**

Rate-limit data appears in the dashboard within 30 seconds of the next agent response. A usage bar below each pill shows how much of the window is consumed.

Safe to run `waymark setup-hook` multiple times — it detects and skips already-installed hooks.

---

## F-53: Agent Token Usage by Project (Stats View)

**What it is:**  
A horizontal bar chart at the bottom of the Stats page showing cumulative token consumption (input + output) grouped by project, sourced from agent session history.

**What it means:**  
Understand which projects are consuming the most AI compute. Useful for chargeback attribution, quota planning, and identifying runaway agents in a particular codebase.

**How to use it:**  
Open **Stats** (`/stats`). The "Agent token usage by project" chart appears automatically once session history contains data. Shows top 10 projects by total tokens. Hover labels show the full project path; bar labels show the project name only.

---

## Quick Reference: Feature Activation by Use Case

| Goal | Use | Features |
|------|-----|----------|
| **Quick start** | Just installed Waymark | F-01, F-02, F-04 |
| **Basic safety** | Prevent accidents | F-05, F-06, F-07 |
| **Team approval** | Distribute approvals | F-09, F-19, F-20 |
| **Undo mistakes** | Fast rollback | F-10, F-18, F-42 |
| **Selective undo** | Undo specific actions | F-42, F-43 |
| **Approve with changes** | Edit before approving | F-41 |
| **Bash safety** | Control shell commands | F-33, F-34 |
| **Policy management** | Manage rules visually | F-35, F-36 |
| **Terminal monitor** | Watch from terminal | F-38 |
| **Multi-project** | Several projects | F-13, F-14 |
| **Risk-aware** | Quantify danger | F-22, F-23, F-25 |
| **Predictive** | Learn from history | F-26, F-27, F-28 |
| **Audit & compliance** | Export evidence | F-40, F-45 |
| **Enterprise** | Scaled operations | F-29, F-30, F-31, F-32 |
| **Observe agents** | Monitor running agents | F-47, F-48, F-49, F-50 |
| **Debug agent actions** | See full tool content | F-51 |
| **Rate limits** | Monitor Claude quota | F-52 |
| **Token attribution** | Track spend by project | F-53 |

---

## Glossary

- **Action** — A single MCP tool call (write_file, read_file, bash)
- **Session** — Group of related actions from one Claude run
- **Ledger** — SQLite database recording all actions
- **Policy** — Rules in waymark.config.json (allowedPaths, blockedPaths, etc.)
- **Decision** — Outcome of policy evaluation (allow / block / pending)
- **Approval** — Human confirmation required for requireApproval paths
- **Rollback** — Undo a write_file by restoring its before_snapshot
- **Risk score** — 0–10 quantification of session danger
- **Remediation** — Strategy to fix or mitigate a risky session
- **Escalation** — Auto-notify managers if approval times out

---

**Last updated**: 2026-05-15  
**Waymark version**: v4.7.0  
**Status**: Production-ready

---

## See also

- [`README.md`](README.md) — Project overview, install, and quick start.
- [`docs/README.md`](docs/README.md) — Documentation map of every guide in `docs/`.
- [`docs/FAQ.md`](docs/FAQ.md) — Frequently asked questions.
- [`docs/APPROVALS.md`](docs/APPROVALS.md) — How approval routing works in practice.
- [`docs/REMEDIATION.md`](docs/REMEDIATION.md) — Rolling back actions.
- [`docs/README_PLATFORMS.md`](docs/README_PLATFORMS.md) — Supported platforms and integration status.
- [`docs/user-stories/README.md`](docs/user-stories/README.md) — Walkthroughs of major features with screenshots.
- [`CHANGELOG.md`](CHANGELOG.md) — Release history.
