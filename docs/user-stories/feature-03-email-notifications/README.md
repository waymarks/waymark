# Feature 03: Email Notifications

> **[← Back to Index](../README.md)** | [Setup Guide](./setup-guide.md) | [Testing Guide](./testing-guide.md)

---

## Overview

**Elevator Pitch**

Email Notifications deliver real-time, actionable alerts to designated reviewers whenever an AI agent action requires human attention — approvals, rejections, escalations, and rollbacks — directly to their inbox, with one-click action links.

**The Problem It Solves**

Approval routing only works if reviewers actually see the requests. Without proactive notification, approvers must remember to check the Waymark dashboard manually — and pending actions stall or go unnoticed. In enterprise environments where approvers have full calendars and context-switching is costly, push notifications are not optional.

Email Notifications close this gap by delivering approval requests to the reviewer's existing workflow: their inbox. No new tool to check, no new channel to monitor.

---

## Business Value

**No New Tooling Required for Approvers**
Reviewers receive approval requests in standard email clients — Outlook, Gmail, Apple Mail — without installing anything. The email contains all the context needed to make a decision, plus a direct link to the dashboard action.

**Compliance-Grade Communication Records**
Every notification sent by Waymark is logged — to whom, when, for what action. This creates a demonstrable paper trail that approval requests were delivered, not just generated. In regulated environments, this distinction matters to auditors.

**Escalation Notification**
When an approval stalls past its configured timeout, Waymark automatically sends an escalation email to the designated secondary reviewer. Escalations are also logged, providing evidence that the organization followed its own escalation procedures.

**Event Coverage Beyond Approvals**
Notifications can be configured for a range of events: new pending action, approval granted, action rejected, session rollback initiated, and security block events. This keeps the right stakeholders informed at each stage of the AI agent governance lifecycle.

---

## Who Benefits

| Role | How They Benefit |
|------|-----------------|
| **Approver / Tech Lead** | Receives actionable approval requests in their inbox — no dashboard polling required |
| **Security Lead** | Gets immediate alerts on policy block events and escalations |
| **Engineering Manager** | Receives escalation notifications when approvals stall beyond SLA |
| **Administrator** | Configures SMTP once; all routing and templating is handled by Waymark |
| **Compliance Officer** | Has a delivery log of every notification sent, satisfying audit evidence requirements for notification procedures |

---

## When to Use This Feature

- Your team uses Waymark approval routing and approvers are not expected to monitor the dashboard continuously
- You need to demonstrate that approval requests were actively delivered (not just queued)
- Approval SLAs must be enforced and escalation needs to be automated
- Security events (blocked commands, policy violations) need to reach a security contact in near-real-time
- You are deploying Waymark across multiple teams and want a consistent notification experience without per-team dashboard setup

---

## User Stories

### Story 1: Approver Notified of Pending Database Migration

```
As a Database Administrator
I want to receive an email when an AI agent proposes a schema migration
So that I can review and approve or reject it from my inbox without checking the dashboard manually

Acceptance Criteria:
  [ ] Email is sent within 60 seconds of the action being queued
  [ ] Email subject clearly identifies the file path and action type
  [ ] Email body includes: file path, proposed content preview, requesting agent, timestamp
  [ ] Email includes a direct "Approve" link and a "Reject" link
  [ ] Clicking "Approve" in email executes the action and logs approval
  [ ] Clicking "Reject" in email blocks the action and prompts for a reason
  [ ] If no action is taken within the escalation window, a follow-up email is sent to the escalation contact

Scenario: Claude Code proposes a new migration file
  Given: src/db/migrations/** is in requireApproval and SMTP is configured
  When: Claude Code attempts to write src/db/migrations/0043_add_audit_table.sql
  Then: Waymark queues the action and sends an email to the configured DBA address
  And: Email arrives within 60 seconds with subject: "[Waymark] Approval Required: src/db/migrations/0043_add_audit_table.sql"
  And: DBA clicks "Approve" → action executes and DBA receives confirmation email
  And: Audit log shows email sent, link clicked, approval recorded
```

