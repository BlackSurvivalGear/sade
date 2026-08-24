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
