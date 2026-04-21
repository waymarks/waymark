# Waymark — User Stories & Feature Documentation

> **Audience**: Enterprise decision-makers, security leads, and team administrators evaluating Waymark for production deployment.

Waymark is an MCP (Model Context Protocol) middleware layer that sits between AI coding agents (Claude Code, GitHub Copilot CLI, etc.) and your codebase. It intercepts every file write and shell command, enforces your organization's policies, and makes every AI action auditable and reversible — without slowing down engineering velocity.

---

## Why This Matters for the Enterprise

AI coding agents are increasingly autonomous. Without governance controls, they can:

- Modify production configuration files without review
- Execute shell commands that have irreversible consequences
- Make sweeping changes across a codebase in a single session with no audit trail
- Operate without notifying the humans who are accountable for the outcome

Waymark solves this by acting as a policy enforcement point — think of it as a firewall and audit log for AI agent actions, integrated directly into the development workflow.

---

## Feature Index

| # | Feature | Business Value | Status |
|---|---------|---------------|--------|
| [01](./feature-01-approval-routing/) | [Team Approval Routing](./feature-01-approval-routing/README.md) | Human-in-the-loop control for sensitive changes | ✅ Production-ready |
| [02](./feature-02-session-rollback/) | [Session-Level Rollback](./feature-02-session-rollback/README.md) | Atomic undo for entire AI agent runs | ✅ Production-ready |
| [03](./feature-03-email-notifications/) | [Email Notifications](./feature-03-email-notifications/README.md) | SMTP-based alerts for pending approvals | ✅ Production-ready |
| [04](./feature-04-multi-platform/) | [Multi-Platform Support](./feature-04-multi-platform/README.md) | Consistent governance on Windows, macOS, and Linux | ✅ Production-ready |

---

## Documentation Structure

Each feature folder contains:

| File | Purpose |
|------|---------|
| `README.md` | Feature overview, business case, and user stories |
| `setup-guide.md` | Prerequisites, configuration reference, and environment setup |
| `testing-guide.md` | Step-by-step manual verification with expected outcomes |
| `screenshots/INDEX.md` | Annotated screenshot index with callout explanations |
| `screenshots/*.png` | 1280×720 annotated PNGs from the live dashboard |

## Screenshot Gallery

All screenshots are generated from the live Waymark dashboard (v1.0.2). Each PNG is 1280×720 with numbered yellow callouts identifying key UI elements.

| Feature | Screenshots |
|---------|-------------|
| [01 – Approval Routing](./feature-01-approval-routing/screenshots/INDEX.md) | 4 annotated PNGs — dashboard overview, blocked rows, policy section, allowed vs blocked |
| [02 – Session Rollback](./feature-02-session-rollback/screenshots/INDEX.md) | 4 annotated PNGs — rollback buttons, close-up, session grouping, approval connection |
| [03 – Email Notifications](./feature-03-email-notifications/screenshots/INDEX.md) | 3 annotated PNGs — email triggers, policy→email mapping, audit trail |
| [04 – Multi-Platform](./feature-04-multi-platform/screenshots/INDEX.md) | 3 annotated PNGs — macOS dashboard, cross-platform commands, architecture diagram |

---

## Quick Navigation

### By Role

**Security & Compliance Engineers**
- [Approval routing policies](./feature-01-approval-routing/README.md) — enforce who can authorize sensitive changes
- [Audit trail documentation](./feature-02-session-rollback/README.md#audit-trail) — session-level logging for compliance
- [Email alerting](./feature-03-email-notifications/README.md) — real-time notification for policy violations

**Engineering Leadership / Team Leads**
- [Approval routing](./feature-01-approval-routing/README.md) — delegate review responsibility without blocking velocity
- [Session rollback](./feature-02-session-rollback/README.md) — instant recovery from bad AI agent runs
- [Multi-platform support](./feature-04-multi-platform/README.md) — consistent controls across engineering environments

**DevOps / Platform Engineers**
- [Setup guide: Approval routing](./feature-01-approval-routing/setup-guide.md)
- [Setup guide: Email notifications](./feature-03-email-notifications/setup-guide.md)
- [Setup guide: Multi-platform](./feature-04-multi-platform/setup-guide.md)

---

## Supported Platforms (v1.0.2)

- **Claude Code** (recommended)
- **Claude Desktop**
- **GitHub Copilot CLI** (experimental)

---

## Dashboard

All actions, approvals, and rollbacks are visible in real-time at:

```
http://localhost:3001
```

---

*Generated for Waymark v1.0.2 — Last updated: April 2026*
