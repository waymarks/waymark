# ML & Analytics

Waymark's Level 6 feature band is best understood as **analytics-first and ML-ready**. Current releases expose real aggregated analytics and rich telemetry, while the repository documentation is careful not to overstate a trained prediction model where one has not yet shipped.

## Covered features

- **F-26 — ML risk prediction**
- **F-27 — Decision history**
- **F-28 — Predictive analytics dashboard**

## Current reality: heuristics plus analytics

Today's codebase ships:

- SQL-backed summary analytics via `GET /api/analytics/summary`
- persisted decision history in `action_log`
- persisted completed agent sessions in `agent_history`
- risk scoring and compliance evaluation through remediation APIs

The older remediation docs explicitly note that a learned ML predictor is not yet present. That means you should treat Level 6 as an analytics and telemetry layer with room for future prediction, not as a black-box model making autonomous decisions.

## The effective model today

If you need a practical description of the current “model,” it is this:

1. **policy decisions** are deterministic rule evaluation
2. **risk scoring** is heuristic and factor-based
3. **analytics** are SQL aggregations over historical actions and sessions
4. **dashboards** surface those results for review and tuning

## Decision history data

Two tables are especially important:

### `action_log`

The action ledger stores decisions, matched rules, policy reasons, status, approval metadata, and rollback markers. This is the historical base for answering questions such as:

- what is being blocked most often?
- where do approvals accumulate?
- which paths are noisy but harmless?
- how long does approval take?

### `agent_history`

Completed agent sessions persist after the PID exits, making it possible to analyze token usage, duration, turn count, model usage, and whether a session was actually Waymark-controlled.

## Analytics endpoint

`GET /api/analytics/summary` returns a compact SQL-generated summary:

```json
{
  "top_blocked_paths": [],
  "busiest_hours": [],
  "avg_approval_latency_minutes": 0,
  "policy_accuracy": {
    "false_positives": 0,
    "true_positives": 0
  }
}
```

That gives you operational visibility without requiring a trained model pipeline.

## Dashboard analytics use cases

- identify the most frequently blocked paths
- understand the busiest action windows by hour
- measure average approval latency
- rank projects by agent token consumption
- compare live vs completed sessions in the Agent Monitor

## What a future trained model could use

If Level 6 evolves into a learned predictor, the repo already contains strong candidate signals:

- decision outcomes from `action_log`
- risk and remediation labels
- approval / rejection timestamps
- session metadata and turn counts
- token usage and compaction counts from `agent_history`
- platform, model, and project attribution

That historical record is the part that matters most: it makes future prediction possible without requiring teams to rebuild their observability layer from scratch.

!!! tip "Use analytics to tune policy"
    In practice, the fastest value comes from reviewing blocked paths, approval latency, and session history. Those signals tell you which rules are useful, which are noisy, and where human review is creating friction.
