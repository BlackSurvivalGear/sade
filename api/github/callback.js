const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const ALLOWED_ORIGIN = process.env.SADE_ORIGIN || 'https://blacksurvivalgear.github.io';

function html(payload, status = 200) {
  const safe = JSON.stringify(payload).replace(/</g, '\\u003c');
  return new Response(`<!doctype html><meta charset="utf-8"><title>SADE GitHub callback</title><script>const payload=${safe};if(window.opener&&!window.opener.closed){window.opener.postMessage({source:'sade-github-auth',...payload},${JSON.stringify(ALLOWED_ORIGIN)});window.close();}else{document.body.textContent=payload.error||'GitHub authentication complete. Return to SADE.'}</script>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
    if (!CLIENT_ID || !CLIENT_SECRET) return html({ error: 'SADE GitHub authentication is not configured on the auth service.' }, 500);

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const description = url.searchParams.get('error_description');
    const codeVerifier = cookieValue(request, 'sade_pkce_verifier');

    if (error) return html({ error: description || error }, 400);
    if (!code || !state || !codeVerifier) return html({ error: 'GitHub returned an incomplete authorization response. Please reconnect.' }, 400);

    const redirectUri = `${url.origin}${url.pathname}`;
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error || !data.access_token) return html({ error: data.error_description || data.error || `GitHub token exchange failed (${response.status}).` }, 502);

    return html({
      ok: true,
      state,
      token: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null,
        refreshExpiresAt: data.refresh_token_expires_in ? Date.now() + Number(data.refresh_token_expires_in) * 1000 : null
      }
    });
  }
};
