# Features Overview

Waymark groups its product surface into nine levels so teams can adopt it incrementally: start with interception and rollback, then grow into approvals, multi-project workflows, analytics, and live observability.

## Feature map

| Level | Features | Purpose |
|-------|----------|---------|
| 0 | F-01 to F-04 | Getting started |
| 1 | F-05 to F-08 | Core policy enforcement & logging |
| 2 | F-09 to F-11B | Human control: approvals, rollback & notifications |
| 3 | F-12 to F-16 | Multi-project & platform support |
| 4 | F-17 to F-21 | Team workflows & session management |
| 5 | F-22 to F-25 | Risk assessment & remediation |
| 6 | F-26 to F-28 | ML predictions & analytics |
| 7 | F-29 to F-32 | Enterprise persistence & streaming |
| 8 | F-33 to F-46 | Advanced policy, CLI & dashboard |
| 9 | F-47 to F-53 | Agent monitoring & observability |

## How to read the levels

- **Levels 0-2** make a single project safe enough to use daily.
- **Levels 3-4** add multi-project visibility, platform support, routing, and team operations.
- **Levels 5-7** add risk scoring, remediation, analytics, persistence, and streaming.
- **Levels 8-9** deepen the workflow with policy editing, session diffing, replay, watch mode, and the Agent Monitor.

## The feature families

### Safety and control

This includes the policy engine, action ledger, approvals, rollback, `requireApprovalBash`, and visual policy editing.

### Team operations

This includes sessions, project registry, hub view, approval routes, escalation rules, and cross-project lifecycle commands.

### Audit and analytics

This includes rule hit counts, audit export, summary analytics, remediation APIs, decision history, and token usage summaries.

### Observability

This includes agent sessions, history persistence, badges, sparklines, rate-limit monitoring, port management, and the live `waymark watch` terminal view.

!!! waymark "53 features, one execution layer"
    The numbering spans many releases, but the product stays cohesive because each feature extends the same core idea: intercept the action, decide what to do, record enough context to explain and recover it later.
