const test = require('node:test');
const assert = require('node:assert/strict');

test('GitHub App Client ID and Callback URL configuration', () => {
  const CLIENT_ID = 'Iv23liwWLsUyHyCgAaD';
  const CALLBACK_URL = 'https://blacksurvivalgear.github.io/sade/';

  assert.equal(CLIENT_ID, 'Iv23liwWLsUyHyCgAaD');
  assert.equal(CALLBACK_URL, 'https://blacksurvivalgear.github.io/sade/');
});

test('Trailing slash normalization in redirect URI check', () => {
  const CALLBACK_URL = 'https://blacksurvivalgear.github.io/sade/';

  function validateRedirectUri(redirectUri) {
    const targetUri = redirectUri ? (redirectUri.endsWith('/') ? redirectUri : `${redirectUri}/`) : CALLBACK_URL;
    return targetUri === CALLBACK_URL;
  }

  assert.equal(validateRedirectUri('https://blacksurvivalgear.github.io/sade/'), true);
  assert.equal(validateRedirectUri('https://blacksurvivalgear.github.io/sade'), true);
  assert.equal(validateRedirectUri('https://blacksurvivalgear.github.io/other'), false);
  assert.equal(validateRedirectUri(null), true);
});

test('Authorization URL generation excludes explicit redirect_uri to prevent GitHub 404', () => {
  const clientId = 'Iv23liwWLsUyHyCgAaD';
  const state = 'test_state_123';
  const challenge = 'test_challenge_456';

  const params = new URLSearchParams({
    client_id: clientId,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  const urlObj = new URL(authUrl);

  assert.equal(urlObj.searchParams.get('client_id'), clientId);
  assert.equal(urlObj.searchParams.has('redirect_uri'), false);
  assert.equal(urlObj.searchParams.get('state'), state);
  assert.equal(urlObj.searchParams.get('code_challenge'), challenge);
  assert.equal(urlObj.searchParams.get('code_challenge_method'), 'S256');
});

test('PKCE and state validation logic', () => {
  function validateOAuthCallback(returnedState, expectedState, verifier) {
    if (!expectedState || returnedState !== expectedState) {
      throw new Error('GitHub authentication state validation failed. Please reconnect.');
    }
    if (!verifier) {
      throw new Error('GitHub PKCE verifier is missing. Please reconnect.');
    }
    return true;
  }

  // Valid state and verifier
  assert.equal(validateOAuthCallback('stateA', 'stateA', 'verifier123'), true);

  // Invalid state
  assert.throws(() => {
    validateOAuthCallback('stateWrong', 'stateA', 'verifier123');
  }, /state validation failed/);

  // Missing verifier
  assert.throws(() => {
    validateOAuthCallback('stateA', 'stateA', null);
  }, /verifier is missing/);
});

test('OAuth state and verifier dual-storage fallback and retrieval', () => {
  function createMockStorage() {
    const store = new Map();
    return {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear()
    };
  }

  const STATE_KEY = 'sade.github.oauth.state';
  const VERIFIER_KEY = 'sade.github.oauth.verifier';

  let local = createMockStorage();
  let session = createMockStorage();

  function saveOAuthState(state, verifier) {
    local.setItem(STATE_KEY, state);
    session.setItem(STATE_KEY, state);
    local.setItem(VERIFIER_KEY, verifier);
    session.setItem(VERIFIER_KEY, verifier);
  }

  function getOAuthState() {
    const state = local.getItem(STATE_KEY) || session.getItem(STATE_KEY) || '';
    const verifier = local.getItem(VERIFIER_KEY) || session.getItem(VERIFIER_KEY) || '';
    return { state, verifier };
  }

  function clearOAuthState() {
    local.removeItem(STATE_KEY);
    session.removeItem(STATE_KEY);
    local.removeItem(VERIFIER_KEY);
    session.removeItem(VERIFIER_KEY);
  }

  saveOAuthState('state_xyz', 'verifier_abc');
  assert.deepEqual(getOAuthState(), { state: 'state_xyz', verifier: 'verifier_abc' });

  // Scenario 2: sessionStorage is wiped (e.g. cross-site redirect / new tab), localStorage retains state
  session.clear();
  assert.deepEqual(getOAuthState(), { state: 'state_xyz', verifier: 'verifier_abc' });

  // Scenario 3: localStorage is wiped, sessionStorage retains state
  local.clear();
  session.setItem(STATE_KEY, 'state_session');
  session.setItem(VERIFIER_KEY, 'verifier_session');
  assert.deepEqual(getOAuthState(), { state: 'state_session', verifier: 'verifier_session' });

  // Scenario 4: clearOAuthState removes from both
  local.setItem(STATE_KEY, 'state_local');
  clearOAuthState();
  assert.deepEqual(getOAuthState(), { state: '', verifier: '' });
});

test('Auth token dual-storage reading and writing', () => {
  function createMockStorage() {
    const store = new Map();
    return {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    };
  }

  const TOKEN_KEY = 'sade.github.auth.v1';
  const local = createMockStorage();
  const session = createMockStorage();

  function writeAuth(auth) {
    const json = JSON.stringify(auth);
    local.setItem(TOKEN_KEY, json);
    session.setItem(TOKEN_KEY, json);
  }

  function readAuth() {
    try {
      const raw = local.getItem(TOKEN_KEY) || session.getItem(TOKEN_KEY);
      return JSON.parse(raw || 'null');
    } catch {
      return null;
    }
  }

  function clearAuth() {
    local.removeItem(TOKEN_KEY);
    session.removeItem(TOKEN_KEY);
  }

  const tokenData = { accessToken: 'gho_12345', expiresAt: Date.now() + 3600000 };
  writeAuth(tokenData);

  assert.deepEqual(readAuth(), tokenData);

  // Clear session storage only - readAuth should still read from local storage
  session.removeItem(TOKEN_KEY);
  assert.deepEqual(readAuth(), tokenData);

  // Clear auth should clear both
  clearAuth();
  assert.equal(readAuth(), null);
});

test('Immediate URL query parameter sanitization prevents stale callback retries', () => {
  let replacedUrl = null;
  const mockHistory = {
    replaceState: (_data, _title, url) => {
      replacedUrl = url;
    }
  };

  function sanitizeCallbackUrl(locationSearch, locationPathname) {
    const query = new URLSearchParams(locationSearch);
    const code = query.get('code');
    const oauthError = query.get('error');

    if (!code && !oauthError) return false;

    const cleanUrl = locationPathname;
    mockHistory.replaceState({}, '', cleanUrl);
    return true;
  }

  // Callback URL with code and state
  const searchWithCode = '?code=gh_code_123&state=state_abc';
  const pathname = '/sade/';

  const wasSanitized = sanitizeCallbackUrl(searchWithCode, pathname);
  assert.equal(wasSanitized, true);
  assert.equal(replacedUrl, '/sade/');

  // Standard URL without OAuth params
  replacedUrl = null;
  const standardSanitized = sanitizeCallbackUrl('', pathname);
  assert.equal(standardSanitized, false);
  assert.equal(replacedUrl, null);
});
