# Feature 05: Agent Monitor

> **Audience**: Engineering leads, DevOps/platform engineers, and security teams evaluating Waymark's observability capabilities.

---

## Overview

The Waymark Agent Monitor (`/agents`) is a live observability dashboard for every AI agent session running in your environment — Claude Code, Codex, and GitHub Copilot CLI. It shows what each agent is doing right now, what it has done in the past, and whether its actions are flowing through Waymark's policy enforcement layer.

---

## Business Case

| Problem | Impact | Waymark Solution |
|---------|--------|-----------------|
| Can't tell which AI sessions are policy-controlled | Blind spots in governance coverage | Waymark badge on every card |
| Agent history disappears when PID exits | No audit trail for completed sessions | Persistent `agent_history` table + History tab |
| Long tool args hard-truncated at 120 chars | Can't audit what the agent actually wrote | Full-content modal (up to 2000 chars) |
| No visibility into context pressure | Can't anticipate context exhaustion | Live context sparkline with color-coded pressure |
| Orphan dev-server processes accumulate | Port conflicts, resource waste | Port categorization + Kill button |
| Rate limit resets cause silent disruptions | Agent stalls unexplained | Rate limit monitoring via `waymark setup-hook` |
| No cross-project token attribution | AI cost attribution impossible | Token usage by project in Stats view |

---

## User Stories

### Story 1: The On-Call Engineer

> *"At 2 am I get paged that an AI agent is consuming 90% of our rate-limit window. I open the Waymark dashboard, see the context sparkline hitting red on one session, and confirm it's the nightly code-review bot — not a rogue session. I kill its orphan port and let the senior on-call know."*

**Features used:** F-49 (sparklines), F-50 (port kill), F-52 (rate limit monitoring)

### Story 2: The Security Lead

> *"Before a quarterly audit I need to confirm that every agent session in the past month was policy-controlled. I open the History tab, filter by `claude`, and export the list. Every row with a Waymark badge is confirmed. I flag the two rows without it for follow-up."*

**Features used:** F-47 (session history), F-48 (Waymark badge)

### Story 3: The Platform Engineer

> *"One of our monorepo agents is burning tokens 3× faster than others. I open Stats, scroll to Agent Token Usage by Project, and see `platform-services` at the top with 2.4M tokens — 5× the next project. I file a ticket to tighten its tool call scope."*

**Features used:** F-53 (token usage by project)

### Story 4: The Team Lead

> *"An agent just finished a 200-action refactor and its PID is gone. I go to Agent Monitor → History, find the session, and click into its tool calls. I can read the full bash command it ran (not truncated) and confirm it only touched `/src/api/**` as intended."*

**Features used:** F-47 (session history), F-51 (full-content modal)

---

## Feature Walkthrough

### Session Cards

Each running agent session is shown as a card in the **Sessions** tab. Cards display:

- **Status badge**: thinking / executing / waiting / rateLimited / done
- **Waymark badge** (`⬡ Waymark`): present if tool calls are policy-controlled
- **Token sparkline**: indigo polyline over the last 20 turns
- **Context sparkline**: color-coded (green < 60%, amber 60–85%, red > 85%)
- **Burn rate**: tokens added in the most recent turn (`+Nk/turn`)
- **Session metadata**: CWD, model, turns, compaction count

Click a card to expand the detail panel:

- Full session metadata (PID, context window, cache read tokens)
- Initial prompt preview (click **view full** to open modal)
- Tool calls list (first 8; expandable) — click any row to open full-content modal
- File accesses list (first 10; expandable)
- Child processes (port, PID, memory)

### Session History {#session-history}

The **History** tab shows all completed sessions persisted to the `agent_history` table. Sessions are added automatically when the agent process exits.

Filter by agent type. Columns: Agent, Project, Duration, Tokens, Turns, Model, Waymark, Ended.

```bash
# API
curl "http://localhost:3001/api/agent-monitor/history?limit=50&agent=claude"
```

### Waymark-Controlled Badge {#waymark-controlled-badge}

The `⬡ Waymark` badge appears when at least one of the session's tool calls has been recorded in Waymark's `action_log` table. This confirms policy enforcement was active — not just that Waymark was installed.

