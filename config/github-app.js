/*
 * SADE GitHub App configuration.
 *
 * The Client ID is a public identifier and is safe to ship in this browser app.
 * Never put a GitHub App client secret or private key in this repository.
 *
 * Token exchange and refresh are performed by the server-side auth endpoint.
 * On Vercel this can remain the relative /api/github/token URL.
 */
window.SADE_GITHUB_APP = Object.freeze({
  clientId: 'Iv23liwWLsUyHyCgAaD',
  appName: 'SADE AI Engineering Agent',
  authApiUrl: '/api/github/token'
});
