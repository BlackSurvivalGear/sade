const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function json(res, status, body, origin) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  return res.json(body);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const configuredOrigin = process.env.SADE_ALLOWED_ORIGIN || '';
  const callbackUrl = process.env.SADE_CALLBACK_URL || '';

  if (!configuredOrigin || !callbackUrl) {
    return json(res, 500, { error: 'SADE_ALLOWED_ORIGIN and SADE_CALLBACK_URL must be configured.' });
  }

  if (origin !== configuredOrigin) {
    return json(res, 403, { error: 'Origin not allowed.' });
  }

  res.setHeader('Access-Control-Allow-Origin', configuredOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' }, configuredOrigin);
  }

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return json(res, 500, { error: 'GitHub App credentials are not configured on the server.' }, configuredOrigin);
  }

  const body = req.body || {};
  const action = body.action || 'exchange';

  let params;
  if (action === 'refresh') {
    if (!body.refresh_token) {
      return json(res, 400, { error: 'refresh_token is required.' }, configuredOrigin);
    }
    params = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: body.refresh_token
    };
  } else {
    if (!body.code || !body.code_verifier || !body.redirect_uri) {
      return json(res, 400, { error: 'code, code_verifier and redirect_uri are required.' }, configuredOrigin);
    }

    if (body.redirect_uri !== callbackUrl) {
      return json(res, 400, { error: 'redirect_uri does not match the configured SADE callback URL.' }, configuredOrigin);
    }

    params = {
      client_id: clientId,
      client_secret: clientSecret,
      code: body.code,
      redirect_uri: body.redirect_uri,
      code_verifier: body.code_verifier
    };
  }

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: new URLSearchParams(params)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error || !data.access_token) {
      return json(res, 502, {
        error: data.error || 'github_token_exchange_failed',
        error_description: data.error_description || 'GitHub did not return a user access token.'
      }, configuredOrigin);
    }

    return json(res, 200, {
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token || null,
      refresh_token_expires_in: data.refresh_token_expires_in || null,
      token_type: data.token_type || 'bearer'
    }, configuredOrigin);
  } catch (error) {
    return json(res, 502, {
      error: 'github_unreachable',
      error_description: error.message || 'Unable to contact GitHub.'
    }, configuredOrigin);
  }
}
