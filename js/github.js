const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com';
const API_VERSION = '2022-11-28';
const TOKEN_KEY = 'sade.github.auth.v1';
const CLIENT_KEY = 'sade.github.client-id';

function configuredClientId() {
  const configured = window.SADE_GITHUB_APP?.clientId;
  if (configured && !configured.startsWith('REPLACE_')) return configured;
  return localStorage.getItem(CLIENT_KEY) || '';
}

function saveClientId(clientId) {
  localStorage.setItem(CLIENT_KEY, clientId.trim());
}

function readAuth() {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); } catch { return null; }
}

function writeAuth(auth) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
}

function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function randomString(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function oauthJson(path, params) {
  const response = await fetch(`${GITHUB_OAUTH}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: new URLSearchParams(params)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || `GitHub OAuth error ${response.status}`);
  return data;
}

async function requestDeviceCode(clientId) {
  return oauthJson('/login/device/code', { client_id: clientId });
}

async function pollDeviceToken(clientId, deviceCode, interval, onPending) {
  let delay = Math.max(Number(interval) || 5, 5) * 1000;
  const deadline = Date.now() + 15 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const data = await oauthJson('/login/oauth/access_token', {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    }).catch((error) => ({ error: 'request_failed', error_description: error.message }));

    if (data.access_token) return data;
    if (data.error === 'authorization_pending') {
      onPending?.('Waiting for GitHub authorisation…');
      continue;
    }
    if (data.error === 'slow_down') {
      delay += 5000;
      onPending?.('GitHub asked SADE to slow down. Still waiting…');
      continue;
    }
    if (data.error === 'expired_token') throw new Error('The GitHub verification code expired. Start again.');
    if (data.error === 'access_denied') throw new Error('GitHub authorisation was cancelled.');
    throw new Error(data.error_description || data.error || 'GitHub authorisation failed.');
  }

  throw new Error('The GitHub authorisation window expired. Start again.');
}

async function connect(onProgress) {
  const clientId = configuredClientId();
  if (!clientId) throw new Error('SADE needs the GitHub App Client ID before it can connect.');

  const device = await requestDeviceCode(clientId);
  onProgress?.({ type: 'device', ...device });
  window.open(device.verification_uri, '_blank', 'noopener,noreferrer');

  const token = await pollDeviceToken(clientId, device.device_code, device.interval, (message) => onProgress?.({ type: 'pending', message }));
  const auth = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null,
    refreshExpiresAt: token.refresh_token_expires_in ? Date.now() + Number(token.refresh_token_expires_in) * 1000 : null
  };
  writeAuth(auth);
  return getCurrentUser();
}

async function refreshAccessToken() {
  const auth = readAuth();
  const clientId = configuredClientId();
  if (!auth?.refreshToken || !clientId) return null;

  const token = await oauthJson('/login/oauth/access_token', {
    client_id: clientId,
    device_code: auth.refreshToken,
    grant_type: 'refresh_token'
  }).catch(() => null);

  if (!token?.access_token) return null;
  const refreshed = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || auth.refreshToken,
    expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null,
    refreshExpiresAt: token.refresh_token_expires_in ? Date.now() + Number(token.refresh_token_expires_in) * 1000 : auth.refreshExpiresAt
  };
  writeAuth(refreshed);
  return refreshed;
}

async function ensureToken() {
  let auth = readAuth();
  if (!auth?.accessToken) throw new Error('GitHub is not connected.');
  if (auth.expiresAt && Date.now() > auth.expiresAt - 60_000) {
    auth = await refreshAccessToken();
    if (!auth) {
      clearAuth();
      throw new Error('The GitHub session expired. Please reconnect.');
    }
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
  connect,
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
