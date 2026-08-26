# Team & Sessions

Waymark's team workflow features build on top of the action ledger. Sessions group related actions into one unit of review, while routing and escalation define who gets to approve sensitive operations and how that responsibility moves when nobody responds in time.

## Covered features

- **F-17 — Sessions**
- **F-19 — Team management**
- **F-20 — Approval routing rules**
- **F-21 — Escalation management**

## Sessions as the operational unit

A `session_id` groups the actions from one agent run. Sessions support:

- timeline review
- action counts
- rollback status
- unified diff generation
- full-session rollback
- partial rollback on selected writes

## Sessions data

The SQLite `sessions` table stores the high-level lifecycle:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  project_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  rolled_back_at DATETIME,
  status TEXT NOT NULL DEFAULT 'active'
);
```

The API surfaces that data through `GET /api/sessions`, `GET /api/sessions/:id`, and `GET /api/sessions/:id/status`.

## Team members

Team approvers live in `team_members` with name, email, role, status, and optional Slack identifiers.

```bash
curl http://localhost:47000/api/team/members
curl -X POST http://localhost:47000/api/team/members \
  -H "Content-Type: application/json" \
  -d '{"member_id":"alice-id","name":"Alice Chen","email":"alice@example.com"}'
```

## Approval routing rules

Approval routes decide which sessions need extra review and who should approve them. A route defines:

- name and description
- `condition_type`
- optional `condition_json`
- required approver count
- approver identities

Common route types from the project docs include:

| Condition type | Meaning |
|---|---|
| `all_sessions` | every matching workflow requires approval |
| `tool_name` | trigger when a session includes a particular tool such as `bash` |
| `action_count` | trigger for large or high-impact sessions |
| `risk_level` | trigger based on remediation or rollback risk |

## Escalation management

When an approval request is pending too long, escalation rules can move it to a wider or more senior audience. The database includes:

- `escalation_rules`
- `escalation_requests`
- `escalation_decisions`

The dashboard uses escalation deadline badges to show urgency—amber when a deadline is close, red when overdue.

## Key APIs

| Endpoint | Purpose |
|---|---|
| `GET /api/sessions` | list sessions |
| `GET /api/sessions/:id/actions` | get actions in a session |
| `GET /api/sessions/:id/diff` | per-file patch list for write actions |
| `POST /api/sessions/:id/rollback` | rollback the full session |
| `POST /api/sessions/:id/rollback-partial` | rollback selected action ids |
| `GET /api/approval-routes` | list routing rules |
| `POST /api/approval-routes` | create a routing rule |
| `GET /api/approvals/pending` | list routed approvals |
| `GET /api/escalations/pending` | list escalations awaiting action |

## Hub aggregate view

For operators running several Waymark-enabled repos, the Hub view rolls session and pending information up across projects. That makes the project-local sessions table useful for day-to-day work and the hub useful for fleet-style oversight.

!!! tip "Use routing for reviewable risk, not every action"
    Sessions are most useful when they reduce noise. Let obvious low-risk work flow automatically, and reserve route-based approvals for actions where a human decision adds real value.
