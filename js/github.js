const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com';
const API_VERSION = '2022-11-28';
const TOKEN_KEY = 'sade.github.auth.v1';
const CLIENT_KEY = 'sade.github.client-id';
const PKCE_KEY = 'sade.github.pkce.v1';

function configuredClientId() {
  const configured = window.SADE_GITHUB_APP?.clientId;
  if (configured && !configured.startsWith('REPLACE_')) return configured;
  return localStorage.getItem(CLIENT_KEY) || '';
}

function saveClientId(clientId) {
  localStorage.setItem(CLIENT_KEY, clientId.trim());
}

function readAuth() {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); }
  catch { return null; }
}

function writeAuth(auth) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
}

function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function redirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function randomString(length = 64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, value => alphabet[value % alphabet.length]).join('');
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

async function beginWebAuth() {
  const clientId = configuredClientId();
  if (!clientId) throw new Error('SADE needs the GitHub App Client ID before it can connect.');

  const state = randomString(32);
  const codeVerifier = randomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  sessionStorage.setItem(PKCE_KEY, JSON.stringify({
    state,
    codeVerifier,
    redirectUri: redirectUri(),
    createdAt: Date.now()
  }));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  window.location.assign(`${GITHUB_OAUTH}/login/oauth/authorize?${params.toString()}`);
}

async function exchangeAuthorizationCode(code, verifier, callbackUri) {
  const clientId = configuredClientId();
  const response = await fetch(`${GITHUB_OAUTH}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      redirect_uri: callbackUri,
      code_verifier: verifier
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || `GitHub OAuth error ${response.status}`);
  }
  return data;
}

function normaliseToken(token) {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null,
    refreshExpiresAt: token.refresh_token_expires_in ? Date.now() + Number(token.refresh_token_expires_in) * 1000 : null
  };
}

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const oauthError = params.get('error');

  if (!code && !oauthError) return null;

  const stored = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null');
  sessionStorage.removeItem(PKCE_KEY);

  if (oauthError) {
    throw new Error(params.get('error_description') || `GitHub authorisation failed: ${oauthError}`);
  }
  if (!stored?.state || stored.state !== returnedState) {
    throw new Error('GitHub authorisation state validation failed. Please start the connection again.');
  }
  if (Date.now() - Number(stored.createdAt || 0) > 15 * 60 * 1000) {
    throw new Error('The GitHub authorisation request expired. Please start again.');
  }

  const token = await exchangeAuthorizationCode(code, stored.codeVerifier, stored.redirectUri);
  writeAuth(normaliseToken(token));

  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);

  return getCurrentUser();
}

async function refreshAccessToken() {
  // The browser-only PKCE flow intentionally does not expose the App client secret.
  // When the short-lived user token expires, reconnect through GitHub.
  clearAuth();
  return null;
}

async function ensureToken() {
  let auth = readAuth();
  if (!auth?.accessToken) throw new Error('GitHub is not connected.');

  if (auth.expiresAt && Date.now() > auth.expiresAt - 60000) {
    auth = await refreshAccessToken();
    if (!auth) throw new Error('The GitHub session expired. Please reconnect.');
  }

  return auth.accessToken;
}

async function api(path, options = {}) {
  const token = await ensureToken();
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    clearAuth();
    throw new Error('GitHub rejected the current session. Please reconnect.');
  }

  if (!response.ok) {
    let message = `GitHub API error ${response.status}`;
    try { message = (await response.json()).message || message; } catch {}
    throw new Error(message);
  }

  return response.json();
}

async function getCurrentUser() {
  return api('/user');
}

async function listRepositories() {
  const repositories = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await api(`/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100&page=${page}`);
    repositories.push(...batch);
    if (batch.length < 100) break;
  }
  return repositories;
}

async function listBranches(owner, repo) {
  const branches = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`);
    branches.push(...batch);
    if (batch.length < 100) break;
  }
  return branches;
}

async function getRepository(owner, repo) {
  return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
}

async function getTree(owner, repo, branch) {
  return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
}

async function getFile(owner, repo, path, branch) {
  return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);
}

function isConnected() {
  return Boolean(readAuth()?.accessToken);
}

function disconnect() {
  clearAuth();
}

window.SADE_GitHub = {
  connect: beginWebAuth,
  beginWebAuth,
  handleOAuthCallback,
  configuredClientId,
  saveClientId,
  getCurrentUser,
  listRepositories,
  listBranches,
  getRepository,
  getTree,
  getFile,
  isConnected,
  disconnect
};
