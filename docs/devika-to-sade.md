# Devika → SADE Architecture Map

SADE takes selected architectural ideas from Devika but does not fork or depend on Devika. The implementation is adapted to SADE's GitHub-native, auditable engineering workflow.

## Capability mapping

| Devika concept | SADE implementation | Decision |
|---|---|---|
| Planner | `Planner` agent + workflow stage 3 | Adopt and formalise |
| Researcher | `Researcher` agent | Adopt, prioritising repository and authoritative sources |
| Coder | `Code Engineer` agent | Reimplement with structured operations |
| Runner | `Tester` agent + controlled execution policy | Adopt concept; never allow unrestricted model shell execution |
| Patcher | `Patcher` agent | Adopt as the failure-recovery loop |
| Browser agent | `Browser Verifier` | Adopt for user-facing verification |
| Agent state | Session state + progress model | Extend into auditable engineering state |
| Project context | Repository-bound engineering session | Adopt and make GitHub the source of truth |
| GitHub integration | SADE GitHub App/API layer | Keep SADE implementation; do not copy Devika's minimal wrapper |
| Raw LLM file delimiters | Structured file operations | Reject |
| Unrestricted subprocess execution | Policy-controlled executor | Reject |

## SADE engineering loop

```text
Commander objective
        ↓
SADE Orchestrator
        ↓
Recon → Research → Plan
        ↓
Code Engineer
        ↓
Test
   ┌────┴────┐
   │         │
 PASS      FAIL
   │         ↓
   │      Patcher
   │         ↓
   │       Retest
   └────┬────┘
        ↓
Browser verification (when applicable)
        ↓
Diff audit
        ↓
Git / PR preparation
        ↓
Commander review
        ↓
Merge to main
```

## Why this differs from Devika

SADE is designed around real repository ownership and a disciplined GitHub workflow. GitHub is the source of truth for branches, files, commits, pull requests and checks. The agent layer is responsible for reasoning and orchestration, not for bypassing repository controls.

### Execution safety

Agent-generated commands must pass an execution policy before being run. Destructive operations, credential access and arbitrary remote execution are not automatically permitted. Test/build commands can be allow-listed for the target project.

### Structured code changes

SADE should use structured tool calls for file changes rather than parsing free-form LLM output for file delimiters. Every modification must identify the repository, branch, path and intended change so the diff can be audited.

### Failure recovery

A failed test is not a completed task. SADE records the failure, routes the evidence to Patcher, applies a targeted correction, and reruns the relevant validation. Repeated or unresolved failures stop the workflow and are reported to the Commander.

## Initial agent responsibilities

- **Orchestrator:** owns the state machine and routing.
- **Recon:** establishes repository facts before implementation.
- **Researcher:** supplies external technical evidence only when needed.
- **Planner:** creates the implementation plan and acceptance criteria.
- **Code Engineer:** makes production changes.
- **Tester:** executes approved validation and records evidence.
- **Patcher:** repairs failures and regressions.
- **Browser Verifier:** validates deployed/user-facing behaviour.
- **Diff Auditor:** checks scope, security and unintended changes.
- **Git / PR Engineer:** creates the reviewable PR and reports its exact URL.

## Merge policy

SADE must never silently merge its own work. A PR is prepared for review, the final PR URL is surfaced to the Commander, and merge to `main` requires Commander approval.
