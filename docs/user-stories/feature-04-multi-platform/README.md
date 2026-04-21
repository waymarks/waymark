# Feature 04: Multi-Platform Support

> **[← Back to Index](../README.md)** | [Setup Guide](./setup-guide.md) | [Testing Guide](./testing-guide.md)

---

## Overview

**Elevator Pitch**

Waymark's governance controls work identically on Windows, macOS, and Linux — so organizations can enforce consistent AI agent policies across every developer's machine, regardless of their operating system.

**The Problem It Solves**

Engineering organizations are rarely homogeneous. A team might include Windows developers using Claude Code in PowerShell, macOS engineers using the Terminal, and Linux-based CI/CD pipelines running automated AI agent tasks. Without cross-platform consistency, governance policies become fragmented: a policy enforced on macOS may be silently bypassed on Windows, or a deployment pipeline on Linux may have no Waymark protection at all.

Multi-platform support ensures that the same `waymark.config.json` governs AI agent behavior consistently across all three platforms — same policies, same audit trail, same dashboard.

---

## Business Value

**Uniform Policy Enforcement**
A single policy file (`waymark.config.json`) is the source of truth for AI agent governance across all platforms. There is no platform-specific configuration to maintain, no risk of divergence between Windows and macOS policies.

**Enterprise-Wide Deployment**
Organizations with diverse engineering environments can roll out Waymark to all developers at once, without first normalizing on a single OS. Windows developers, macOS developers, and Linux CI/CD pipelines are all covered.

**Consistent Audit Trail**
Regardless of which platform an action originated on, the audit trail format is identical. Compliance reports, security reviews, and incident investigations do not require platform-specific tooling.

**Lower IT Overhead**
Platform-specific workarounds and compatibility shims add IT maintenance burden. Multi-platform support means Waymark deploys and runs on any managed machine without custom OS-level configuration.

---

## Who Benefits

| Role | How They Benefit |
|------|-----------------|
| **CISO / IT Security** | Can enforce AI agent governance across the entire organization, regardless of OS diversity |
| **Platform / DevOps Engineer** | Deploys Waymark once to all developer machines and CI/CD pipelines without per-OS customization |
| **Developer (any OS)** | Works with Waymark in their native environment — no workflow changes, no OS-specific quirks |
| **Compliance Officer** | Audit trail is consistent across platforms — no gaps where one OS bypasses controls |

---

## When to Use This Feature

- Your engineering organization uses a mix of Windows, macOS, and Linux machines
- You are deploying Waymark across multiple teams and cannot require OS standardization
- AI agent tasks run in CI/CD pipelines on Linux alongside developer workflows on macOS/Windows
- You need to demonstrate to auditors that governance controls apply uniformly, not just on selected platforms

---

## Platform Coverage

| Platform | Supported Versions | Notes |
|----------|--------------------|-------|
| **macOS** | 12 (Monterey) and later | Native binary; recommended for Claude Code workflows |
| **Windows** | Windows 10 (1903+) and Windows 11 | PowerShell and cmd.exe both supported |
| **Linux** | Ubuntu 20.04+, Debian 11+, RHEL 8+, most distros | Ideal for CI/CD and server-side deployments |

---

## User Stories

### Story 1: Consistent Enforcement Across a Mixed-OS Team

```
As a Security Engineer
I want Waymark to enforce the same approval policies on my Windows developers as on macOS developers
So that our governance controls are not bypassed simply by choosing a different operating system

Acceptance Criteria:
  [ ] waymark.config.json is portable — no OS-specific syntax required
  [ ] requireApproval and blockedPaths policies behave identically on all platforms
  [ ] File path matching handles OS path separators correctly (\ on Windows, / on macOS/Linux)
  [ ] Blocked commands are enforced regardless of shell (PowerShell, cmd, bash, zsh)
  [ ] Audit log entries from all platforms appear in the shared dashboard with consistent format

Scenario: Windows developer triggers a policy-matched write
  Given: A Windows developer has Waymark installed and connected to Claude Code
  And: src/db/migrations/** is in requireApproval
  When: The developer's Claude Code session attempts to write src\db\migrations\0001_add_index.sql
  Then: The write is held for approval, identical to the behavior on macOS
  And: Dashboard shows the pending action with the correct path (normalized to forward slashes)
  And: Approver can act on the request from any platform
```

