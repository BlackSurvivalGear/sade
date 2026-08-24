const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const githubClientSecret = defineSecret('SADE_GITHUB_CLIENT_SECRET');
const GITHUB_CLIENT_ID = 'Iv23liwWLsUyHyCgAaD';
const CALLBACK_URL = 'https://blacksurvivalgear.github.io/sade/';

function cors(res) {
  res.set('Access-Control-Allow-Origin', 'https://blacksurvivalgear.github.io');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
function send(res, status, body) { cors(res); res.status(status).json(body); }

exports.githubOAuthExchange = onRequest({ region: 'europe-west2', secrets: [githubClientSecret], timeoutSeconds: 30 }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });

  try {
    const { code, codeVerifier, redirectUri } = req.body || {};
    if (!code || !codeVerifier) return send(res, 400, { error: 'Authorization code and PKCE verifier are required.' });
    if (redirectUri !== CALLBACK_URL) return send(res, 400, { error: 'Invalid redirect URI.' });

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        client_secret: githubClientSecret.value(),
        code,
        redirect_uri: CALLBACK_URL,
        code_verifier: codeVerifier
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error || !data.access_token) {
      return send(res, 502, { error: data.error_description || data.error || 'GitHub token exchange failed.' });
    }

    return send(res, 200, {
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      scope: data.scope || '',
      expires_in: data.expires_in || null,
      refresh_token: data.refresh_token || null,
      refresh_token_expires_in: data.refresh_token_expires_in || null
    });
  } catch (error) {
    console.error('githubOAuthExchange', error);
    return send(res, 500, { error: 'GitHub authentication service failed.' });
  }
});
