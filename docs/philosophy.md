# Philosophy

> **Human oversight must be a property of the system, not a property of the agent.**

That is the core idea behind Waymark. Prompts can advise an agent to be careful, but they do not create enforcement, accountability, or reversibility. Waymark moves those guarantees into the execution path itself so they are applied whether the model is cautious, rushed, or simply wrong.

A modern coding agent can read files, write files, run shell commands, and fan out across a repo in seconds. The problem is not only raw capability; it is the mismatch between what humans can supervise comfortably and what agents can attempt automatically. Waymark closes that gap with structure: policy checks, approval boundaries, ledgers, sessions, rollback, and monitoring.

It is therefore not a model wrapper that tries to steer reasoning. It is governance middleware that constrains side effects, exposes actions, and preserves enough state to recover when needed.

## The three pillars

### 1. Control

Waymark's policy engine evaluates paths and commands in a deterministic order:

1. `blockedPaths`
2. `requireApproval` / `requireApprovalBash`
3. `allowedPaths` / `allowedCommands`
4. default deny for files, and whitelist-based default deny for bash when `allowedCommands` is populated

This is where default-deny matters. Sensitive paths such as `.env`, secrets, system locations, or database directories stop being advisory warnings and become enforced boundaries.

### 2. Observe

Oversight is impossible without visibility. Waymark records actions in SQLite, groups them into sessions, surfaces them in the dashboard, exposes them through the API, and extends monitoring to live agent sessions, rate limits, ports, and token usage. You can review what was attempted, what was blocked, what was approved, and what is still running.

### 3. Recover

Logging alone is not enough if a bad write has already happened. Waymark stores before-snapshots for reversible actions, lets you roll back a single action, undo a session, selectively undo a subset of writes, or replay a rolled-back write as a fresh action. Recovery turns experimentation from a cliff into a reversible workflow.

## Design principles

### Non-interference

Waymark is designed to be transparent to the agent's workflow. The agent still uses the familiar file and shell tools; Waymark intercepts and governs them rather than forcing a totally different working model.

### Structural over instructional guarantees

A sentence in a prompt is weaker than a rule in a policy engine. Waymark prefers system-level guarantees—policy evaluation, approval checks, audit tables, rollback data—over reminding the model to behave.

### Layered trust, not binary trust

Not every action deserves the same treatment. Some paths should be allowed immediately, others should always be blocked, and a meaningful middle tier should wait for human approval. Waymark treats trust as layered rather than all-or-nothing.

### Persistence over ephemerality

A dashboard with session history and a durable action ledger is more useful than a transient log stream. The design favors records you can revisit, search, export, and reason about after the session has ended.

### Local-first, no cloud dependency

Waymark stores its database under `.waymark/waymark.db`, keeps the registry on the local machine, and does not require a hosted control plane. That makes it practical for private repos, regulated work, and teams that want auditability without shipping code history to a third party.

## The problem Waymark is responding to

1. **Opacity** — you often see results, not the full sequence of actions that produced them.
2. **Irreversibility** — file writes overwrite state unless someone captured the before image.
3. **Unconstrained access** — many agents can reach any readable or writable path they can see.
4. **Trust without verification** — “don’t touch `.env`” lives in a prompt, not in enforcement.
5. **No human checkpoint** — there is often no structured pause before a risky write or command executes.
6. **Blind fleet** — without monitoring, teams cannot distinguish policy-controlled sessions from ungoverned ones across machines and projects.

!!! waymark "Waymark solves execution governance"
    It does not claim that a better dashboard makes the model wiser. The point is to make harmful or high-risk side effects easier to prevent, inspect, and reverse.

## What Waymark does not do

- It **does not control the model** or change the model's internal reasoning.
- It **does not inspect chain-of-thought** or expose hidden reasoning.
- It **does not replace code review** or human judgment about code quality.
- It **does not prevent all harm**. External side effects, incorrect policies, and risky approvals still require care.

## Why this framing matters

Waymark is most useful when you treat it as infrastructure rather than as a prompt add-on. Once governance lives in config, API routes, dashboards, and rollback data, it becomes repeatable across projects, agents, and teams. That is the difference between an agent that was asked to be safe and a system that was built to make safety observable and enforceable.
