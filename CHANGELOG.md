## [4.4.1] — 2026-04-30

### Added
- (Add changes here)

### Changed
- (Add changes here)

### Fixed
- (Add changes here)

---

## [4.4.0] — 2026-04-30

### Added
- (Add changes here)

### Changed
- (Add changes here)

### Fixed
- (Add changes here)

---

## [4.3.2] — 2026-04-30

### Fixed

- **Approvals page empty despite pending actions** — The `/approvals` inbox was always showing “Inbox zero” even with policy-held writes waiting. Root cause: two separate approval systems (simple per-file policy holds vs. multi-approver routing) were not connected in the UI. The approvals inbox now surfaces both types. Policy-held actions (from `requireApproval` in `waymark.config.json`) appear first with Approve / Reject buttons; multi-approver routing requests appear below them.

---

## [4.3.1] — 2026-04-30

### Fixed

- **Authorization check rejected everyone when no specific approvers were configured** — Approval routes with an empty approver list (meaning anyone can approve) were incorrectly blocking all approval attempts. Fixed so that an empty list correctly means “any reviewer may decide”.
- **No way to change reviewer identity from the UI** — Added a Reviewer ID field to the settings popover (top-right tweaks menu). The identity is saved across sessions and used when you approve or escalate requests. Fixes mismatches when a route requires a named approver.
- **Actions view stale after escalation decision** — The Actions list was not refreshing immediately after an escalation decision; it waited for the 30-second polling backstop. Now updates instantly.
- **Browser not live-updating after Slack approve / reject** — Clicking Approve or Reject in a Slack notification now pushes an instant update to every open browser tab via SSE, instead of waiting for the next poll.

---

## [4.3.0] — 2026-04-29

### Added
- (Add changes here)

### Changed
- (Add changes here)

### Fixed
- (Add changes here)

---

## [4.2.0] — 2026-04-29

### Added
- (Add changes here)

### Changed
- (Add changes here)

### Fixed
- (Add changes here)

---

## [4.1.0] — 2026-04-27

### Added — Agent monitor

A btop-inspired live view of every AI coding agent running on this machine.

- **New `/agents` dashboard page** — three tabs (Sessions / Rate Limits / Ports), agent + status filters, expandable session detail panel.
  - Session cards show: status badge, agent name, PID, age, project, current task, context-window progress bar, output tokens, turn count, memory, git diff stats, model.
  - Detects Claude Code, Codex CLI, and **GitHub Copilot CLI** sessions.
- **New `waymark agents` command** — fixed-column table; flags `--agent`, `--active`, `--json`, `--limit`.
- **New REST API** under `/api/agent-monitor/*` (sessions, rate-limits, ports, snapshot endpoints).
- **New MCP tools** — `list_agent_sessions`, `get_rate_limits`, `get_agent_ports` (read-only; intentionally bypass the action log).
- Sidebar **Agents** entry with live active-session count badge.

### Added — GitHub Copilot CLI as a first-class platform

Removed the EXPERIMENTAL label. Setup is now identical to Claude.

