# SADE Controlled Writer

The Controlled Writer is the first SADE component with GitHub write capability.

## Safety model

The writer does **not** write to `main` or any protected/default branch.

A write requires all of the following:

1. Firebase-authenticated SADE user.
2. Repository and branch explicitly supplied.
3. Patcher proposal generated from fresh repository evidence.
4. Auditor/Validator rerun immediately before the write.
5. Validator verdict exactly `READY`.
6. Validator `writeAllowed` remains `false` — this is the safety boundary; it is not a permission grant.
7. Explicit human `approval: true` in the write request.
8. Every target file is re-read immediately before writing.
9. Existing file SHA must match the validated evidence when `expectedSha` is supplied.
10. SADE creates a new `sade/...` feature branch from the current base commit.
11. SADE commits the approved contents to that feature branch only.

The endpoint returns the branch name and commit SHA. It does not create a pull request or merge anything.

## GitHub App permission

The GitHub App installation used by SADE must have **Contents: Read and write** for the repositories it is allowed to modify. Keep all other permissions disabled unless a later SADE capability requires them.

## Firebase deployment

After this PR is merged, redeploy the Functions so `applyApprovedPatches` is available:

```bash
firebase deploy --only functions
```

The existing `SADE_GITHUB_APP` secret must contain the App ID and private key. The App must be granted Contents write permission. No new secret is introduced by this phase.

## Endpoint

`applyApprovedPatches` accepts:

```json
{
  "objective": "...",
  "owner": "BlackSurvivalGear",
  "repo": "sade",
  "branch": "main",
  "approval": true,
  "patches": { "...": "..." },
  "validation": { "verdict": "READY", "writeAllowed": false }
}
```

The server ignores the submitted proposal as authoritative: it re-inspects the repository and regenerates Patcher/Auditor/Validator output. If the proposal has changed or the base branch moved, the write is blocked.

## Next phase

After this is deployed and tested, SADE can add a separate PR Steward capability that opens a pull request from the controlled feature branch. Merge remains a human action.
