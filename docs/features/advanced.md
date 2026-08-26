# Advanced CLI & Dashboard

Waymark v4.7.0 significantly expanded the toolchain beyond basic allow/block/rollback. This page collects the advanced policy, CLI, API, and dashboard capabilities that make the product feel like an operator console rather than a simple logger.

## Covered features

- **F-33 — `requireApprovalBash`**
- **F-34 — `allowedCommands`**
- **F-35 — Policy editor**
- **F-36 — Interactive policy testing**
- **F-37 — `waymark explain`**
- **F-38 — `waymark watch`**
- **F-39 — Session diff**
- **F-40 — Audit export**
- **F-41 to F-46 — Approve-with-edit, selective rollback, replay, pause/resume, escalation badges, and advanced dashboard UX**

## Advanced policy controls

### `requireApprovalBash`

Queue risky commands instead of executing them immediately:

```json
{
  "policies": {
    "requireApprovalBash": ["git push", "npm publish", "kubectl apply"]
  }
}
```

### `allowedCommands`

Turn bash into an explicit allowlist:

```json
{
  "policies": {
    "allowedCommands": ["npm test", "npm run build", "git status"]
  }
}
```

With a non-empty allowlist, commands that are not listed are blocked even if they are not in `blockedCommands`.

## Visual policy editing

The dashboard policy editor writes directly to `waymark.config.json`. It is useful when reviewers need to add or remove patterns without hand-editing JSON in the repo.

## Interactive policy testing

`POST /api/policy/test` lets you ask, “what would Waymark do with this path or command?” before changing a live workflow.

```bash
curl -X POST http://localhost:47000/api/policy/test \
  -H "Content-Type: application/json" \
  -d '{"command":"npm publish"}'
```

## `waymark explain <id>`

This CLI command turns a raw action row into a readable summary with decision, reason, target, output, and quick approval instructions for pending actions.

```bash
waymark explain act-1234
```

## `waymark watch`

`watch` is the ANSI terminal dashboard. It refreshes every two seconds, combines actions and agent snapshot data, and highlights pending approvals and recent blocks.

```bash
waymark watch
```

## Session diff

`GET /api/sessions/:id/diff` returns the before/after content pairs for non-rolled-back `write_file` actions in a session. It is the review-friendly view for “what did this run change?”

## Audit export

`GET /api/audit/export?format=csv|json` packages action metadata for external review and reporting.

```bash
curl -OJ "http://localhost:47000/api/audit/export?format=csv"
```

## Advanced approval and recovery workflow

### Approve with edit

Review and modify pending file content before it executes.

### Selective rollback

Choose only the write actions you want to undo from a session.

### Replay

Re-submit a rolled-back write as a new action with fresh logging and approval.

## Live operational UX enhancements

Recent versions also added:

- pending-count badge in the sidebar and browser title
- dark-mode auto-detection
- escalation urgency badges
- aggregate pending banner in the Hub view
- pause / resume controls for running agents
- clickable file-path pivots from Agent Monitor into the Actions view
- stronger secret redaction in collector output
- config validation warnings on startup

## Example workflow

1. Queue `git push` with `requireApprovalBash`
2. Test the rule with `/api/policy/test`
3. Review the queued action in the dashboard
4. Use **Approve with edit** if the pending file content needs adjustment
5. Export the session's audit log after completion
6. If needed, use session diff or partial rollback to recover selectively

!!! tip "The advanced layer is for operator confidence"
    These features are most valuable when a team already likes Waymark's basic safety model and wants faster review, better visibility, and cleaner recovery for complex sessions.
