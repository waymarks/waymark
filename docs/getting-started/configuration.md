# Configuration

Waymark is driven by `waymark.config.json` in the project root. The file defines supported platforms, optional port pinning, and the policy rules that decide whether an agent action is allowed, blocked, or held for approval.

## Full example

```json
{
  "version": "2",
  "platforms": ["claude", "copilot-cli"],
  "policies": {
    "allowedPaths": ["./src/**", "./README.md"],
    "blockedPaths": ["./.env", "./.env.*"],
    "blockedCommands": ["rm -rf", "regex:\\|\\s*bash"],
    "requireApproval": ["./src/db/**"],
    "requireApprovalBash": ["git push", "npm publish"],
    "allowedCommands": ["npm test", "npm run build"],
    "maxBashOutputBytes": 10000
  }
}
```

## Field reference

| Field | Type | Default | Description |
|---|---|---:|---|
| `version` | `string` | `"2"` in generated configs | Schema version marker for the config file. |
| `platforms` | `string[]` | `[`"claude"`]` from init defaults | Platforms Waymark should configure for this project. Current selections are `claude` and `copilot-cli`. |
| `port` | `number` | unset | Optional fixed dashboard/API port. `waymark start --port` overrides it at runtime. |
| `policies.allowedPaths` | `string[]` | `[]` | File patterns that are allowed immediately for reads/writes after higher-priority checks pass. |
| `policies.blockedPaths` | `string[]` | `[]` | File patterns that are always blocked for both reads and writes. |
| `policies.blockedCommands` | `string[]` | `[]` | Shell command blocklist. Entries can be substring matches or `regex:<pattern>`. |
| `policies.requireApproval` | `string[]` | `[]` | File write patterns that should enter the pending queue for human approval. |
| `policies.requireApprovalBash` | `string[]` | `[]` | Bash commands that should be queued rather than executed immediately. |
| `policies.allowedCommands` | `string[]` | `[]` | Optional bash allowlist. When non-empty, commands not matching the list are blocked. |
| `policies.maxBashOutputBytes` | `number` | `10000` | Maximum stdout/stderr bytes Waymark keeps for a bash action before truncation. |

## Decision priority

For **file actions**, the policy engine checks rules in this order:

1. `blockedPaths`
2. `requireApproval` (writes only)
3. `allowedPaths`
4. default block

For **bash actions**, it checks:

1. `blockedCommands`
2. `requireApprovalBash`
3. `allowedCommands` if present
4. default allow when no whitelist exists

That ordering is important. A path that appears in both `allowedPaths` and `blockedPaths` will still be blocked because the block rule wins.

## Pattern semantics

- File patterns use `micromatch` and are resolved from the project root.
- Relative paths such as `./src/**` are converted into absolute paths before matching.
- Command rules use substring matching unless prefixed with `regex:`.
- Invalid regex patterns are ignored with a warning on `waymark start`.

## Port behavior

Waymark no longer assumes a fixed dashboard port.

- `waymark start --port 47200` has highest priority.
- `"port": 47100` in `waymark.config.json` is the project-level pin.
- If neither is set, the CLI auto-allocates from `47000-47999`.

## Environment variables

| Variable | Purpose |
|---|---|
| `WAYMARK_PROJECT_ROOT` | Overrides the project root used by the server and policy engine. |
| `WAYMARK_DB_PATH` | Overrides the SQLite database path. Defaults to `<project>/.waymark/waymark.db`. |
| `WAYMARK_PORT` | Overrides the port seen by the API and MCP server processes. Usually set by `waymark start`. |

## Practical configuration patterns

### Strict app-source allowlist

```json
{
  "policies": {
    "allowedPaths": ["./src/**", "./tests/**", "./README.md"],
    "blockedPaths": ["./.env", "./.env.*", "./secrets/**"],
    "blockedCommands": ["rm -rf", "git push", "npm publish"],
    "requireApproval": ["./src/db/**"]
  }
}
```

### Guard bash with approvals

```json
{
  "policies": {
    "blockedCommands": ["rm -rf", "regex:DROP\\s+TABLE"],
    "requireApprovalBash": ["git push", "npm publish", "kubectl apply"],
    "allowedCommands": ["npm test", "npm run build", "git status"]
  }
}
```

## Operational advice

- Keep secret-bearing files in `blockedPaths`.
- Use `requireApproval` for directories where mistakes are recoverable but high impact.
- Use `allowedCommands` only when you want an explicit bash whitelist.
- Test rule behavior with `POST /api/policy/test` before changing team-wide policy.

!!! tip "Readable rules beat clever rules"
    Prefer a short, obvious set of patterns over a dense regex-heavy config. The easier it is to explain why a rule exists, the easier it is to review approvals and audit outcomes later.
