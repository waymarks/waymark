# Feature 01: Team Approval Routing

> **[← Back to Index](../README.md)** | [Setup Guide](./setup-guide.md) | [Testing Guide](./testing-guide.md)

---

## Overview

**Elevator Pitch**

Team Approval Routing gives organizations human-in-the-loop control over AI agent actions on sensitive resources. When an AI coding agent attempts to modify files or execute commands that match a policy rule, Waymark intercepts the action, holds it pending, and routes an approval request to the designated reviewer — before a single byte is written.

**The Problem It Solves**

AI agents operate at machine speed. Without a review gate, a single misconfigured prompt can propagate changes to database schemas, infrastructure configs, or secrets files before any human is aware. In regulated industries (finance, healthcare, government), this is not just a risk — it is a compliance failure.

Approval routing closes this gap without taking AI agents out of the workflow. Engineers keep their velocity; organizations keep their controls.

---

## Business Value

**Risk Mitigation**
Sensitive files — database schemas, deployment configs, environment secrets — require a second set of human eyes before they change. Approval routing enforces this automatically, regardless of which AI agent is in use or how it was prompted.

**Compliance & Audit Readiness**
Every approval request, approval decision (who, when, reason), and final execution is written to an immutable audit log. This satisfies audit requirements for change management controls under SOC 2, ISO 27001, and similar frameworks.

**Delegation Without Bottlenecks**
Routing rules can target specific reviewers by role or individual. A database schema change routes to the DBA. A Kubernetes config change routes to the platform team. No single approval queue becomes a bottleneck.

**Escalation on Stall**
If an approval request is not acted on within a configured timeout, Waymark automatically escalates to a secondary approver — ensuring changes are never silently stalled.

---

## Who Benefits

| Role | How They Benefit |
|------|-----------------|
| **CISO / Security Lead** | Enforces change-control policy on AI agents without banning them outright |
| **Compliance Officer** | Immutable approval trail satisfies audit evidence requirements |
| **Engineering Manager** | Delegates approval authority to domain experts (DBAs, platform team, etc.) |
| **Tech Lead / Senior Engineer** | Reviews and approves changes from the dashboard or a direct link — no context switching |
| **Developer** | Continues working with AI agents; approval gate is transparent and non-blocking for non-sensitive paths |

---

## When to Use This Feature

- Your organization has a formal change management policy (CAB, PR review, etc.) and needs AI agents to respect it
- Certain file types (`.env`, `schema.sql`, `terraform/`, `k8s/`) should never be modified without human sign-off
- You need to demonstrate to auditors that AI-generated changes to production-relevant files were reviewed
- Multiple teams share a codebase and you need domain-specific review routing (DBAs for schema, platform team for infra, security for secrets)

---

## User Stories

### Story 1: Enforcing Database Schema Review

```
As a Security Engineer
I want all AI-proposed changes to database schema files to be held for DBA approval
So that no migration reaches the codebase without expert review and audit evidence

Acceptance Criteria:
  [ ] Any write to src/db/migrations/** or schema.sql is intercepted and held
  [ ] The designated DBA receives an approval request immediately
  [ ] The AI agent receives a "pending approval" response and does not retry
  [ ] The DBA can approve or reject from the Waymark dashboard
  [ ] Approval includes a mandatory reason field captured in the audit log
  [ ] On approval, the original write executes exactly as submitted
  [ ] On rejection, the action is permanently blocked and reason is logged

Scenario: AI agent proposes a new migration file
  Given: src/db/migrations/** is listed in requireApproval policies
  And: Claude Code is mid-session working on a new feature
  When: Claude Code attempts to write src/db/migrations/0042_add_user_index.sql
  Then: Waymark intercepts the write and returns "pending approval" to the agent
  And: The DBA receives an approval notification within 30 seconds
  And: The migration file does not exist on disk until the DBA approves
```

---

### Story 2: Blocking Dangerous Shell Commands

```
As a DevOps Engineer
I want shell commands matching destructive patterns to require approval before execution
So that AI agents cannot accidentally drop databases, delete volumes, or overwrite production configs

Acceptance Criteria:
  [ ] Commands matching blockedCommands patterns are intercepted
  [ ] Agent receives a blocked response with reason
  [ ] Incident is logged with full command text, timestamp, and agent session ID
  [ ] Dashboard shows blocked commands in a dedicated "Security Events" view
  [ ] Optional: escalate blocked events to on-call engineer via email

Scenario: AI agent attempts to execute a DROP TABLE command
  Given: DROP TABLE is listed in blockedCommands policies
  And: An AI agent is performing a database cleanup task
  When: The agent executes: psql -c "DROP TABLE users;"
  Then: Waymark blocks the command before execution
  And: The agent receives: "Action blocked by policy: matches blockedCommands pattern"
  And: The incident is recorded in the audit log with full context
  And: An email alert is sent to the configured security contact
```

---

### Story 3: Multi-Level Approval for Production Deployments

```
As an Engineering Manager
I want deployment scripts targeting production to require approval from both the tech lead and myself
So that we have dual sign-off for all production changes, meeting our change management policy

Acceptance Criteria:
  [ ] Actions matching deploy/production/** require two distinct approvals
  [ ] First approver (tech lead) receives notification immediately
  [ ] Second approver (manager) is notified after first approval is recorded
  [ ] Action only executes after both approvals are captured
  [ ] If either approver rejects, the action is blocked and both parties are notified
  [ ] Escalation fires if either approval is not received within the configured window

Scenario: AI agent runs a production deployment script
  Given: deploy/production/ is configured with two-approver policy
  When: Claude Code executes: bash deploy/production/deploy.sh
  Then: Tech lead is notified for first approval
  And: After tech lead approves, manager is notified for second approval
  And: Deployment script only executes after both approvals are recorded
  And: The audit log shows both approvers, timestamps, and reasons
```

---

## Key Concepts

**Approval Routing Policy** — A rule in `waymark.config.json` that specifies which file paths or command patterns trigger an approval gate, and who the designated reviewer is.

**Pending Action** — An AI agent action that has been intercepted and is held in the Waymark queue until a human reviewer acts on it. The AI agent session is paused at this point.

**Atomic Execution** — When an approval is granted, the original action executes exactly as submitted — no modifications, no re-prompting. This ensures the action the reviewer approved is the action that runs.

**Escalation** — If a pending approval is not acted on within the configured timeout (default: 24 hours), Waymark automatically routes the request to a secondary reviewer defined in the policy.

---

## Related Features

- [Session-Level Rollback](../feature-02-session-rollback/README.md) — Even approved actions can be undone if the result is wrong
- [Email Notifications](../feature-03-email-notifications/README.md) — Approval requests delivered to reviewers' inboxes

---

*[Setup Guide →](./setup-guide.md)*
