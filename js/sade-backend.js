const SADE_BACKEND = (() => {
  const CONFIG_PATH = 'config/sade-backend.json';
  let config = { enabled: false, baseUrl: '' };

  async function initialise() {
    try {
      const response = await fetch(CONFIG_PATH, { cache: 'no-store' });
      if (response.ok) config = await response.json();
    } catch (error) {
      console.warn('SADE backend configuration unavailable.', error);
    }
    return config;
  }

  function isEnabled() { return Boolean(config.enabled && config.baseUrl); }

  async function request(path, body) {
    if (!isEnabled()) throw new Error('SADE backend mode is not configured.');
    const token = await window.SADE_FIREBASE?.getIdToken?.();
    if (!token) throw new Error('Sign in to SADE before using repository engineering mode.');
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `SADE backend request failed (${response.status}).`);
    return data;
  }

  async function inspectRepository(repository, branch) {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) throw new Error('Repository must use owner/name format.');
    return request('/inspectRepository', { owner, repo, branch });
  }

  async function runEngineering(objective, repository, branch) {
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) throw new Error('Repository must use owner/name format.');
    return request('/runEngineering', { objective, owner, repo, branch });
  }

  return { initialise, isEnabled, inspectRepository, runEngineering };
})();