- `waymark init` auto-merges Waymark into `~/.copilot/mcp-config.json` (Copilot CLI's MCP config) using the required `"type": "local"` format.
- `waymark init` generates `COPILOT.md` (analog of `CLAUDE.md`) with Waymark tool-routing instructions for the Copilot agent.
- The agent monitor reads rich Copilot session data from `~/.copilot/session-state/<uuid>/` — `workspace.yaml` + incrementally-tailed `events.jsonl` — and surfaces model, token usage, turn count, current task, and tool-call list per session.

### Verified

End-to-end via Playwright against a sandbox project: dashboard load, all filter tabs, approve / reject / rollback workflow, agent monitor with both Claude and Copilot CLI sessions visible with rich metadata, sessions / stats / policy pages, the `waymark agents` CLI command in all flag combinations, all three MCP tools (with and without API up — graceful empty snapshot when offline), SIGTERM clean shutdown in 66 ms. 221 / 221 vitest passing on the server suite (includes 7 new fixture-based copilot collector tests + approve-write regression + raw-snapshot wire-shape regression).

### Hardened before tag

The first review pass surfaced 10 polish items. Seven landed in this same release rather than slipping to v4.1.1:

- **Single collector** — MCP no longer runs its own `MultiCollector`; it fetches snapshots from the API on demand (`fetchSnapshotFromApi()`).
- **Clean shutdown** — both agent-monitor `setInterval` timers `.unref()`d.
- **Server-side normalization** — `multi-collector.tick()` now returns `0` / `[]` (never `null`) for every session field, clamps `status` to the canonical `SessionStatus` union, and runs `redactSecrets()` over free-text fields at the boundary.
- **JSONL hardening** — every `JSON.parse(line)` in the collectors is wrapped in `try/catch`; new fixture-based `copilot.test.ts` locks the `ev.data` nesting contract.
- **Approve-write fix** — `approvals/handler.ts` resolves relative paths against `WAYMARK_PROJECT_ROOT`, matching the policy engine; regression test added.
- **Status taxonomy aligned** — front-end status sets mirror the canonical 5-value `SessionStatus` union.
- **Hygiene** — dead `feature-flag.js` deleted; `packages/server/src/ui-dist/assets/` `.gitignore`d.

Two additional bugs were uncovered by the end-to-end smoke and also fixed:

- **CLI `@way_marks/server` dep was pinned at `4.0.2`** — after the 4.1.0 workspace bump, npm pulled a stale published 4.0.2 into `cli/node_modules` instead of linking the local workspace. Bumped to `^4.1.0` so npm hoists the workspace symlink.
- **`/api/agent-monitor/snapshot` was returning the slim summary shape** (`tokens.input`, `subagentCount`) when both the MCP and the web's TS types expect the raw shape (`totalInputTokens`, `subagents` array). The MCP handlers crashed on `s.subagents.length` when the API was up; the web silently relied on `?? 0` guards. Switched to raw shape; `/sessions` keeps the slim summary for the CLI table view. Added `/snapshot` route regression test.

Remaining deferred items: full secret-redaction audit inside the Claude collector path (boundary normalization is in place); fixture tests for `claude.ts` / `codex.ts` (copilot has one); bundle still 19 KB over the 300 KB soft budget — accepted, on par with v3.2.

### Notes

- The agent monitor uses `ps`, `lsof`, and `git status --porcelain` on a 2-second tick (slow scans every 10 s). All collection is local — nothing leaves the machine.

---

## [4.0.1] — 2026-04-27

### Fixed

- **CI secret-scan false positive.** The `Check for secrets` step in `.github/workflows/ci.yml` was matching the bare prefix `npm_`, which fired on any reference to npm-defined env vars (`npm_config_global`, `npm_lifecycle_event`, etc.) — perfectly normal in install scripts. Tightened the regex to match only secret-shaped strings: `sk-ant-…` (Anthropic keys), `ANTHROPIC_API_KEY = "…"` (hardcoded assignments), and `npm_…` followed by 32+ alphanumerics (real publish tokens). v4.0.0 source unchanged; this is a CI-only hotfix.

---

## [4.0.0] — 2026-04-27

A consolidation release that rolls up the port-UX cleanup (v3.1), the cross-project Hub view (v3.2), and a focused round of CLI install-experience fixes.

### Added — CLI install experience

- **`way_marks` is now a valid binary.** The package is `@way_marks/cli` but the canonical binary is `waymark`; the install used to leave only the `waymark` name on PATH, so `way_marks -v` returned `command not found`. Both names now work; everything in the docs continues to use `waymark`.
- **`-v` / `--version` / `version`** — prints the installed `@way_marks/cli` version and exits 0. (Previously fell through to the help banner with exit 0, indistinguishable from a broken install.)
- **`-h` / `--help` / no-args** — prints a richer help banner that includes the version, mentions both binary names, and documents the `--port` precedence (flag > config > auto).
- **Unknown commands** now write `Unknown command: X / Run "waymark --help" for usage.` to stderr and exit 1 instead of silently dumping help and returning success.
- **Post-install banner** — global installs print a short "✓ @way_marks/cli@X.Y.Z installed. Run: waymark init / start / --help" notice. Surfaces reliably with `npm install -g --foreground-scripts @way_marks/cli`; otherwise the bare `waymark` invocation prints the same info on first run.

### Added — Hub view (originally v3.2)

A central command center for every Waymark instance on your machine. From any project's dashboard, see every registered project (running / paused / stopped), pause / resume / stop a peer, and garbage-collect old entries — without leaving the dashboard you're already in. New endpoints `POST /api/hub/projects/:id/{pause,resume,stop}` and `POST /api/hub/gc`. Cross-project requests use a same-machine `localhost:NNNN` CORS allowlist.

### Changed — Port UX (originally v3.1)

- **Default port range moved from `3001-4000` to `47000-47999`** to avoid collisions with mainstream dev-server defaults (Next.js, Rails, Strapi, etc.). Existing projects keep their port until next stop+start; on next start they reallocate from the new range with a one-line migration notice.
- **Per-project port pin** via `"port": 47100` at the top of `waymark.config.json`.
- **Runtime override** via `waymark start --port 47200`. Conflicts now error loudly instead of silently reassigning.

### Fixed

- **Three-way port disagreement** between `init`'s banner, `start`'s allocation, and the dashboard footer's hardcoded `:3001`. All three now read from a single source of truth.
- **CLAUDE.md** no longer hardcodes a port — it now points users at `npx @way_marks/cli status` for the live URL.
- **`/api/project`** payload now includes `projectRoot` so `Settings → Projects` shows the path.
- **Silent project-id collision** when two repos share a `kebabCase(basename)` is now a loud error that names both paths and never leaves orphan processes.

---

## [3.2.0] — 2026-04-27

### Added

**Hub view — central command center for every Waymark instance on your machine.**

Once you have more than one Waymark project running, a new `Hub` entry appears in the sidebar. From any dashboard:

- See every registered project (running, paused, stopped) with live action and pending counts probed in real time.
- **Pause / Resume** any peer's status flag, **Stop** any running peer (sends SIGTERM, releases the port), without leaving the dashboard you're already in.
- "**Clean up stopped**" garbage-collects registry entries for projects that have been stopped for more than 7 days.
- Your current dashboard is marked with a `this dashboard` chip and can't accidentally stop itself.

Cross-project requests use a same-machine peer CORS allowlist (`http://localhost:NNNN` only — never opens to remote origins). New endpoints: `POST /api/hub/projects/:id/{pause,resume,stop}` and `POST /api/hub/gc`.

This is a "no new daemon" Hub: every project's existing dashboard becomes a hub when it sees siblings. A future round may consolidate to a single multiplexed daemon — for now, this gives ~80 % of the central-command-center value with none of the migration complexity.

---

## [3.1.0] — 2026-04-26

### Added

**Per-project port pin and `--port` flag.** Stop fighting Next.js / Rails / Strapi for port 3000 territory. Set a stable port for a project once:

```json
// waymark.config.json
{ "port": 47100, "policies": { ... } }
```

Or override at runtime: `waymark start --port 47200`. Conflicts now error loudly with `"Port X is already in use → Run npx @way_marks/cli list to see other Waymark projects"` instead of silently reassigning.

### Changed

**Default port range moved from `3001–4000` to `47000–47999`.** The legacy range collided with mainstream dev-server defaults; the new range is in IANA "user ports" with no popular reservations. Existing projects stay on their assigned port until next stop+start, at which point they reallocate from the new range with a one-line migration notice that points to the new pin if you want bookmark stability.

### Fixed

- **Three-way port disagreement:** `init`'s banner advertised `:3001`, `start` allocated whatever was free, and the dashboard footer hardcoded `:3001`. Now: `init` doesn't mention a port (it can't know yet), `start` prints the real one, and the footer reads the live port from `/api/project` — single source of truth.
- **CLAUDE.md no longer hardcodes a port** — the dashboard URL changes per stop/start, so we now point at `npx @way_marks/cli status` for the live URL.
- **`/api/project`** payload includes `projectRoot` so `Settings → Projects` shows the path.
- **Silent project-id collision** when two repos share a `kebabCase(basename)` is now a loud error that names both paths and never leaves orphan processes.

---

## [3.0.0] — 2026-04-25

### Added
- See public v3.0.0 release notes (dashboard redesign).

### Changed
- (Add changes here)

### Fixed
- (Add changes here)

---

## [2.0.3] — 2026-04-26

### Added

**Dashboard UI redesign — full rewrite**
- New React + Vite + TypeScript dashboard in a new `packages/web` workspace, served by Express as static files from `packages/server/src/ui-dist/`. Token-driven design system (oklch palette, IBM Plex Sans/Mono, dark + light themes, density modes), 232 px sidebar + topbar + 560 px right-side detail drawer.
- Six fully-implemented screens: **Actions** (filter pills, session groups, side-by-side diff drawer, approve/reject/rollback), **Sessions** (live aggregate cards + atomic session rollback), **Approvals** (merged inbox over `/api/approvals/pending` + `/api/escalations/pending`, Pending / Escalated / History tabs), **Policy** (allowed paths · blocked paths · requires-approval · blocked commands with plain/regex distinction), **Stats** (stat cards, 5-hour activity sparkline, by-tool chart, hot-paths list), **Settings** (Preferences with reviewer identity · Team CRUD · Approval routes CRUD · Escalation rules CRUD · Remediation blocks · Projects/Hub picker).
- **Server-Sent Events** stream at `GET /api/events`; UI updates within ~400 ms of any mutation. 30 s polling kept as a backstop.
- **⌘K / Ctrl-K command palette** with grouped commands (Navigation · Commands · Actions); fuzzy-search any action by tool / id / target / status.
- **Accessibility**: focus traps on Drawer + ConfirmModal, axe-core (WCAG 2.1 AA) shows zero serious or critical violations on every route, contrast tightened in both themes.
- The legacy 1,453-line vanilla HTML dashboard has been removed. The server now serves a small "Dashboard not built" setup page if `ui-dist/` is missing.

### Changed

**Release pipeline**
- `scripts/release.sh` now bumps `packages/web/package.json` alongside cli and server, and rewrites the cli's `@way_marks/server` dependency pin to the new release version on every bump. The pre-bump validation requires all three workspace versions to match.
- `scripts/pre-release-check.sh` gained five new gates: web package name, web `private: true` enforcement, three-way version match, cli→server pin sync, and `packages/server/src/ui-dist/index.html` existence.
- `.github/workflows/release.yml` has a new "Verify dashboard built" step between build and publish.

### Fixed

- **Stale CLI dependency**: `@way_marks/cli` had been pinning `@way_marks/server` to `0.5.2` (drifted ~1.5 years). Now in lockstep with the release version on every publish.
- **Light-mode `.btn.primary` contrast** — text was hardcoded to dark, unreadable on the new light tokens.
- **Action row a11y** — eliminated `nested-interactive` violations by refactoring the row container to a non-interactive `<div>` with a single `<button>` covering the click area.

---

## [2.0.2] — 2026-04-21

### Added

**Enterprise Documentation & User Stories**
- Added comprehensive `docs/user-stories/` directory with 4 feature modules:
  - Feature 01: Team Approval Routing (with setup guide, testing guide, 4 screenshots)
  - Feature 02: Session-Level Rollback (with setup guide, testing guide, 4 screenshots)
  - Feature 03: Email Notifications (with setup guide, testing guide, 3 screenshots)
  - Feature 04: Multi-Platform Support (with setup guide, testing guide, 3 screenshots)
- User-stories now discoverable from main README with direct feature links
- Role-based navigation in user-stories (security leads, team leads, DevOps engineers)

### Changed

**CI/CD Release Pipeline**
- Updated `.github/workflows/release.yml` to include additional documentation in public releases:
  - `docs/user-stories/` synced via rsync with every release
  - `docs/COPILOT_CLI.md` copied to public repo
  - `docs/FAQ.md` copied to public repo
- Public repo now receives complete documentation set automatically

**Documentation**
- Added "User Stories & Feature Documentation" section to README.md
- Links now point to comprehensive enterprise feature guides
- Setup instructions and testing procedures publicly available

### Fixed

**Release Automation**
- CI/CD workflow now properly includes all documentation files
- Public users get complete guide set with every release
- Enterprise features fully documented and accessible

### Deployment Impact

✅ User-stories available in both private (dev) and public repos  
✅ CI/CD automatically syncs documentation to public releases  
✅ Enterprise customers can discover features from main README  
✅ Complete setup and testing guides included  
✅ 14 annotated screenshots (1280×720 PNG) with callouts  
✅ All tests passing (340/340)  
✅ Production-ready

---

## [2.0.1] — 2026-04-20

### Added

**Project File Management Improvements**
- Enhanced documentation explaining per-project configuration workflow
- Added clarity on which files are generated vs. version-controlled

### Changed

**Source Repository Management**
- Removed `waymark.config.json` from version control (it's per-project, generated by `waymark init`)
- Updated `.gitignore` to exclude per-project configuration and data files:
  - `waymark.config.json` — per-project policy configuration
  - `CLAUDE.md` — per-project MCP tool registration
  - `.waymark/` — per-project state directory
  - `waymark.db` and `data/waymark.db` — per-project database files

**Documentation**
- Updated README.md with v1.0.2 release notes and project setup workflow
- Clarified distinction between source repository files and per-project generated files
- Expanded CHANGELOG.md with acceptance tests and root cause analysis

### Fixed

**Source Repository Cleanliness**
- Per-project configuration files no longer pollute the source repository
- Database files properly excluded from version control
- Users can now confidently clone Waymark without per-project artifacts

### Status

✅ Source repository clean and ready for distribution  
✅ Per-project files properly managed by `waymark init`  
✅ All 182 tests passing  
✅ Ready for production use
