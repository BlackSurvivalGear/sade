(() => {
  const FORM_ID = 'chatForm';
  const SUBMIT_ID = 'chatSubmit';

  const get = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[character]));

  function addMessage(text, type = 'sade') {
    const messages = get('chatMessages');
    if (!messages) return;
    const element = document.createElement('div');
    element.className = `message ${type}`;
    element.textContent = text;
    messages.appendChild(element);
    messages.scrollTop = messages.scrollHeight;
  }

  function setStatus(text, percent = 0) {
    const event = get('agentEvent');
    const bar = get('progressBar');
    const label = document.querySelector('.progress-percent');
    if (event) event.innerHTML = `<strong>SADE Orchestrator</strong> · ${escapeHtml(text)}`;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (label) label.textContent = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function currentTarget() {
    const title = get('workspaceRepo')?.textContent || '';
    const match = title.match(/^([^\s]+\/[^\s]+)\s·\s(.+)$/);
    if (!match) throw new Error('No repository and branch are selected.');
    const [owner, repo] = match[1].split('/');
    return { owner, repo, repository: match[1], branch: match[2] };
  }

  async function ensureFirebaseUser() {
    if (!window.SADE_FIREBASE) throw new Error('Firebase authentication client is not loaded.');
    await window.SADE_FIREBASE.initialise();
    if (!window.SADE_FIREBASE.isReady()) {
      setStatus('Sign in to SADE with your Google account…', 5);
      await window.SADE_FIREBASE.signIn();
    }
    if (!window.SADE_FIREBASE.isReady()) throw new Error('Firebase authentication did not establish a signed-in user.');
  }

  async function runRealEngineering(objective) {
    if (!window.SADE_BACKEND?.isEnabled()) {
      throw new Error('SADE engineering backend is not enabled yet. Firebase Functions deployment and backend configuration are still required.');
    }
    await ensureFirebaseUser();
    const target = currentTarget();
    setStatus('Inspecting the live repository…', 15);
    const result = await window.SADE_BACKEND.runEngineering(objective, `${target.owner}/${target.repo}`, target.branch);
    setStatus('Engineering analysis, audit and validation completed.', 100);
    return result;
  }

  function renderResult(result) {
    addMessage(result?.output || 'SADE returned no engineering analysis.');
    if (result?.evidence) addMessage(`LIVE EVIDENCE\nFiles inspected: ${result.evidence.filesInspected?.length ?? 0}\nTree entries: ${result.evidence.treeCount ?? 0}\nTree truncated: ${result.evidence.truncated ? 'yes' : 'no'}`);
    if (result?.audit) addMessage(`AUDIT\n${JSON.stringify(result.audit, null, 2)}`);
    if (result?.validation) addMessage(`VALIDATION\n${JSON.stringify(result.validation, null, 2)}`);
    if (result?.patches) addMessage(`PROPOSED PATCHES\n${JSON.stringify(result.patches, null, 2)}`);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = get('messageInput');
    const button = get(SUBMIT_ID);
    const objective = input?.value.trim();
    if (!objective || button?.disabled) return;
    if (button) button.disabled = true;
    input.disabled = true;
    addMessage(objective, 'user');
    input.value = '';
    try {
      setStatus('Starting the real engineering pipeline…', 5);
      renderResult(await runRealEngineering(objective));
    } catch (error) {
      setStatus('Engineering run blocked.', 0);
      addMessage(`SADE could not execute the real engineering pipeline.\n\n${error.message}`);
    } finally {
      button.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id === FORM_ID) handleSubmit(event);
  }, true);
})();
