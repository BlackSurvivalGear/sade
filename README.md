# SADE AI

SADE AI is an African AI software engineering agent interface designed around a disciplined repository-to-PR workflow.

## Structure

```text
sade/
├── api/
│   └── github/
│       └── token.js
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
│   ├── app.js
│   └── github.js
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

## GitHub authentication architecture

SADE uses the GitHub App web authorization flow with PKCE.

The browser contains only the public GitHub App Client ID. The GitHub App client secret is **never** stored in the repository or sent to the browser. The authorization code is exchanged by `api/github/token.js`, which runs server-side on a platform such as Vercel. Access and refresh tokens are returned to the browser session only after the server validates the request.

### Required server environment variables

Configure these as server-side environment variables on the deployment platform:

```text
GITHUB_APP_CLIENT_ID=<GitHub App Client ID>
GITHUB_APP_CLIENT_SECRET=<GitHub App Client Secret>
SADE_ALLOWED_ORIGIN=https://<your-production-sade-domain>
SADE_CALLBACK_URL=https://<your-production-sade-domain>/
```

`GITHUB_APP_CLIENT_SECRET` must never be committed to Git.

`SADE_ALLOWED_ORIGIN` controls which browser origin may call the auth endpoint. `SADE_CALLBACK_URL` must exactly match the GitHub App Callback URL and the redirect URI sent by the browser.

### Vercel deployment

The repository can be deployed directly to Vercel. Vercel supports static sites together with serverless API functions, so the existing HTML/CSS/JS frontend can remain intact while `api/github/token.js` provides the secure server-side token exchange.

After deployment:

1. Copy the production Vercel URL.
2. Set `SADE_ALLOWED_ORIGIN` to that exact origin, without a trailing slash.
3. Set `SADE_CALLBACK_URL` to the exact callback URL, normally the Vercel URL plus `/`.
4. Set `GITHUB_APP_CLIENT_ID` to the GitHub App Client ID.
5. Generate a GitHub App client secret and store it only as `GITHUB_APP_CLIENT_SECRET` in Vercel.
6. In the GitHub App settings, set the Callback URL to the exact value of `SADE_CALLBACK_URL`.
7. Redeploy after adding the environment variables.

If SADE is served from a different frontend origin, change `config/github-app.js` so `authApiUrl` points to the deployed API endpoint, for example `https://your-auth-domain.vercel.app/api/github/token`.

## Engineering rule

SADE must inspect, understand, plan, implement, test, audit, fix and validate before preparing a review-ready pull request. SADE must never create a Draft PR and must never merge without explicit Commander approval.
