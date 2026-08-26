# Installation

Waymark is a Node.js and TypeScript toolchain built around a CLI package (`@way_marks/cli`) and a server package (`@way_marks/server`). You need **Node.js 18+** and either `npm` or `npx`.

## Requirements

- Node.js **18 or newer**
- `npm` or `npx`
- One of the supported platforms:
  - Claude Desktop
  - Claude Code
  - GitHub Copilot CLI

## Install options

=== "npm (global)"

    ```bash
    npm install -g @way_marks/cli
    waymark --version
    ```

    Global install is best when you want a stable `waymark` command on your PATH.

=== "npx (no install)"

    ```bash
    npx @way_marks/cli init
    ```

    `npx` is the fastest way to try Waymark in a project without managing a global install.

=== "Development setup"

    ```bash
    git clone https://github.com/shaifulshabuj/waymark.git
    cd waymark
    npm install
    npm run build
    ```

    Use this path when you want to work on Waymark itself, test changes, or run the monorepo locally.

## What gets installed

The CLI handles project initialization and lifecycle commands such as `init`, `start`, `status`, `logs`, and `watch`. The server package provides the MCP server, API server, dashboard assets, SQLite action ledger, approval handling, policy engine, and agent monitor.

## Platform notes

### Claude Desktop and Claude Code

These are the most direct Waymark integrations. `waymark init` can generate `CLAUDE.md`, create `.mcp.json`, and update the Claude Desktop config so file and shell tools route through Waymark's MCP server.

### GitHub Copilot CLI

Current source treats Copilot CLI as a first-class platform. `waymark init` can generate `COPILOT.md` and merge a local MCP entry into `~/.copilot/mcp-config.json`.

### Multi-platform setup

If you work across IDE and terminal flows, choose **Both** during `waymark init`. Waymark will configure Claude and Copilot CLI side by side while keeping one policy file and one project-local ledger.

!!! tip "No project install is required to start"
    For most users, `npx @way_marks/cli init` is enough. Waymark installs or resolves the server package during initialization and then starts the background API + MCP processes when you run `waymark start`.
