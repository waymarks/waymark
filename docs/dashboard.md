# Dashboard Guide

The Waymark dashboard is the browser control plane for everything the middleware captures and decides.

## URL

Since v5, a single **global daemon** serves every project at one fixed URL:

```text
http://localhost:47000
```

Start it once with `waymark daemon start`. Every view shows data for the **active project** — switch projects from the **Active Project** dropdown in the sidebar (or by clicking **Open** in the Hub). The sidebar footer always shows the daemon port `:47000`; raw per-project ports are an internal detail in daemon mode.

> In legacy per-project mode, `waymark start` prints a project-specific URL in the `47000-47999` range instead.

## Main areas

### Actions

The Actions view is the event ledger:

- filter by status, tool, decision, and search term
- inspect matched policy rules and reasons
- approve or reject pending actions
- roll back reversible writes
- pivot from paths or sessions into deeper review

### Approvals

The approvals inbox combines direct policy-held actions with routed approval requests.

- pending items appear with urgency
- escalation deadline badges highlight risk
- approve, reject, or approve-with-edit from the drawer
- routed team approvals and simple policy holds share the same review surface

### Sessions

The Sessions view groups actions by `session_id`.

- inspect the timeline for one run
- roll back the full session
- roll back selected writes only
- review session diffs before undoing anything

### Agents

The Agent Monitor adds live observability:

- btop-style active-session view
- Session History tab for completed sessions
- sparklines, context pressure, and burn rate
- tool-call and prompt detail modals
- ports view with public/private indicators and Kill buttons
- rate-limit setup guidance and status

### Stats

The Stats area surfaces analytics such as:

- top blocked paths
- busiest hours
- average approval latency
- agent token usage by project

### Hub

When more than one project is registered, Hub shows a machine-wide overview of peer Waymark instances.

- running / paused / stopped projects
- live port links
- peer action and pending counts
- pause, resume, stop, and cleanup controls

### Settings

Waymark's settings surface includes policy management and reviewer identity controls. Current releases also include a policy editor that writes back to `waymark.config.json`.

## Day-to-day workflow

1. start Waymark in a repo
2. keep Actions open while the agent works
3. move to Approvals when a pending decision appears
4. inspect Sessions when you want the full run context
5. use Agents and Stats for cross-session visibility

## UI details worth knowing

- dark mode can follow `prefers-color-scheme`
- browser tab title can show pending count
- SSE updates keep action and agent views fresh
- the dashboard falls back to a helpful setup banner if UI assets are not built

## Typical review loop

```text
Agent runs → policy evaluates → dashboard updates → human reviews pending work → action is approved/rejected/rolled back → session and analytics views update
```

!!! tip "Keep Actions and Agents open together"
    Actions tells you what the governed tools are doing. Agents tells you which live session is consuming tokens, holding ports, or operating outside the policy path.
