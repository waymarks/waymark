# API Reference

Waymark's API is served by the local Express server started with `waymark start`. Routes are intended for the dashboard first, but they are also useful for automation, testing, and audit export.

!!! note "Policy route naming"
    Current source exposes config reads and writes at `GET /api/config` and `PUT /api/config/policies`. The `/api/policy/*` namespace is used for testing and telemetry (`test`, `hits`), not the main config document itself.

## Actions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/actions` | list recent actions; `?count=true` returns only pending count |
| GET | `/api/actions/:id` | fetch one action row |
| GET | `/api/actions/:id/status` | fetch a compact action status view |
| POST | `/api/actions/:id/approve` | approve a pending action |
| POST | `/api/actions/:id/reject` | reject a pending action |
| POST | `/api/actions/:id/rollback` | rollback a reversible `write_file` action |
| POST | `/api/actions/:id/replay` | replay a rolled-back write as a new action |
| POST | `/api/actions/:id/approve-with-edit` | approve a pending write using reviewer-edited content |

## Policy & config

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | return the active Waymark config |
| PUT | `/api/config/policies` | update policy arrays in `waymark.config.json` |
| POST | `/api/policy/test` | test a hypothetical path or command against current policy |
| GET | `/api/policy/hits` | aggregate rule-hit counts from the ledger |

## Sessions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sessions` | list sessions |
| GET | `/api/sessions/:id` | fetch session metadata |
| GET | `/api/sessions/:id/actions` | fetch all actions in a session |
| GET | `/api/sessions/:id/status` | fetch rollback state |
| POST | `/api/sessions/:id/rollback` | rollback the session |
| POST | `/api/sessions/:id/rollback-partial` | rollback selected action ids |
| GET | `/api/sessions/:id/diff` | return before/after patches for session writes |

## Audit

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/audit/export` | export audit data as JSON or CSV |

## Agent Monitor

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/agent-monitor/snapshot` | full raw snapshot of sessions, rate limits, and orphan ports |
| GET | `/api/agent-monitor/history` | persisted completed sessions |
| GET | `/api/agent-monitor/ports` | agent child ports plus orphan ports |
| GET | `/api/agent-monitor/sessions` | filtered live session list |
| GET | `/api/agent-monitor/sessions/:id` | full session detail |
| GET | `/api/agent-monitor/rate-limits` | summarized rate-limit data |
| DELETE | `/api/agent-monitor/ports/:pid` | terminate an orphan port process |

## Analytics

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/analytics/summary` | top blocked paths, busiest hours, approval latency, policy-accuracy placeholder fields |

## Remediation

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/remediation/assess` | score rollback or session risk |
| POST | `/api/remediation/evaluate-policy` | evaluate session against compliance and policy rules |
| POST | `/api/remediation/recommend` | return ranked remediation strategies |
| GET | `/api/remediation/blocks` | list active auto-blocks |
| POST | `/api/remediation/blocks/:block_id/unblock` | manually clear a block |

## SSE

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/events` | Server-Sent Events stream for live UI invalidation |

Current product surface uses topics including `actions`, `approvals`, `sessions`, `risk`, and `agents`.

## Related workflow APIs

These are important even though they sit outside the exact groups above:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/team/members` | list team approvers |
| POST | `/api/team/members` | add a team member |
| GET | `/api/approval-routes` | list approval routes |
| POST | `/api/approval-routes` | create an approval route |
| GET | `/api/approvals/pending` | list routed approvals |
| GET | `/api/escalations/pending` | list pending escalations |
| GET | `/api/hub/projects` | list registered peer projects for Hub |

## Example: test a rule

```bash
curl -X POST http://localhost:47000/api/policy/test \
  -H "Content-Type: application/json" \
  -d '{"path":"./src/db/schema.sql","action":"write"}'
```

## Example: export audit CSV

```bash
curl -OJ "http://localhost:47000/api/audit/export?format=csv"
```

## Example: inspect agent history

```bash
curl "http://localhost:47000/api/agent-monitor/history?limit=25&agent=copilot"
```
