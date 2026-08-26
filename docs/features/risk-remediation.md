# Risk & Remediation

Waymark's remediation layer sits above raw rollback. Instead of asking only “can this be undone?”, it scores risk, evaluates policy and compliance posture, and suggests safer alternatives when a full rollback is too risky.

## Covered features

- **F-22 — Risk assessment**
- **F-23 — Remediation recommender**
- **F-24 — Auto-block**
- **F-25 — Policy compliance evaluation**

## Risk score factors

Project documentation describes five major inputs to risk scoring:

1. **operation type**
2. **scale** (how many actions are involved)
3. **error pattern**
4. **time since the actions ran**
5. **system state / load**

These combine into a score and a level such as low, medium, high, or critical.

## Compliance evaluation

`POST /api/remediation/evaluate-policy` evaluates a session against built-in compliance frameworks documented in the repo:

- HIPAA
- SOC2
- PCI-DSS
- GDPR

The point is not to claim full certification from the tool alone. It is to encode review rules that help teams notice when a rollback or action sequence conflicts with their own control requirements.

## Recommendation strategies

The remediation docs call out several strategies:

- **partial rollback** — undo only the safe subset
- **staged rollback** — execute in phases with checks between stages
- **retry** — for transient failures rather than destructive undo
- **workaround** — targeted fixes instead of full reversal
- **escalation** — route to an expert for judgment

## Auto-block rules

High-risk sessions or policy violations can be blocked automatically. The documentation describes default thresholds such as risk scores above 7.0 and immediate blocking for disallowed policy conditions.

## APIs

### Assess a session

```bash
curl -X POST http://localhost:47000/api/remediation/assess \
  -H "Content-Type: application/json" \
  -d '{"session_id":"sess-123"}'
```

### Evaluate policy and compliance

```bash
curl -X POST http://localhost:47000/api/remediation/evaluate-policy \
  -H "Content-Type: application/json" \
  -d '{"session_id":"sess-123"}'
```

### Get ranked recommendations

```bash
curl -X POST http://localhost:47000/api/remediation/recommend \
  -H "Content-Type: application/json" \
  -d '{"session_id":"sess-123"}'
```

### List active blocks

```bash
curl http://localhost:47000/api/remediation/blocks
```

## How this fits the rest of Waymark

Risk and remediation complement approval routing rather than replacing it. A team can:

- block obviously dangerous rollback attempts automatically
- require human approval on borderline cases
- offer safer alternatives than an all-or-nothing undo
- keep an audit trail of why a risky session was blocked or remediated

!!! waymark "Remediation is about safer alternatives"
    The strongest value here is not just saying no. It is helping the team choose the least dangerous next step when a full rollback would create new problems.