CLI output:
```
W  AGENT   STATUS   PID    TURNS  TOKENS  CWD
W  claude  thinking 12345  14     48.2k   /projects/api
   codex   done     12678  3      9.1k    /projects/web
```

### Rate-Limit Monitoring {#rate-limit-monitoring}

**Step 1 — Install the hook:**
```bash
waymark setup-hook
```

**Step 2 — Restart Claude Code.**

The Stop hook fires after every Claude response turn. It reads the session transcript, extracts rate-limit system messages, and writes `~/.claude/abtop-rate-limits.json`. The dashboard reads this file every 10 seconds.

When rate-limit data is present:
- Colored pills show each window's usage percentage and reset time
- A usage bar below each pill gives a visual representation of consumption

When data is absent, the tab shows the two-step setup guide.

### Token Usage by Project {#token-usage-by-project}

Available in **Stats** (`/stats`) → scroll to "Agent token usage by project". Groups completed sessions from `agent_history` by `project_name`, sums `total_input_tokens + total_output_tokens`, and shows the top 10 as a horizontal bar chart.

---

## Setup Guide

### Prerequisites

- Waymark server v4.6.3 or later (`@way_marks/server`)
- Waymark CLI v4.6.3 or later (`@way_marks/cli`)

### Basic Setup

The Agent Monitor requires no configuration beyond a running Waymark server. Open `http://localhost:3001/agents` after `waymark start`.

### Rate-Limit Hook Setup

```bash
# Install the Stop hook (idempotent — safe to run multiple times)
waymark setup-hook

# Restart Claude Code for the hook to activate
```

Verify by checking `~/.claude/settings.json` — it should contain:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "/Users/<you>/.claude/waymark-rate-limit-hook" }]
      }
    ]
  }
}
```

---

## Testing Guide

| Test | Steps | Expected |
|------|-------|----------|
| Session appears | Start a Claude Code session in a project | Card appears in Sessions tab within 3 s |
| Waymark badge | Use MCP tool call through Waymark | `⬡ Waymark` badge appears on card |
| Context sparkline | Run a long session (many turns) | Sparkline grows; color changes at 60% and 85% thresholds |
| History persistence | Wait for agent to finish | Session appears in History tab after PID exits |
| Port kill | Run `nc -l 3000 &` in terminal | Port 3000 listed as orphan; click Kill → process terminated |
| Rate-limit data | Run `waymark setup-hook`, restart Claude Code, run one agent turn | Rate-limit pills appear in Rate Limits tab |
| Full-content modal | Expand a session with bash tool calls | Click tool call row → modal shows untruncated command |
| Token by project | Run two sessions in different projects | Stats → bar chart shows both projects with correct token totals |

---

## Screenshots Index

See [`screenshots/INDEX.md`](./screenshots/INDEX.md) for annotated screenshots.

| Screenshot | Description |
|------------|-------------|
| `01-sessions-with-sparklines.png` | Session cards showing token and context sparklines, Waymark badge |
| `02-port-management.png` | Ports tab with category chips, visibility indicators, Kill button |
| `03-history-tab.png` | History tab with completed sessions, duration, tokens, Waymark column |
| `04-rate-limit-guide.png` | Rate Limits tab showing setup guide and usage bars |
| `05-full-content-modal.png` | Full-content modal opened from a tool call row |

---

## Related Features

- [F-47: Session History](../../FEATURES.md#f-47-agent-session-history)
- [F-48: Waymark Badge](../../FEATURES.md#f-48-waymark-controlled-session-badge)
- [F-49: Sparklines](../../FEATURES.md#f-49-live-sparklines--token-burn-rate)
- [F-50: Port Management](../../FEATURES.md#f-50-port-categorization-visibility--kill)
- [F-51: Full-Content Modal](../../FEATURES.md#f-51-full-content-tool-call-modal)
- [F-52: Rate-Limit Monitoring](../../FEATURES.md#f-52-rate-limit-monitoring--waymark-setup-hook)
- [F-53: Token Usage by Project](../../FEATURES.md#f-53-agent-token-usage-by-project-stats-view)

---

*Last updated: May 2026 — Waymark v4.6.3*
