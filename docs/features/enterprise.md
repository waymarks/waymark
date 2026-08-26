# Enterprise

The enterprise story in Waymark is about durability, streaming visibility, and cross-project operations. It is less about hosted SaaS and more about giving teams a stronger local control plane for many projects and many sessions.

## Covered features

- **F-29 — Real-time SSE streaming**
- **F-30 — Persistent decision history**
- **F-31 — Persistent policies**
- **F-32 — Database backends**

## Real-time SSE streaming

Waymark exposes `GET /api/events` as a Server-Sent Events stream for live dashboard invalidation. Recent releases also added an `agents` topic so the Agent Monitor can refresh immediately when sessions exit.

### Current event topics in the product surface

- `actions`
- `approvals`
- `sessions`
- `risk`
- `agents`

That means the UI can update on approval decisions, session changes, remediation assessments, and agent-monitor state without waiting for the next polling interval.

## Persistent decision history

Persistence is centered on SQLite tables, especially:

- `action_log`
- `action_archive`
- `sessions`
- `approval_requests`
- `approval_decisions`
- `escalation_requests`
- `escalation_decisions`
- `agent_history`

This gives teams a durable local audit record rather than ephemeral console output.

## Persistent policies

Policies live in `waymark.config.json`, and the API exposes mutation routes for them:

- `GET /api/config`
- `PUT /api/config/policies`
- `POST /api/policy/test`
- `GET /api/policy/hits`

The dashboard policy editor introduced in v4.7.0 writes back to that config file, so the visual editor and the policy engine stay in sync.

## Database backend reality

Current source uses **SQLite via `better-sqlite3`**. That is the production storage path in this repo today.

This is important for documentation accuracy: Waymark is persistence-oriented and enterprise-friendly, but it is not currently shipping multiple database adapters in source. The present backend story is:

- local SQLite database per project
- archive table for older actions
- machine-wide registry for project discovery
- schema migrations handled in startup code

## Export and migration support

Two capabilities make the local-first storage model more enterprise-friendly:

1. **audit export** via `GET /api/audit/export?format=csv|json`
2. **schema-on-start migrations** in the database layer so new releases can add columns and tables without a separate migration runner

## Why this matters at scale

Enterprise users need more than blocking rules. They need:

- live visibility when multiple agents are running
- history after sessions disappear
- consistent policy across many repos
- evidence for post-incident review
- export paths for compliance or reporting workflows

Waymark's architecture delivers that primarily through local persistence plus streaming updates.

!!! waymark "Enterprise here means durable control"
    The repo's current focus is strong local persistence, project registry, and live updates—not a cloud-only control plane. That makes it a good fit for teams that want governance without centralizing source data elsewhere.
