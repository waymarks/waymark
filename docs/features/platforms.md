# Platform Support

Waymark is designed around MCP-native workflows first. Today that means strong support for Claude Desktop, Claude Code, and GitHub Copilot CLI, with future editor-integrated platforms depending on wider MCP adoption.

## Covered features

- **F-12 — `CLAUDE.md` generation**
- **F-13 — Multi-project operation**
- **F-14 — Project registry / hub**
- **F-15 — GitHub Copilot CLI**
- **F-16 — Platform comparison**

## Platform matrix

| Platform | Status | Setup path | Notes |
|---|---|---|---|
| Claude Desktop | Supported | `waymark init` → Claude | Best end-to-end Waymark experience |
| Claude Code | Supported | `waymark init` → Claude | Same MCP model, editor-centric workflow |
| GitHub Copilot CLI | Supported | `waymark init` → Copilot CLI | MCP config merged into `~/.copilot/mcp-config.json` |
| GitHub Copilot Chat | Not yet supported | n/a | Waiting on a compatible public MCP integration surface |
| Other AI coding tools | Future | n/a | Depends on MCP or a comparable interception point |

## What `waymark init` creates

### Claude path

When Claude is selected, Waymark can create:

- `waymark.config.json`
- `CLAUDE.md`
- `.mcp.json`
- a local MCP entry in the Claude Desktop config

The generated `CLAUDE.md` tells the agent to route file and shell operations through the Waymark MCP server.

### Copilot CLI path

When Copilot CLI is selected, Waymark can create:

- `waymark.config.json`
- `COPILOT.md`
- a local MCP entry in `~/.copilot/mcp-config.json`

Current source uses `"type": "local"` in the Copilot config and generates project-specific instructions the same way it does for Claude.

## Multi-platform mode

Choose **Both** during `waymark init` to configure Claude and Copilot CLI in one pass. The policy file stays project-local, and all actions flow into the same `.waymark/waymark.db` ledger.

## Multi-project workflows

Waymark also tracks projects machine-wide in a registry under `~/.waymark/registry.json`. That enables:

- `waymark list`
- `waymark open <project>`
- hub view in the dashboard
- per-project pause, resume, and stop operations

## Hub view

When more than one project is registered, the dashboard exposes a Hub section that shows sibling projects, status, ports, action counts, and pending counts. This is the operational view for teams juggling multiple repos on one machine.

## Setup examples

### Claude-only project

```bash
npx @way_marks/cli init
# choose Claude
npx @way_marks/cli start
```

### Copilot-only project

```bash
npx @way_marks/cli init
# choose GitHub Copilot CLI
npx @way_marks/cli start
```

### Both platforms

```bash
npx @way_marks/cli init
# choose Both
npx @way_marks/cli start
```

## Comparison guidance

Choose **Claude** when you want the deepest policy-controlled coding workflow. Choose **Copilot CLI** when terminal-native operation matters and you want Waymark governance there too. Choose **Both** when your team mixes IDE and terminal interactions.

!!! waymark "Platform support follows the interception point"
    Waymark works best where the toolchain exposes an MCP or MCP-like gateway. That is why Claude and Copilot CLI fit naturally and editor chat tools without MCP do not yet.
