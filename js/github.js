const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const TOKEN_KEY = 'sade.github.auth.v1';
const CLIENT_KEY = 'sade.github.client-id';
const PKCE_KEY = 'sade.github.pkce.v2';

function configuredClientId() {
  const configured = window.SADE_GITHUB_APP?.clientId;
  if (configured && !configured.startsWith('REPLACE_')) return configured;
  return localStorage.getItem(CLIENT_KEY) || '';
}

function saveClientId(clientId) {
  localStorage.setItem(CLIENT_KEY, clientId.trim());
}

function authServiceUrl() {
  const configured = window.SADE_GITHUB_APP?.authServiceUrl;
  if (!configured || configured.includes('REPLACE_')) {
    throw new Error('SADE GitHub authentication service is not configured yet.');
  }
  return configured.replace(/\/$/, '');
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

function normaliseToken(token) {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null,
    refreshExpiresAt: token.refresh_token_expires_in ? Date.now() + Number(token.refresh_token_expires_in) * 1000 : null
  };
}

function beginWebAuth() {
  const state = randomString(32);
  const codeVerifier = randomString(64);
  const service = authServiceUrl();
  const serviceOrigin = new URL(service).origin;

  sessionStorage.setItem(PKCE_KEY, JSON.stringify({
    state,
    codeVerifier,
    createdAt: Date.now()
  }));

  const url = new URL(`${service}/api/github/start`);
  url.searchParams.set('state', state);
  url.searchParams.set('code_verifier', codeVerifier);
  url.searchParams.set('origin', window.location.origin);

  return new Promise((resolve, reject) => {
    const popup = window.open(url.toString(), 'sade-github-auth', 'width=560,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes');
    if (!popup) {
      window.location.assign(url.toString());
      reject(new Error('Your browser blocked the GitHub authentication window.')); 
      return;
    }

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(watchPopup);
      callback(value);
    };

    const onMessage = async (event) => {
      if (event.origin !== serviceOrigin || event.source !== popup || event.data?.source !== 'sade-github-auth') return;
      const stored = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null');
      sessionStorage.removeItem(PKCE_KEY);
      if (!stored?.state || stored.state !== event.data.state) {
        finish(reject, new Error('GitHub authorisation state validation failed. Please reconnect.'));
        return;
      }
      if (Date.now() - Number(stored.createdAt || 0) > 15 * 60 * 1000) {
        finish(reject, new Error('The GitHub authorisation request expired. Please reconnect.'));
        return;
      }
      if (event.data.error) {
        finish(reject, new Error(event.data.error));
        return;
      }
      if (!event.data.token?.accessToken) {
        finish(reject, new Error('GitHub authentication completed without an access token.'));
        return;
      }
      writeAuth(event.data.token);
      try {
        const user = await getCurrentUser();
        finish(resolve, user);
      } catch (error) {
        clearAuth();
        finish(reject, error);
      }
    };

    const watchPopup = window.setInterval(() => {
      if (popup.closed && !settled) {
        const stored = sessionStorage.getItem(PKCE_KEY);
        if (stored) sessionStorage.removeItem(PKCE_KEY);
        finish(reject, new Error('GitHub authentication was cancelled.'));
      }
    }, 500);

    window.addEventListener('message', onMessage);
  });
}

async function handleOAuthCallback() {
  // Authentication is completed by the dedicated auth service callback popup.
  // This remains as a compatibility no-op for existing SADE boot code.
  return null;
}

async function refreshAccessToken() {
  // The auth broker can be extended to refresh expiring tokens later. For now,
  // reconnect before the short-lived GitHub user token expires.
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
