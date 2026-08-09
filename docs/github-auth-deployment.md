# SADE GitHub authentication deployment

SADE's GitHub App web flow requires a tiny serverless authentication broker. The browser must never contain the GitHub App client secret. GitHub's web application flow requires the client secret at token exchange and supports PKCE.

## Vercel setup

1. Import this repository into Vercel as a project named `sade-github-auth` (or choose another project name and update `config/github-app.js` accordingly).
2. The project can use the repository root. Vercel automatically deploys JavaScript files under `/api` as Functions.
3. Add these Production environment variables:
   - `GITHUB_CLIENT_ID` = the SADE GitHub App Client ID.
   - `GITHUB_CLIENT_SECRET` = the GitHub App client secret. **Never commit this value.**
   - `SADE_ORIGIN` = `https://blacksurvivalgear.github.io`
4. Deploy the project.
5. The callback URL is:
   `https://YOUR-AUTH-DOMAIN/api/github/callback`
6. In the GitHub App settings, replace the old GitHub Pages callback URL with that exact callback URL.
7. Leave `Request user authorization (OAuth) during installation` disabled. The SADE browser starts the web flow explicitly.
8. Device Flow is no longer used by the SADE browser connection.

## Security model

The browser creates a random PKCE verifier and state. The verifier is sent only to the auth broker, which stores it in an HttpOnly, Secure, SameSite cookie. The broker sends the PKCE challenge to GitHub and performs the code-to-token exchange server-side using the GitHub App client secret. The resulting short-lived user token is returned to the already-open SADE window using `postMessage` and is held in `sessionStorage`.

The broker does not proxy normal GitHub API traffic. After authentication, SADE calls `api.github.com` directly with the user access token.

## Why the broker exists

A static GitHub Pages application cannot safely hold the GitHub App client secret, while GitHub requires that secret for the web-flow token exchange. The broker is deliberately limited to authentication; it is not a general SADE backend.
