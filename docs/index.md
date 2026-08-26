# Waymark | AI Agent Governance Middleware

[![npm version](https://img.shields.io/npm/v/%40way_marks%2Fcli?label=npm&style=flat-square&color=6366f1)](https://www.npmjs.com/package/@way_marks/cli)
[![npm downloads](https://img.shields.io/npm/dm/%40way_marks%2Fcli?label=downloads&style=flat-square&color=10b981)](https://www.npmjs.com/package/@way_marks/cli)
[![GitHub Repo stars](https://img.shields.io/github/stars/shaifulshabuj/waymark?style=flat-square&color=f59e0b)](https://github.com/waymarks/waymark)

> Intercept, log, enforce policies on, and make reversible every file and shell action your AI agent takes.

Waymark sits between an AI coding agent and your machine. Instead of trusting prompt instructions such as “don’t touch `.env`” or “ask before schema changes,” it turns those expectations into a policy layer that can allow, hold, block, explain, and roll back actions in a consistent way.

For local development teams, that means you get a real action ledger instead of a vague summary. Every `read_file`, `write_file`, and `bash` call can be tied to a session, inspected in a dashboard, exported for audit, and—when it is a file write—reversed from the captured pre-change snapshot.

For platform and security teams, Waymark gives governance without changing the model. It supports Claude Desktop, Claude Code, and GitHub Copilot CLI, keeps data local, and layers together policy enforcement, human approval, rollback, agent monitoring, routing, escalation, and analytics across 53 features from F-01 to F-53.

<div class="hero-actions">
  <a class="md-button md-button--primary" href="getting-started/installation/">Install Waymark</a>
  <a class="md-button" href="getting-started/quickstart/">Quick start</a>
</div>

## What is Waymark?

Waymark is MCP middleware for AI agent operations. The CLI initializes a project, generates the platform instructions (`CLAUDE.md` and/or `COPILOT.md`), registers the MCP server, and starts the API + dashboard processes that back the policy engine and action ledger.

The server evaluates file and shell actions against `waymark.config.json` rules. Paths can be explicitly allowed, blocked, or held for approval. Bash commands can be blocked, queued with `requireApprovalBash`, or allowlisted with `allowedCommands`. If a rule matches, Waymark records the decision and the reason alongside the action.

When a write is approved or allowed, the action is still logged with before/after state. That is what makes rollback practical: the dashboard can restore the previous contents, selectively undo a session, replay a rolled-back write, or export the audit trail without depending on the agent to behave politely.

## Core outcomes

<div class="grid cards waymark-grid" markdown>
<div>
<h3>Control</h3>
<p>Default-deny file policies, blocked commands, allowlists, and approval queues turn governance into code.</p>
</div>
<div>
<h3>Observe</h3>
<p>The dashboard, action log, sessions view, hub, and agent monitor show what happened and what is happening now.</p>
</div>
<div>
<h3>Recover</h3>
<p>Before-snapshots, per-action rollback, session rollback, partial rollback, and replay reduce the cost of mistakes.</p>
</div>
<div>
<h3>Audit</h3>
<p>SQLite-backed history, export endpoints, approvals metadata, and rule hit telemetry give you a durable record.</p>
</div>
<div>
<h3>Approve</h3>
<p>Queue risky writes or bash commands for review, route them to approvers, and escalate when deadlines are missed.</p>
</div>
<div>
<h3>Multi-platform</h3>
<p>Use the same governance model across Claude Desktop, Claude Code, and GitHub Copilot CLI.</p>
</div>
</div>

## Quick start

```bash
npx @way_marks/cli init
```

Then choose your platform, start Waymark, and open the dashboard URL printed by `waymark start`.

!!! waymark "Start with the system, not the prompt"
    Waymark's design assumption is that human oversight should live in the execution layer. Policies, approvals, and rollback are stronger guarantees than hoping the agent continues to remember a warning embedded in a context window.

## Where to go next

- [Installation](getting-started/installation.md)
- [Quick Start](getting-started/quickstart.md)
- [Configuration reference](getting-started/configuration.md)
- [Feature map](features/index.md)
