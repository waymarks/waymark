# Feature 02: Session-Level Rollback

> **[← Back to Index](../README.md)** | [Setup Guide](./setup-guide.md) | [Testing Guide](./testing-guide.md)

---

## Overview

**Elevator Pitch**

Session-Level Rollback lets any authorized user undo an entire AI agent run in a single click — atomically restoring every file the agent touched to its exact pre-session state, with no manual hunting through diffs.

**The Problem It Solves**

An AI agent session can span dozens of file writes. If the result is wrong — wrong approach, wrong scope, unexpected side effects — the traditional recovery path is to manually identify every changed file, read the diff, and hand-revert each one. At scale, this is error-prone and time-consuming.

Session-Level Rollback eliminates this entirely. Waymark tracks every write in a session as a grouped, atomic unit. One rollback action restores all of them — including reversing file deletions and undoing overwrites — as if the session never happened.

---

## Business Value

**Instant Recovery**
A bad AI agent run that touches 30 files can be fully reversed in seconds, not hours. This reduces the blast radius of any AI-generated mistake to near zero — provided the operation was reversible.

**Confidence to Experiment**
Teams are more willing to use AI agents for exploratory or large-scope tasks when they know a complete undo is always available. Rollback is the safety net that makes ambitious AI-assisted refactors viable.

**Reversibility Validation**
Waymark proactively flags operations that cannot be rolled back (e.g., a `DROP TABLE` that executed, an external API call). This gives teams an honest picture of what is and is not recoverable before they commit to a session's output.

**Compliance & Incident Response**
When something goes wrong in a regulated environment, the ability to demonstrate a clean rollback — with a before/after snapshot logged — is valuable evidence that the organization has effective AI governance controls in place.

---

## Who Benefits

| Role | How They Benefit |
|------|-----------------|
| **Engineering Manager / Tech Lead** | Can confidently authorize AI agent use on large refactors, knowing recovery is one click away |
| **Developer** | Can experiment freely with AI-assisted changes and undo entire sessions if the direction is wrong |
| **DevOps / Platform Engineer** | Can recover from AI-generated infrastructure-as-code mistakes without manual file archaeology |
| **Compliance Officer** | Has a documented, timestamped record of what was written, what was rolled back, and when |
| **Incident Responder** | Can immediately restore a known-good state during an incident without hunting through git history |

---

## When to Use This Feature

- An AI agent has made widespread changes across a codebase and the result is not what was intended
- A developer used an AI agent for exploratory refactoring and wants to discard the entire attempt cleanly
- An AI agent session modified infrastructure or deployment config files and the changes need to be reverted before deployment
- Post-incident, you need to restore a known-good state quickly and demonstrate the recovery in an audit

---

## User Stories

### Story 1: Rolling Back a Botched Refactor

```
As a Developer
I want to undo an entire AI agent session in one action
So that I can discard a bad refactoring attempt without manually reverting dozens of files

Acceptance Criteria:
  [ ] All file writes from the session are grouped in the dashboard under a single session entry
  [ ] A single "Rollback Session" button reverses all writes atomically
  [ ] Files created by the agent are deleted
  [ ] Files modified by the agent are restored to their pre-session content
  [ ] Files deleted by the agent are restored
  [ ] A confirmation message lists every file affected by the rollback
  [ ] The rollback event is logged in the audit trail with timestamp and initiator

Scenario: Developer wants to discard an entire AI refactor session
  Given: Claude Code has completed a session writing to 15 files
  And: The developer reviews the result and decides the approach is wrong
  When: The developer clicks "Rollback Session" in the Waymark dashboard
  Then: All 15 files are atomically restored to their pre-session state
  And: The dashboard confirms the rollback with a list of restored files
  And: The audit log records the rollback with the initiator's identity and timestamp
```

---

### Story 2: Pre-Deployment Sanity Check with Rollback Option

```
As a Tech Lead
I want to review all files changed by an AI agent session before they are committed
So that I can roll back the entire session if the changes do not meet quality standards

Acceptance Criteria:
  [ ] Session view in dashboard shows all files written, with before/after diffs
  [ ] Tech lead can approve individual files or roll back the whole session
  [ ] Rollback can be executed even after the agent session has ended
  [ ] Session data (before snapshots) is retained until explicitly cleared or committed

Scenario: Tech lead reviews AI agent output before merge
  Given: An AI agent session has completed writing a new feature
  When: The tech lead opens the session in the Waymark dashboard
  Then: A diff view shows every file changed, with the original content alongside
  And: The tech lead can choose to roll back the session if any file is unsatisfactory
  And: The rollback restores all session files regardless of which specific file triggered the decision
```

---

### Story 3: Partial Rollback Communication (Irreversible Operations)

```
As a Security Engineer
I want Waymark to clearly identify which operations in a session cannot be rolled back
So that I can make informed decisions about session approval and incident scope

Acceptance Criteria:
  [ ] Waymark marks each operation in a session as "reversible" or "irreversible"
  [ ] Irreversible operations (shell commands with external side effects, etc.) are flagged visually
  [ ] If a rollback is initiated on a session containing irreversible operations, a warning is shown
  [ ] The rollback proceeds for all reversible operations while documenting which ones it could not undo
  [ ] The audit log clearly distinguishes between rolled-back and non-rollback-able operations

Scenario: Session includes both file writes and an irreversible command
  Given: A session contains 8 file writes (reversible) and 1 external API call (irreversible)
  When: The rollback is initiated
  Then: All 8 file writes are reversed
  And: A warning is displayed: "1 operation could not be rolled back: external API call at [timestamp]"
  And: The audit log records both the rolled-back operations and the irreversible one
```

---

## Key Concepts

**Session** — A grouped unit of all AI agent actions (file writes, shell commands) that occur within a single agent invocation. Sessions are automatically created and named by Waymark when an agent begins working.

**Before Snapshot** — For every file write, Waymark captures the file's content immediately before the write occurs. This snapshot is what makes rollback possible — it's the source of truth for restoration.

**Atomic Rollback** — "Atomic" means all-or-nothing. Either every reversible operation in the session is undone, or none are. This prevents partial rollbacks that could leave the codebase in an inconsistent state.

**Reversibility Validation** — Before a session completes, Waymark evaluates whether each operation can be rolled back. File creates, modifies, and deletes are reversible. External side effects (API calls, database mutations executed directly) are flagged as irreversible.

**Session Retention** — Before snapshots are retained for a configurable period (default: 7 days) or until the session is explicitly cleared. After retention expires, rollback is no longer available for that session.

---

## Related Features

- [Team Approval Routing](../feature-01-approval-routing/README.md) — Use approval gates to prevent sessions you'd need to roll back from ever executing
- [Email Notifications](../feature-03-email-notifications/README.md) — Notify team members when a session rollback is initiated

---

*[Setup Guide →](./setup-guide.md)*
