## [3.0.0] — 2026-04-25

### Added
- (Add changes here)

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
