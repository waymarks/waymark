# FAQ

This FAQ is adapted from the repository's `docs/FAQ.md`, but cleaned up to reflect the current codebase and platform behavior.

## General

### What is Waymark?

Waymark is MCP middleware that intercepts, logs, enforces policies on, and makes reversible every file and shell action taken by an AI agent. In practice, it gives you a dashboard and API for what the agent attempted, what was allowed, what was blocked, and what can be rolled back.

!!! tip "Think execution governance"
    Waymark is not trying to read the model's reasoning. It governs the actions the model tries to take.

### Why do I need Waymark?

Use Waymark when you want:

- **visibility** into file and shell activity
- **control** over sensitive operations
- **rollback** for reversible writes
- **audit history** across sessions
- **policy enforcement** that does not rely on a prompt reminder

!!! tip "Prompts are weaker than policies"
    A blocked path in config is a stronger guarantee than “please don't edit this file” in a context window.

### Is Waymark safe?

Waymark is local-first, permission-based, and designed around reversible writes. Logs and the database live on your machine unless you deliberately export or forward data elsewhere.

!!! tip "Protect `.waymark/`"
    The ledger can contain file content snapshots, so keep the project-local `.waymark/` directory private and gitignored.

## Platform support

### Which AI platforms does Waymark support?

Current project docs and source support:

- **Claude Desktop**
- **Claude Code**
- **GitHub Copilot CLI**

Future editor-chat platforms depend on MCP or an equivalent interception mechanism.

!!! tip "Claude is the smoothest default"
    Claude remains the most direct Waymark fit, but Copilot CLI is now documented as a first-class platform in current source and changelog history.

### Why doesn't Waymark support GitHub Copilot Chat in VS Code yet?

Because Waymark works best where it can intercept tool calls through MCP. Copilot Chat in the editor does not currently expose the same integration point that Claude and Copilot CLI do.

!!! tip "The limit is the platform boundary"
    If the platform does not expose an MCP-style execution gateway, Waymark cannot enforce file and shell policy at that layer.

### Can I use multiple platforms?

Yes. During `waymark init`, choose **Both** to configure Claude and GitHub Copilot CLI in one project.

!!! tip "One policy file, one ledger"
    Multi-platform mode still uses the same `waymark.config.json` and `.waymark/waymark.db` for the project.

### How do I switch platforms later?

Edit `waymark.config.json`, update the `platforms` array, and re-run `waymark init` if you want the project instructions and MCP config regenerated.

!!! tip "Treat platform changes as config changes"
    The safest workflow is to update the config, regenerate the docs/config integration, and then restart the target client.

## Setup & installation

### How do I install Waymark?

The fastest path is:

```bash
npx @way_marks/cli init
npx @way_marks/cli start
```

You can also install globally with `npm install -g @way_marks/cli`.

!!! tip "`npx` is enough to start"
    You do not need a global install just to initialize a project and try Waymark.

### What does `waymark init` do?

It creates project config, generates platform instruction files, updates MCP configuration, and ensures `.waymark/` is ignored.

!!! tip "Use `--dry-run` first if needed"
    `waymark init --dry-run` previews which files and config entries will be created or changed.

### Where do logs go?

Primary storage locations are:

- `.waymark/waymark.db` — project-local SQLite ledger
- `.waymark/waymark.pid` — process tracking
- browser dashboard — live review UI
- REST API — programmatic access

!!! tip "Use `status` to find the live URL"
    `waymark status` tells you the active dashboard port for the current project.

### Can I use Waymark in multiple projects?

Yes. Each project gets its own local database and runtime state, while the machine-wide registry tracks projects for the Hub view and commands such as `waymark list` and `waymark open`.

!!! tip "Multi-project is a first-class workflow"
    The registry and Hub view are designed exactly for teams running several Waymark-enabled repos on one machine.

### Can Waymark work with CI/CD?

It can, but the value is highest in interactive agent workflows where approvals, dashboard review, and rollback are meaningful. In CI, linters and tests are usually a better fit for enforcement.

