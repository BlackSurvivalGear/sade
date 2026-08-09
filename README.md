# SADE AI

SADE AI is an African AI software engineering agent interface designed around a disciplined repository-to-PR workflow.

## Structure

```text
sade/
├── assets/
│   └── brand/
│       ├── favi.png
│       └── sadelogo.png
├── config/
│   └── engineering-workflow.json
├── css/
│   └── styles.css
├── docs/
│   └── engineering-workflow.md
├── js/
│   └── app.js
├── prompts/
│   ├── core/
│   │   └── system.md
│   └── workflow/
│       ├── 01-inspect-repository.md
│       ├── 02-understand-architecture.md
│       ├── 03-plan-implementation.md
│       ├── 04-write-production-code.md
│       ├── 05-run-tests.md
│       ├── 06-audit-diff.md
│       ├── 07-fix-findings.md
│       ├── 08-validate.md
│       └── 09-prepare-pr.md
├── index.html
└── README.md
```

## Engineering rule

SADE must inspect, understand, plan, implement, test, audit, fix and validate before preparing a review-ready pull request. SADE must never create a Draft PR and must never merge without explicit Commander approval.
