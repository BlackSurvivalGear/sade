const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const AUTH_ORIGIN = process.env.SADE_ORIGIN || 'https://blacksurvivalgear.github.io';

function fail(message, status = 400) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function base64Url(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') return fail('Method Not Allowed', 405);
    if (!CLIENT_ID) return fail('SADE GitHub authentication is not configured on the auth service.', 500);

    const url = new URL(request.url);
    const state = url.searchParams.get('state');
    const codeVerifier = url.searchParams.get('code_verifier');
    const origin = url.searchParams.get('origin');

    if (!state || !codeVerifier) return fail('Missing authentication state or PKCE verifier.');
    if (origin && origin !== AUTH_ORIGIN) return fail('Untrusted SADE origin.');

    const codeChallenge = await sha256Base64Url(codeVerifier);
    const redirectUri = `${url.origin}/api/github/callback`;
    const githubUrl = new URL('https://github.com/login/oauth/authorize');
    githubUrl.searchParams.set('client_id', CLIENT_ID);
    githubUrl.searchParams.set('redirect_uri', redirectUri);
    githubUrl.searchParams.set('state', state);
    githubUrl.searchParams.set('code_challenge', codeChallenge);
    githubUrl.searchParams.set('code_challenge_method', 'S256');

    const headers = new Headers({ Location: githubUrl.toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', `sade_pkce_verifier=${encodeURIComponent(codeVerifier)}; Path=/api/github/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=900`);
    return new Response(null, { status: 302, headers });
  }
};