!!! tip "Best for human-in-the-loop work"
    Waymark shines when an agent is acting interactively and a human may need to approve, reject, or inspect actions mid-flight.

## GitHub Copilot CLI

### How do I set up Copilot CLI with Waymark?

Select **GitHub Copilot CLI** during `waymark init`, then restart the client after the MCP config has been written.

!!! tip "Current setup is MCP-based"
    The current repo generates `COPILOT.md` and merges a local MCP entry into `~/.copilot/mcp-config.json`.

### Does Copilot CLI support policy control and monitoring?

Yes. Current source and changelog describe it as a first-class platform with monitoring and policy-controlled tool routing through Waymark.

!!! tip "Ignore stale wrapper-only docs"
    Older docs referenced an experimental wrapper approach. The current codebase documents direct MCP configuration as the main path.

### Can I disable the integration later?

Yes. Remove the project from your Copilot MCP config and update the project's `platforms` array if you no longer want Copilot routed through Waymark.

!!! tip "Treat it like any other tool registration"
    The cleanest removal is to undo the MCP entry and regenerate or edit your project instructions accordingly.

## Dashboard & usage

### How do I access the dashboard?

Run `waymark start` and open the URL it prints. Current versions often use an auto-allocated port in the `47000-47999` range unless you pin a specific port.

!!! tip "Don't assume 3001"
    Legacy docs often used `http://localhost:3001`, but current releases default to a higher auto-allocation range unless configured otherwise.

### Why are some actions styled differently in plan mode?

Waymark can distinguish observation-oriented entries such as plan-mode reads from execution-phase actions using `event_type`, `observation_context`, and `request_source` metadata.

!!! tip "Observation is still useful telemetry"
    Read-only planning activity helps you understand what context an agent inspected before it made changes.

### Can I search the action log?

Yes. The dashboard supports filtering and searching by status, tool, and text terms, and the backend also exposes paginated action queries.

!!! tip "Search by path first"
    File path and action id are usually the fastest way to narrow a noisy action list.

### Can I roll back changes?

Yes, for reversible file writes. You can roll back individual writes, entire sessions, or selected session actions, depending on the workflow.

!!! tip "Use sessions when the blast radius is bigger"
    Per-action rollback is useful for one mistake; session rollback is better when an entire run should be undone together.

### How long are logs kept?

The database supports archiving older actions into `action_archive`, and the API includes a maintenance route for archival. Recent actions stay in the main ledger for quick access.

!!! tip "Archive, don't delete blindly"
    Historical actions are often useful for audit and tuning even after they are no longer part of everyday review.

## Troubleshooting

### Waymark isn't logging my Claude actions

Check three things first:

1. `waymark status`
2. the dashboard URL printed by `start`
3. whether the client was restarted after `init`

!!! tip "Restart the client after setup"
    MCP config changes do not help if Claude or Copilot is still running with the old session state.

### The dashboard is slow

Large ledgers can slow down review if you never archive old entries. Use the archive API and keep the dashboard on the paginated views.

!!! tip "Archive older history"
    Waymark already has archive support; use it before assuming the UI itself is the problem.

### The dashboard port is already in use

Use `waymark start --port <n>` or set `"port": <n>` in `waymark.config.json`.

!!! tip "Current default range avoids dev-server collisions"
    Auto-allocation from `47000-47999` exists specifically to avoid common framework ports such as 3000 and 5173.

### I see “Action blocked by policy”

That usually means Waymark is working as designed. Inspect the matched rule and reason in the dashboard, then update `waymark.config.json` if the block is too strict.

!!! tip "Test before loosening rules"
    Use `POST /api/policy/test` to confirm the effect of a proposed policy change before you rely on it.

## Technical questions

### What's MCP?

MCP is the Model Context Protocol: a tool-integration layer used by AI clients to call external capabilities. Waymark uses it as the interception point for file and shell actions.

!!! tip "Waymark governs the tool boundary"
    MCP is valuable here because it gives Waymark a stable place to inspect and govern actions before they execute.

### Can I extend Waymark?

Yes. The repo exposes clear layers for policy evaluation, API routes, notifications, rollback, and the dashboard.

