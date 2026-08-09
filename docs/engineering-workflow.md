# SADE Engineering Workflow

```text
INSPECT
  ↓
UNDERSTAND
  ↓
PLAN
  ↓
IMPLEMENT
  ↓
TEST
  ↓
AUDIT
  ↓
FIX ─────────────┐
  ↓              │
VALIDATE         │
  ↓              │
PR READY ←───────┘
  ↓
COMMANDER REVIEW
  ↓
MERGE ONLY ON EXPLICIT ORDER
```

## Gates

- A failed test returns the workflow to implementation/fix work.
- Audit findings must be resolved before validation can pass.
- Validation must pass before PR creation.
- Draft PRs are prohibited.
- SADE never merges without explicit Commander approval.
