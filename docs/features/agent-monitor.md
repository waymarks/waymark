# Agent Monitor

The Agent Monitor is Waymark's live observability layer for AI coding sessions. It combines active-session telemetry with persisted history so you can see what agents are doing now and what they did after the process has already exited.

## Project scope (v5.0.5)

The collector scans agents **machine-wide** — every Claude, Codex, and Copilot CLI process on the host, regardless of project. Inside a project dashboard that was confusing, so the **Sessions** list now defaults to the **active project**:

- A session belongs to the active project when its working directory is at or under the project root (subdirectories included).
- A `This project | All projects` toggle (persisted) switches between the scoped view and the full machine-wide list.
- The header shows **"N in &lt;project&gt; · M machine-wide"**, and the sidebar **Agents** badge shows the project's live count plus a muted `+N` for agents running in other projects.
- **Rate Limits** and **Orphan Ports** stay machine-wide — they aren't per-project — and are labeled as such.

Server-side, `GET /api/agent-monitor/sessions` and `/snapshot` accept `?cwd=<root>` to scope by project and return machine-wide totals (`machineWideCount` / `machineWide`) alongside the scoped set, so the dashboard shows both counts from a single request.

## Covered features

- **F-47 — Session History**
- **F-48 — Waymark-controlled badge**
- **F-49 — Live sparklines & burn rate**
- **F-50 — Port categorization, visibility & kill**
- **F-51 — Full-content detail modal**
- **F-52 — Rate-limit monitoring** (JSONL-based, no hook required)
- **F-53 — Agent token usage by project**

## Session History

Completed sessions are persisted to `agent_history` the moment the process exits. The History tab lets operators review Agent, Project, Duration, Tokens, Turns, Model, Waymark status, and end time even after the live PID is gone.

### `agent_history` schema

```sql
CREATE TABLE IF NOT EXISTS agent_history (
  session_id          TEXT PRIMARY KEY,
  agent_cli           TEXT NOT NULL,
  pid                 INTEGER,
  cwd                 TEXT,
  project_name        TEXT,
  started_at          INTEGER,
  ended_at            INTEGER,
  final_status        TEXT,
  total_input_tokens  INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  turn_count          INTEGER DEFAULT 0,
  compaction_count    INTEGER DEFAULT 0,
  model               TEXT,
  git_branch          TEXT,
  initial_prompt      TEXT,
  waymark_controlled  INTEGER DEFAULT 0
);
```

API:

```bash
curl "http://localhost:47000/api/agent-monitor/history?limit=50&agent=claude"
```

## Waymark-controlled badge

The `⬡ Waymark` badge is not cosmetic. It appears only when the session has tool calls recorded in `action_log`, which means policy enforcement actually intercepted that session rather than merely observing the process.

## Live sparklines & burn rate

Each session card can show:

- token sparkline
- context sparkline
- context pressure color coding (green, amber, red)
- burn-rate label such as `+Nk/turn`

That lets reviewers spot sessions that are close to exhaustion or unusually expensive without reading raw token counters only.

## Port categorization

Listening ports are grouped into categories:

- `browser`
- `api`
- `db`
- `system`
- `other`

Visibility is also derived from the binding address:

- `🌐` public-style bindings such as `0.0.0.0`, `*`, `:::`
- `🔒` localhost-only bindings

Orphan ports can be terminated through `DELETE /api/agent-monitor/ports/:pid`.

## Full-content detail modal

The Agent Monitor raised tool-argument and prompt capture from 120 characters to 2000 characters. Clicking a tool call row opens a scrollable modal so reviewers can inspect the full command or prompt context rather than a clipped preview.

## Rate-limit monitoring

Token usage on the Rate Limits tab is populated automatically by scanning Claude Code's JSONL transcript files (`~/.claude/projects/**/*.jsonl`). **No hook installation is required.**

### What is displayed

| Field | Description |
|---|---|
| **5h tokens** | Effective tokens in the rolling 5-hour window |
| **7d tokens** | Effective tokens in the rolling 7-day window |
| **Progress bar** | Shown when `planTokenLimit` is set in `~/.waymark/config.json` |
| **Reset countdown** | Time until the oldest turn in the 5h window expires |
| **Burn rate** | 30-min rolling average (tokens/min) with projected time to limit |
| **Model breakdown** | Per-model token share within the 5h window |

The effective-token formula mirrors Anthropic's billing:
```
effective = input_tokens + output_tokens + cache_creation_tokens + round(cache_read_tokens × 0.1)
```

### Optional: plan limit for percentage bars

```json
// ~/.waymark/config.json
{ "planTokenLimit": 880000 }
```

Typical values: 880 000 (Claude Pro), 4 400 000 (Claude Max 5×).

### Optional: `waymark setup-hook`

The CLI command installs a Stop hook that supplements with percentage data from Claude's session output. The token-count display works without it.

## Stats: Agent Token Usage by Project

The Stats view groups completed sessions by `project_name`, sums input and output tokens from `agent_history`, and shows the top 10 projects. This is the cost-attribution view for teams running agents across many repos.

## Core endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/agent-monitor/sessions` | list active sessions with filters |
| `GET /api/agent-monitor/sessions/:id` | full session detail |
| `GET /api/agent-monitor/snapshot` | raw snapshot for UI and MCP consumers |
| `GET /api/agent-monitor/rate-limits` | rate-limit summary |
| `GET /api/agent-monitor/ports` | agent child ports and orphan ports |
| `DELETE /api/agent-monitor/ports/:pid` | terminate an orphan port process |
| `GET /api/agent-monitor/history` | persisted completed sessions |

## Why it matters

The Agent Monitor closes a major observability gap: you can distinguish policy-controlled sessions from uncontrolled ones, retain history after exit, inspect full tool payloads, and see resource pressure live. That makes Waymark useful not only for approval workflows, but also for platform operations and audit readiness.

!!! waymark "Governance needs live telemetry"
    A blocked write is helpful. Knowing which agent is burning tokens, holding ports, or operating outside the policy path is what turns Waymark into a true control plane.