!!! tip "Start with policy and API additions"
    New rules, endpoints, or dashboard views are often easier extension points than changing the core agent-monitor collectors first.

### Where is data stored?

- `.waymark/waymark.db`
- `.waymark/waymark.pid`
- `~/.waymark/registry.json`
- `~/.claude/settings.json` and related hook files if you install rate-limit monitoring

!!! tip "Project data is local, registry data is machine-wide"
    The database belongs to the repo; the registry belongs to the machine.

### Can I back up and restore logs?

Yes. The main ledger is SQLite, so copying `.waymark/waymark.db` is the simplest backup path.

!!! tip "Stop Waymark before manual DB replacement"
    Replace or restore the file while the background processes are stopped to avoid corruption risk.

### Can I run Waymark without an IDE?

Yes. The CLI, browser dashboard, and API all work outside an IDE-centric workflow.

!!! tip "Terminal-first is still supported"
    `logs`, `watch`, `agents`, and the browser dashboard make Waymark usable even when you are not in an editor.

## Performance & limits

### How many actions can Waymark handle?

The design assumes large ledgers and includes indexes, pagination, and archival to keep common workflows fast.

!!! tip "Use pagination and export intentionally"
    The UI should stay responsive if you archive older history and use focused filters.

### Does Waymark use much disk space?

Usually not much for ordinary repos, but snapshot-heavy histories can grow depending on action volume and file sizes.

!!! tip "Large writes create large snapshots"
    If an agent frequently rewrites big files, disk usage grows with the stored before/after state.

### Can I run multiple Waymark instances?

Yes—one per project. The registry and hub are built for that. Running multiple instances for the same project is not the intended pattern.

!!! tip "One repo, one active Waymark runtime"
    Use the registry, not duplicate daemons, when you need multi-project oversight.

## Security

### Is Waymark secure?

Waymark improves security posture by enforcing policy and keeping data local, but it is not magic. Incorrect rules, careless approvals, and unsafe external side effects are still real risks.

!!! tip "Governance is layered"
    Keep using code review, tests, and OS-level protections alongside Waymark.

### Should I commit `.waymark/` to git?

No. It contains local operational state and potentially sensitive snapshots.

!!! tip "`.waymark/` belongs in `.gitignore`"
    That is why `waymark init` adds it automatically.

### Can I use Waymark with private or confidential code?

Yes, especially because it is local-first. Just remember that logs may contain file content and should be handled with the same care as the source material itself.

!!! tip "Your audit trail may be sensitive too"
    Protect the database, backups, and exports as carefully as the repo they describe.

## Advanced

### Can I use custom policy rules?

Yes. `waymark.config.json` is explicitly designed for custom path and command patterns.

!!! tip "Keep the rules readable"
    Short, explicit allowlists and blocklists are easier to audit than dense regex-only policy files.

### Can I integrate Waymark with Slack?

Yes. Slack notifications are supported when the webhook environment variable is configured.

!!! tip "Slack is for review, not source of truth"
    The dashboard and database remain the durable record even when Slack is part of the approval flow.

### Can I use Waymark in GitHub Actions?

Technically yes, but it is usually not the best fit for non-interactive pipelines.

!!! tip "Prefer CI checks for CI problems"
    Use tests, linters, and release gates in CI; use Waymark for governed interactive agent execution.

## More help

### Where is the rest of the documentation?

Use these documents alongside this site:

- `README.md`
- `FEATURES.md`
- `CHANGELOG.md`
- `docs/README_PLATFORMS.md`
- `docs/APPROVALS.md`
- `docs/SESSIONS.md`
- `docs/REMEDIATION.md`

!!! tip "Start broad, then go deep"
    Overview pages help you understand the product surface; the feature docs and changelog explain how the behavior evolved.

### How do I report bugs or request features?

Open an issue in the GitHub repository with your platform, Waymark version, reproduction steps, and any relevant logs or screenshots.

!!! tip "Include version and platform"
    The fastest bug reports mention the CLI version, the AI platform in use, and the exact command or workflow that triggered the problem.
