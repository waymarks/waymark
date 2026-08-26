# Quick Start

This is the fastest path from an ordinary repo to a governed AI-agent workflow.

## 1. Initialize the project

```bash
npx @way_marks/cli init
```

During initialization, Waymark will:

- detect the current project root
- ask which platforms you want to use
- create `waymark.config.json`
- generate `CLAUDE.md` and/or `COPILOT.md`
- update MCP configuration for the selected platform
- add `.waymark/` to `.gitignore`

## 2. Start Waymark

```bash
npx @way_marks/cli start
```

`start` launches the API server and MCP server as detached background processes, writes `.waymark/config.json` and `.waymark/waymark.pid`, opens a browser, and prints the dashboard URL.

## 3. Open the dashboard

Since v5, the global daemon serves every project at one fixed URL:

```text
http://localhost:47000
```

Run `waymark daemon start` once. In legacy per-project mode, `waymark start` instead auto-allocates a port in the `47000-47999` range (printed at startup) to avoid collisions with common dev servers.

## 4. Run your AI agent

Once the platform has been configured and restarted, the agent uses Waymark-routed tools automatically. File reads, file writes, and shell commands are intercepted, evaluated against policy, and recorded in the action ledger.

## 5. Review actions in the dashboard

Open the Actions, Approvals, Sessions, and Agents views to see:

- recent tool calls
- pending approvals
- blocked actions with reasons
- grouped session history
- live agent sessions and ports

## Example `waymark.config.json`

A newly initialized project starts with a conservative default policy similar to this:

```json
{
  "version": "2",
  "platforms": ["claude", "copilot-cli"],
  "policies": {
    "allowedPaths": [
      "./src/**",
      "./data/**",
      "./README.md",
      "./CLAUDE.md",
      "./COPILOT.md"
    ],
    "blockedPaths": [
      "./.env",
      "./.env.*",
      "./package-lock.json",
      "/etc/**",
      "/usr/**"
    ],
    "blockedCommands": [
      "rm -rf",
      "DROP TABLE",
      "DROP DATABASE",
      "chmod 777",
      "regex:\\|\\s*bash",
      "regex:\\|\\s*sh\\b",
      "regex:\\$\\(curl",
      "regex:\\$\\(wget",
      "wget "
    ],
    "requireApproval": [
      "./src/db/**",
      "./waymark.config.json"
    ],
    "maxBashOutputBytes": 10000
  }
}
```

## How decisions work

Waymark turns every governed action into one of three outcomes:

- **allow** — execute immediately and record the result
- **pending** — hold the action until a human approves or rejects it
- **block** — reject the action and record the matched rule and reason

For file operations, Waymark uses a default-deny posture unless a path matches `allowedPaths`. For bash, the engine always checks `blockedCommands` first, then `requireApprovalBash`, then `allowedCommands` if you use a whitelist.

!!! waymark "Quick start mental model"
    `init` establishes the contract, `start` boots the governance layer, and the dashboard becomes your live control plane for what the agent is doing.
