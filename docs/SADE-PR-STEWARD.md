# SADE PR Steward

The PR Steward is the next controlled backend stage after the SADE controlled writer.

## Pipeline

`Prompt → Recon → Patcher → Auditor → Validator → Human Approval → Writer → PR Steward`

The Writer creates a `sade/...` feature branch and commit. The PR Steward may then open a pull request from that feature branch into the requested base branch.

## Safety boundary

- Firebase Authentication is required.
- Explicit human approval is required on every PR creation request.
- Validator must return `READY`.
- `validation.writeAllowed` must remain `false`.
- The feature branch must begin with `sade/`.
- The feature branch SHA is re-read immediately before PR creation.
- A supplied approved SHA must match the current feature branch head.
- The base and feature branch must differ.
- An existing open PR for the same head/base pair is returned instead of creating a duplicate.
- The PR body records the objective, validation result, test plan, audit summary and proposal hash.
- SADE never merges the PR in this stage.

## Backend endpoint

`POST /createPullRequest`

Required request fields:

- `objective`
- `owner`
- `repo`
- `baseBranch`
- `featureBranch`
- `commitSha`
- `proposalHash`
- `approval: true`
- `validation`

Optional:

- `auditSummary`

## GitHub App permission

The GitHub App installation token used by the PR Steward requires:

- **Contents: Read**
- **Pull requests: Read and write**

The existing controlled writer continues to request **Contents: Read and write** separately. The PR Steward requests only the permissions it needs for its operation.

After changing the GitHub App permissions, the app installation must be refreshed/re-approved for the repository so the new permission is available to the installation token.

## Firebase

No new Firebase secret is introduced by this component. It uses the existing `SADE_GITHUB_APP` secret and Firebase Authentication.

The Firebase Functions must be redeployed after this code is merged.
