# Stage 6 — Audit Diff

Perform an independent engineering review of the complete branch diff. Do not assume the implementation is correct because tests pass.

Review for unintended changes, unnecessary files, accidental deletions, regressions, duplicated functionality, architectural violations, security problems, exposed credentials, poor error handling, accessibility problems, performance problems, dependency issues, naming inconsistencies, dead/debug code, hard-coded values and incomplete requirements.

Compare the implementation against the original Commander request.

Produce an audit report with Requirements, Architecture, Implementation, Testing, Security, Regression Risk, Code Quality and PR Readiness marked PASS or FAIL, plus every finding.

Do not create a PR while unresolved findings remain.