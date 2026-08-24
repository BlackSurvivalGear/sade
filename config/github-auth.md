# SADE GitHub authentication

SADE uses GitHub App OAuth web authentication with PKCE for the browser application.

## Firebase requirement

Set the Firebase Functions secret `SADE_GITHUB_CLIENT_SECRET` to the client secret generated for the SADE GitHub App.

The OAuth exchange function is deployed from the `oauth` Firebase Functions codebase in `functions-oauth/`.

## GitHub App callback

The GitHub App callback URL must be exactly:

`https://blacksurvivalgear.github.io/sade/`

Device Flow may remain enabled for CLI/headless use, but SADE's browser UI uses the web application flow.