---

### Story 2: Security Team Alerted on Policy Block

```
As a Security Engineer
I want to receive an immediate email when a blocked command is attempted by an AI agent
So that I can investigate the agent's behavior and determine if intervention is needed

Acceptance Criteria:
  [ ] Block events trigger an email notification to the configured security contact
  [ ] Email includes: full command text, agent session ID, timestamp, policy rule matched
  [ ] Email is sent even if no human approval was involved (blocked paths/commands)
  [ ] Security engineer can view the full session context from a link in the email

Scenario: AI agent attempts to execute DROP TABLE
  Given: "DROP TABLE" is in blockedCommands and security alert email is configured
  When: An AI agent attempts: psql -c "DROP TABLE sessions;"
  Then: Command is blocked immediately
  And: A security alert email is sent within 60 seconds: "[Waymark Security Alert] Blocked command attempt"
  And: Email body contains: agent session ID, full command, timestamp, policy rule matched
  And: Email contains a link to the session in the Waymark dashboard
```

---

### Story 3: Manager Receives Escalation When Approval Stalls

```
As an Engineering Manager
I want to be notified when a pending approval has not been acted on within the SLA window
So that blocked AI agent sessions do not stall indefinitely and I can intervene

Acceptance Criteria:
  [ ] Escalation email is sent after the configured timeout (e.g., 4 hours) with no approval action
  [ ] Escalation email clearly identifies the original request, original approver, and how long it has been waiting
  [ ] Manager can approve or reject directly from the escalation email
  [ ] Escalation is logged in the audit trail as a separate event

Scenario: DBA does not respond to approval request within 4 hours
  Given: Escalation timeout is set to 4 hours for src/db/migrations/**
  And: A pending approval has been waiting for 4 hours with no action
  When: The escalation timer fires
  Then: An escalation email is sent to the engineering manager
  And: Email subject: "[Waymark] Escalation: Approval overdue — src/db/migrations/0043_add_audit_table.sql"
  And: Email body: original request details + "Waiting since [timestamp] — original approver: dba@acme.com"
  And: Audit log records the escalation event with timestamp
```

---

## Email Notification Types

| Event | Recipient | Subject Line Pattern |
|-------|-----------|---------------------|
| New pending approval | Configured approver | `[Waymark] Approval Required: {path}` |
| Approval granted | Action requester (agent owner) | `[Waymark] Approved: {path}` |
| Action rejected | Action requester (agent owner) | `[Waymark] Rejected: {path} — {reason}` |
| Escalation | Escalation contact | `[Waymark] Escalation: Approval overdue — {path}` |
| Security block event | Security contact | `[Waymark Security Alert] Blocked {type} attempt` |
| Session rollback | Session owner + configured contacts | `[Waymark] Session Rolled Back: {session name}` |

---

## Key Concepts

**SMTP Configuration** — Waymark uses standard SMTP to send email. It does not require a third-party email service — any SMTP relay (company mail server, SendGrid, AWS SES, Postfix) works.

**Notification Recipients** — Recipients are configured via environment variables (global defaults) or per-path in the approval routing config. Per-path recipients override the global default.

**Action Links** — Approve and Reject links in emails are cryptographically signed one-time tokens. They can only be used once and expire after the session retention window.

**Delivery Logging** — Waymark logs every email sent (to, timestamp, event type, action ID). Delivery receipts depend on the SMTP relay — Waymark does not track open/click rates natively, but the action-link activation is logged when used.

---

## Related Features

- [Team Approval Routing](../feature-01-approval-routing/README.md) — Notifications are the delivery mechanism for approval requests
- [Session-Level Rollback](../feature-02-session-rollback/README.md) — Rollback events can trigger notifications to session owners

---

*[Setup Guide →](./setup-guide.md)*
