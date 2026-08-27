https://github.com/user-attachments/assets/ed36654a-29c4-46ee-b331-5b9afde2b932

# waymark

**Human oversight as a property of the system, not a property of the agent.**

Waymark is MCP middleware that sits between an AI agent and the filesystem. Every `write_file` and `bash` call is evaluated against your policy before it touches anything — blocked, held for approval, or logged and allowed. Nothing the agent does is permanent until you say so.

[![npm downloads](https://img.shields.io/npm/dm/%40way_marks%2Fcli?label=%40way_marks%2Fcli&style=flat-square&color=6366f1)](https://www.npmjs.com/package/@way_marks/cli)
[![npm downloads](https://img.shields.io/npm/dm/%40way_marks%2Fserver?label=%40way_marks%2Fserver&style=flat-square&color=10b981)](https://www.npmjs.com/package/@way_marks/server)
[![npm version](https://img.shields.io/npm/v/%40way_marks%2Fcli?label=version&style=flat-square&color=374151)](https://www.npmjs.com/package/@way_marks/cli)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue?style=flat-square&logo=github)](https://shaifulshabuj.github.io/waymark/)

![npm download chart](./assets/npm-downloads.svg)

> 📖 **[Full documentation →](https://shaifulshabuj.github.io/waymark/)** — installation, CLI and API reference, policy engine, approvals, rollback, agent monitor, and philosophy.

---

## Three pillars

**Control** — policy lives in `waymark.config.json`, not in a system prompt. An agent cannot forget a rule, be jailbroken past it, or accumulate enough context to override it. Every tool call is evaluated in Node.js process space before the filesystem is touched.

```
blockedPaths    → BLOCK    (hard deny — secrets, system files)
requireApproval → PENDING  (human must approve before execution)
allowedPaths    → ALLOW    (execute immediately, log it)
(default)       → BLOCK    (unknown paths are rejected)
```

**Observe** — the action ledger records every tool call to SQLite with decision, reason, output and timestamps. A dashboard runs at `localhost:47000`, `waymark watch` gives a terminal view, and the Agent Monitor shows every AI session on the machine as a live table.

**Recover** — before-snapshots are captured at write time. A single action can be rolled back, or an entire session undone atomically in reverse order. Approving a write knowing you can undo it is categorically different from approving without a net.

---

## Quickstart

**Zero install:**

```bash
cd your-project
npx @way_marks/cli init --yes   # config + CLAUDE.md, register MCP
npx @way_marks/cli start        # start server, open the dashboard
```

**Global install with daemon:**

```bash
npm install -g @way_marks/cli
waymark global-setup            # register the MCP entry once, across all hosts
cd your-project
waymark init                    # project init (idempotent)
waymark daemon start            # one daemon at localhost:47000 for all projects
```

Restart Claude Desktop, or reload your Claude Code session, to pick up the MCP server.

[Installation guide →](https://shaifulshabuj.github.io/waymark/latest/getting-started/installation/) · [Quickstart →](https://shaifulshabuj.github.io/waymark/latest/getting-started/quickstart/) · [Configuration →](https://shaifulshabuj.github.io/waymark/latest/getting-started/configuration/)

---

## Platform support

| Platform | Status | Setup |
|---|---|---|
| Claude Desktop | ✅ Recommended | `waymark init` |
| Claude Code | ✅ Recommended | `waymark init` |
| GitHub Copilot CLI | ✅ Supported | `waymark init` |
| GitHub Copilot Chat | ⏳ Future | Waiting on GitHub MCP |
| CodeWhisperer, Codeium, others | ⏳ Future | Waiting on MCP adoption |

Runs on Windows, macOS and Linux. [Platform guide →](https://shaifulshabuj.github.io/waymark/latest/features/platforms/)

---

## Part of a suite

| Tool | Role | What it does |
|---|---|---|
| devloop | Build | Multi-agent dev pipeline — architect → worker → reviewer |
| **waymark** | **Run** | **Policy enforcement and observability for AI agents** |
| teststop | Break | Adversarial scenario testing — acts as a real, impatient user |
| [docuflow](https://github.com/doquflows/docuflow) | Document | Decision-context wiki for AI agents |

---

## Releases

Current release: **v6.0.0** — see the [changelog](https://shaifulshabuj.github.io/waymark/latest/changelog/) or [CHANGELOG.md](CHANGELOG.md).

---

## About this repository

This repository is the public home of waymark: usage documentation, release notes and issues. **It does not contain the source code** — waymark is a commercial product and the implementation is developed privately.

- **Install:** `npm install -g @way_marks/cli`
- **Documentation:** [shaifulshabuj.github.io/waymark](https://shaifulshabuj.github.io/waymark/)
- **Issues and questions:** open an issue here

Waymark is free to use, with no warranty and at your own risk. Redistribution, resale, modification and rights in the source code are not granted. Versions published before 2026-08-27 remain under the MIT Licence. See [LICENSE](LICENSE).

© Shaiful Shabuj. All rights reserved.