---

### Story 2: Linux CI/CD Pipeline Protection

```
As a DevOps Engineer
I want Waymark to protect our Linux-based CI/CD pipelines running automated AI agent tasks
So that AI-generated changes in automation have the same governance controls as developer workflows

Acceptance Criteria:
  [ ] Waymark runs as a background process on Linux without a GUI or display dependency
  [ ] Dashboard is accessible remotely (not just localhost) when configured for CI use
  [ ] Approval routing works for CI pipeline sessions (with appropriate CI approver config)
  [ ] Pipeline failures due to pending approvals are clearly reported in CI output
  [ ] Session audit trail for CI runs is distinguishable from developer sessions

Scenario: CI pipeline uses Claude Code to auto-generate API documentation
  Given: Waymark is running on the CI server as a background service
  And: docs/api/** is in requireApproval for AI-generated documentation
  When: The CI pipeline's Claude Code task attempts to update docs/api/openapi.yaml
  Then: Write is held for approval
  And: A notification is sent to the platform team
  And: CI pipeline reports "Awaiting approval" with a dashboard link
  And: On approval, the pipeline continues and the file is written
```

---

### Story 3: Windows-Specific Path and Shell Handling

```
As a Windows Developer
I want Waymark to correctly handle Windows file paths and PowerShell commands
So that I get the same protection as my macOS colleagues without workarounds

Acceptance Criteria:
  [ ] File paths with backslashes (src\db\) match the same policies as forward-slash equivalents
  [ ] PowerShell commands are intercepted by blockedCommands rules
  [ ] Environment variables set via PowerShell ($env:VARNAME) are respected
  [ ] Dashboard accessible at http://localhost:3001 from Windows browsers without certificate issues
  [ ] npx @way_marks/cli start works in both PowerShell and cmd.exe

Scenario: Windows developer's Claude Code session hits a blocked command
  Given: Waymark is running on Windows via PowerShell
  And: "Remove-Item -Recurse" is in blockedCommands
  When: Claude Code attempts: Remove-Item -Recurse -Force .\dist\
  Then: Command is blocked by Waymark
  And: Block is logged with PowerShell command syntax preserved
  And: Security alert is sent if configured
```

---

## Platform-Specific Notes

### macOS

macOS is the primary development target for Claude Code and the recommended platform for initial Waymark deployment. The binary runs natively on both Intel and Apple Silicon (M1/M2/M3).

**Common macOS considerations:**
- Gatekeeper may prompt to allow the Waymark binary on first run — click "Open" in System Settings → Security
- Port 3001 is used for the dashboard; ensure no conflict with other local services
- Waymark reads Claude Code's MCP configuration from `~/.claude/claude_desktop_config.json`

### Windows

Windows support covers both PowerShell 5.1+ and the legacy cmd.exe interpreter. Path separator normalization is handled automatically — developers can use either `\` or `/` in config files.

**Common Windows considerations:**
- Run `npx @way_marks/cli start` from PowerShell or cmd.exe (not WSL, unless intentional)
- Windows Defender or antivirus may flag the Waymark binary on first install — add an exclusion for `%APPDATA%\npm\node_modules\@way_marks`
- Firewall may block port 3001 — add an inbound rule if the dashboard is inaccessible
- For WSL2 users: use the Linux installation path inside WSL, not the Windows path

### Linux

Linux installation is the same as macOS. Waymark is commonly deployed as a systemd service for persistent CI/CD use.

**Common Linux considerations:**
- For CI/CD: run `npx @way_marks/cli start --headless` to suppress the dashboard (server runs without opening a browser)
- For persistent deployment: create a systemd service unit (see Setup Guide)
- Ensure `node` and `npx` are in `PATH` for the user running the CI agent
- Port 3001 must be accessible from the CI runner network if remote dashboard access is needed

---

## Related Features

- [Team Approval Routing](../feature-01-approval-routing/README.md) — Policies enforced uniformly across platforms
- [Email Notifications](../feature-03-email-notifications/README.md) — Notifications work regardless of platform

---

*[Setup Guide →](./setup-guide.md)*
