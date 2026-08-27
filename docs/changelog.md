# Changelog

This page summarizes the major public-facing changes. Release notes for each version, with links to the published npm packages, are on the [releases page](https://github.com/waymarks/waymark/releases).

## [6.0.0] — 2026-08-27

**Waymark is now proprietary freeware.** It stays free to use, with no warranty and at your own risk. Redistribution, resale, modification and rights in the source code are not granted. Versions published before 2026-08-27 remain under the MIT Licence. Source development has moved to a private repository; this site and the public repository carry documentation only.

### Changed

- **Licence:** relicensed from MIT to a proprietary freeware licence, as described above.
- npm download statistics are refreshed weekly rather than every six hours.

### Fixed

- **Policy engine matched nothing on Windows** — resolved file paths and glob patterns both arrive with backslash separators, which the matcher treats as escape characters rather than separators. Every `allowedPaths` comparison therefore failed and the engine fell through to default-deny, blocking legitimate reads and writes. Both sides are now normalised before matching. No behaviour change on Linux or macOS.
- **Rate Limits tab was always blank** — The dashboard was reading `~/.claude/abtop-rate-limits.json`, which the Stop hook never actually wrote (the grep patterns didn't match anything in Claude Code's transcripts). The collector now scans `~/.claude/projects/**/*.jsonl` directly. Token usage appears automatically without any hook setup.
- **Type mismatch in `/snapshot` endpoint** — The snapshot route was passing raw server-side `{fiveHourPct}` to the frontend, which expected the API-shaped `{fiveHour: {usedPercent, resetsAtIso}}`. Both `/snapshot` and `/rate-limits` now use the same `toApiRateLimit()` transform.

### Added

- **Cross-platform CI** — the test suite now runs on Windows, macOS and Linux on every change, so daemon and path behaviour is verified on all three rather than assumed.
- **Bash execution bounds** — `maxBashTimeoutMs` and `maxBashOutputBytes` policies constrain runaway CLI loops inside agent sandboxes.
- **Token-window visualization** — 5h and 7d rolling window token counts, 30-min burn rate with projected time-to-limit, reset countdown, and per-model breakdown.
- **No setup required** — Rate limit data populates automatically as long as Claude Code has run at least one session. `waymark setup-hook` is now optional.
- **Plan limit config** — Set `planTokenLimit` in `~/.waymark/config.json` to unlock percentage progress bars.

---

## v5.0.16 — Full release: 30+ robustness fixes + complete test suite (teststop-driven)

This release bundles everything since v5.0.12 into one clean publish. All changes were surfaced by [teststop](https://shaifulshabuj.github.io/teststop/) adversarial testing, starting at 19.5% confidence and reaching 86.7% across four sessions.

### Fixed (highlights)

- **Rollback** — double-rollback `409`, manual-edit detection before session rollback, active-session guard, mid-approval execution guard, sibling-snapshot false positive
- **Approvals** — concurrent approve+reject is fully atomic (one winner, one `409`); approve-with-edit rejects empty content; email tokens detect already-executed actions
- **Policy** — validates glob patterns before saving (trims whitespace, rejects smart-quotes, validates micromatch); optimistic-concurrency `updatedAt` guard fires end-to-end
- **Team** — `addTeamMember` now persists role correctly; last-admin and last-active-approver deletion guards; approval route IDs validated
- **Ports** — PID-reuse `409`, PID 0 process-group hint, two-phase TOCTOU fix
- **Hub GC** — skips running/paused projects; archive is atomic

### Added

- `POST /api/sessions/:id/pause` and `/resume` endpoints
- Agent Monitor project-scoping (`?cwd=` and `?project=` params)
- `waymark global-setup` registers MCP entry on all three hosts (Claude Desktop, Claude Code, Copilot CLI)
- Idempotent Slack interaction handler (prevents double-submits on Slack retries)

### Tests

- Full Vitest migration — 624 tests, 33 files, 0 failures

---

## v5.0.15 — Robustness fixes (teststop-driven, 4 critical failures)

### Fixed

- **Partial rollback race with executing actions** — `POST /api/sessions/:id/rollback-partial` now refuses to roll back any action currently mid-approval (`status='executing'`), preventing file corruption from a concurrent write.
- **Team member role now stored in database** — `addTeamMember` previously omitted the `role` column from its INSERT, causing the last-admin guard to never fire (every member appeared as `'approver'`). Role is now persisted and accepted from `POST /api/team/members`.
- **Last-active-member deletion blocked** — `DELETE /api/team/members/:id` returns `409` when the target is the only remaining active member.
- **Reject 409 includes who approved** — Concurrent reject of an already-approved action now returns `approved_by` and `approved_at` in the response body.
- **Port PID 0 returns process-group hint** — `DELETE /api/agent-monitor/ports/0` now explicitly explains that PID 0 targets the whole process group.

## v5.0.14 — teststop confidence improvements (83% → 85%+)

### Fixed

- Port-kill `409` for PID reuse, partial rollback false-positive manual-edit detection, team sole-approver cascade guard, concurrent approve+reject race documentation.

## v5.0.13 — 17 P0 safety fixes (teststop-driven)

### Fixed

**Rollback safety**
- Single-action rollback returns `409` if already rolled back or if the file was manually edited since the action ran (`force: true` override available).
- Session rollback returns `409` when the session is still active — pause first to avoid a rollback/write race.
- Session rollback detects manual edits made after the session ended before touching any file (`force: true` to override).
- All file writes (MCP + rollback) now use atomic temp-file + rename — no partial-write corruption on crash or mid-write pause.

**Approval & token safety**
- `POST /api/actions/:id/reject` returns `409 Conflict` when the action was concurrently approved.
- `rejectAction` DB update is atomic (`WHERE status = 'pending'`) — concurrent approve + reject can no longer leave an action in a contradictory state.
- Email reject token correctly detects when the underlying action already ran and redirects with `already-executed` toast.
- Approve-with-edit rejects empty content with `400` before any file write.
- `UNIQUE INDEX on approval_decisions(request_id, approver_id)` prevents two simultaneous approval decisions from the same approver.

**Policy safety**
- `PUT /api/config/policies` validates every glob pattern: strips whitespace, rejects Unicode smart-quotes, validates micromatch before saving.
- Optimistic-concurrency `updatedAt` guard now fires end-to-end — the web client sends `updatedAt` on every policy save, so stale-tab saves return `409`.

**Team safety**
- `DELETE /api/team/members/:id` returns `409` when removing the last admin.

**Approval routing**
- Overlapping approval routes resolved by specificity (`tool_name` > `risk_level` > `action_count` > `all_sessions`) — most-specific wins.
- `POST /api/approval-routes` warns on overlapping routes at creation time.

**Hub GC**
- `POST /api/hub/gc` skips `running`/`paused` projects to prevent GC from killing active agent sessions.

**Session pause/resume**
- New `POST /api/sessions/:id/pause` and `/resume` endpoints for agent session lifecycle management.
- MCP `write_file` checks session pause status before executing.

## v5.0.12 — Browser tab favicon

### Added

- SVG favicon matching the sidebar brand-mark (gradient W) shown in browser tabs.

## v5.0.11 — Approvals: History tab, remediation panel, email notifications

### Added

- **History tab** replaces stub with a live session-picker + combined approval/escalation timeline.
- **Remediation panel** on pending action cards shows primary rollback strategy and safety estimate inline.
- **Email notifications** fire to all active team members when a tool call enters pending state.

## v5.0.10 — daemon start PID fix (macOS)

### Fixed

- **`waymark daemon start` no longer fails falsely on macOS.** Replaced `proc.pid`-based startup verification with port-based discovery via `lsof`, which correctly tracks the actual daemon PID regardless of macOS spawn behaviour.

## v5.0.9 — Daemon auto-heal on update

### Fixed

- **`waymark update` now auto-restarts the daemon** after a successful install, so the dashboard immediately reflects the new version without manual intervention.
- **`daemon stop/start` heal orphaned processes** by scanning port :47000 with `lsof` — no more stale daemons left over from previous installations.
- **`daemon start` verifies startup** — reports failure with a log pointer instead of silently succeeding when the process dies immediately.

## v5.0.8 — TweaksPopover positioning fix

### Fixed

- **Preferences panel (sliders button) now drops down correctly from the topbar button.** The panel was appearing as a clipped strip at the top-right corner due to `backdrop-filter` on `.topbar` creating a CSS fixed-positioning context that overrode `position: fixed`. Changed to `position: absolute` so the panel anchors to its `position: relative` wrapper and drops down below the button.

## v5.0.5 — Agent Monitor project scoping

### Added

- The Agent Monitor **Sessions** list defaults to the **active project** (matched by the agent's working directory), with a `This project | All projects` toggle. The header shows "N in &lt;project&gt; · M machine-wide", and the sidebar **Agents** badge shows the project's live count plus a muted `+N` for agents running in other projects.
- `GET /api/agent-monitor/sessions` and `/snapshot` accept `?cwd=<root>` to scope by project and return machine-wide totals alongside the scoped set.

### Fixed

- Live updates (SSE) now follow the active project via `?project=` on `/api/events` (`EventSource` can't send the project header), fixing repeated `503`s and missing live updates when another project's server was down. Rate Limits and Orphan Ports remain machine-wide and are labeled as such.

## v5.0.4 — Daemon-mode navigation & Copilot over MCP

### Fixed

- The **Hub** "Open" button and **Settings → Projects** links now switch the active project in daemon mode — the dashboard honors `?project=<id>` on load (previously these were dead ends). Settings → Projects shows the daemon port and no longer links to dead per-project ports.
- Corrected stale `:3001` references to the daemon port `:47000` (Slack approval links, generated `CLAUDE.md`, examples).

### Removed

- Dropped the legacy Copilot CLI shell wrapper. GitHub Copilot CLI now integrates over **MCP** exactly like Claude (`waymark init --platform copilot-cli`), with full policy enforcement, approval gating, and rollback. Copilot CLI is now **Supported** (previously experimental). Copilot Chat inside an IDE is a separate product and unaffected.

## v5.0.3 — Agent Monitor in daemon mode

### Fixed

- `/api/agent-monitor/*` is served machine-globally, so the `/agents` page works even when the active project has no live per-project server (previously `503`).

## v5.0.2 — Per-project data & project switcher

### Fixed

- The daemon now serves each project's data directly from its own database (selected by the `X-Waymark-Project` header), fixing the dashboard showing identical data for every project.
- Added the sidebar **Active Project** switcher; correct daemon-port display in the footer; the Hub no longer probes dead per-project ports.

## v5.0.1 — Daemon proxy fixes

### Fixed

- Corrected the daemon API proxy path prefix (was forwarding `/actions` instead of `/api/actions`) and a startup crash from forwarding an undefined `transfer-encoding` header. Fixed the GitHub Pages `stable` alias deployment.

## v5.0.0 — Unified Architecture

### Added

- **Global daemon** on a fixed port `47000` serving every project — one dashboard URL, one process (no more per-project port tracking).
- **Universal MCP** registration: one `waymark` entry serves all projects with stable tool names (`mcp__waymark__write_file`, etc.).
- Explicit project IDs, fully non-interactive `init`, **policy inheritance** (`"extends": "global"`), system-service auto-start, shell-prompt integration, managed `CLAUDE.md` (`update-instructions`), `relocate`/`doctor`, a global team roster, workspaces, and cross-project analytics endpoints.

See **v5 Unified Architecture → Overview & Migration** for the full guide. All v4 workflows continue to work.

## v4.9.2 — Security

### Security

- Upgraded `uuid` to 11.1.1 to resolve CVE-2026-41907 (missing buffer bounds check in `v3`/`v5`/`v6`). Only `v4` is used, so no API change.

## v4.9.0 — Notifications & analytics

### Added

- Active-block persistence across restarts (`active_blocks` table).
- HMAC-signed **webhook notifications** for pending/blocked/approved/rejected and block events.
- **Email approval tokens** — single-use 48 h one-click approve/reject links.
- Per-member notification preferences (email/webhook/per-event), editable in Team settings.
- Stats cards: Top Blocked Paths, Busiest Hours, Avg Approval Latency.

## v4.8.0 — Agent Monitor history and observability

### Added

- persisted completed sessions in the `agent_history` table
- History tab in Agent Monitor with agent, project, duration, tokens, turns, model, Waymark badge, and end time
- `⬡ Waymark` badge for sessions whose tool calls actually flowed through policy enforcement
- live token and context sparklines with burn-rate labeling
- port categorization, public/private indicators, and orphan-port kill
- full-content detail modal and longer prompt / tool-call capture
- SSE invalidation for the `agents` topic
- `waymark setup-hook` for Claude Code rate-limit monitoring
- token usage by project in the Stats view

## v4.7.0 — Major workflow expansion

### Added

- remediation engine endpoints wired for real risk scoring, policy evaluation, and recommendations
- `requireApprovalBash[]` and `allowedCommands[]`
- `POST /api/policy/test` and `GET /api/policy/hits`
- dashboard policy editor
- `GET /api/sessions/:id/diff`
- `GET /api/audit/export?format=csv|json`
- `POST /api/actions/:id/replay`
- `POST /api/actions/:id/approve-with-edit`
- `waymark explain <id>`
- `waymark watch`
- agent pause/resume controls, escalation deadline badges, selective rollback, hub pending banner
- `waymark init --dry-run`

### Fixed

- approval-time bash re-check to avoid stale approval races
- approval metadata recording on bash approvals
- session rollback auto-block evaluation
- validation of `/api/policy/test` action type

## v4.6.3 — Security patch release

### Security

- patched the vite path-traversal issue by upgrading to `vite 6.4.2`
- resolved additional transitive advisories through `npm audit fix`

### Changed

- aligned related Vite / Vitest dependencies
- removed workflow-file copying from the release pipeline to avoid PAT workflow-scope failures

## v4.4.2 — Agent Monitor API route fix

### Fixed

- stale compiled server output that was missing `/api/agent-monitor` route registration
- `/api/*` fallback behavior so unknown API routes return JSON 404 instead of dashboard HTML
- stale `ui-dist` and port assumptions in compiled output after rebuild

## v4.3.2 — Approvals inbox correctness

### Fixed

- the approvals page now shows policy-held pending actions from `action_log` in addition to routed approvals from `approval_requests`
- pending count and inbox ordering now reflect both approval systems together

## v4.1.0 — Agent Monitor + Copilot CLI first-class support

### Added

- `/agents` page and Agent Monitor collectors for Claude, Codex, and Copilot
- REST API routes under `/api/agent-monitor`
- `waymark agents` CLI command
- MCP tools for session, rate-limit, and port inspection
- first-class GitHub Copilot CLI support in `waymark init`
- generated `COPILOT.md` and MCP config merge into `~/.copilot/mcp-config.json`

### Changed

- API server mounts the agent-monitor router and shared collector
- CLI help and command registry now include `agents`
- dashboard sidebar includes Agents entry with live session count

## v4.0.0 — CLI install UX cleanup

### Added

- `way_marks` binary alias alongside `waymark`
- top-level `--version`, `-v`, `version`, `--help`, and no-args help behavior
- clearer unknown-command failure behavior with exit code 1
- global post-install banner for first-run guidance

### Why it mattered

This release fixed the common confusion where users installed `@way_marks/cli` and then typed `way_marks -v`, only to find there was no matching binary or a help banner that looked like a broken install.
