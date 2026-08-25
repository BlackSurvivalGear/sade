(() => {
  const BACKEND_SCRIPT = 'js/sade-backend.js';
  const FIREBASE_CONFIG_SCRIPT = 'config/firebase-config.js';
  const FIREBASE_SCRIPT = 'js/sade-firebase.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(script => script.src.endsWith(src))) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}.`));
      document.head.appendChild(script);
    });
  }

  async function ensureBackend() {
    if (!window.SADE_BACKEND) {
      await loadScript(FIREBASE_CONFIG_SCRIPT);
      await loadScript(FIREBASE_SCRIPT);
      await loadScript(BACKEND_SCRIPT);
    }
    if (!window.SADE_BACKEND) throw new Error('SADE backend client is unavailable.');
    await window.SADE_BACKEND.initialise();
    if (!window.SADE_BACKEND.isEnabled()) {
      throw new Error('SADE backend is not configured. Set config/sade-backend.json enabled=true and provide the deployed Firebase Functions base URL.');
    }
  }

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[character]));

  function renderResult(result) {
    const evidence = result.evidence || {};
    const audit = result.audit || {};
    const validation = result.validation || {};
    const patches = result.patches;
    const output = result.output || 'No engineering analysis was returned.';
    const files = Array.isArray(evidence.filesInspected) ? evidence.filesInspected : [];
    const patchText = typeof patches === 'string' ? patches : JSON.stringify(patches, null, 2);
    const auditText = typeof audit === 'string' ? audit : JSON.stringify(audit, null, 2);
    const validationText = typeof validation === 'string' ? validation : JSON.stringify(validation, null, 2);
    return [
      'REAL SADE ENGINEERING RUN COMPLETE',
      '',
      `Repository: ${result.repository?.fullName || state.selectedRepository?.fullName || 'unknown'}`,
      `Branch: ${result.branch || state.selectedBranch || 'unknown'}`,
      `Evidence inspected: ${files.length} files / ${evidence.treeCount ?? 'unknown'} tree entries`,
      `Tree truncated: ${Boolean(evidence.truncated)}`,
      '',
      '=== ENGINEERING ANALYSIS ===',
      output,
      '',
      '=== PROPOSED PATCHES ===',
      patchText,
      '',
      '=== AUDIT ===',
      auditText,
      '',
      '=== VALIDATION ===',
      validationText,
      '',
      '=== INSPECTED FILES ===',
      files.join('\n')
    ].join('\n');
  }

  function setPipelineState(index, message) {
    if (typeof state === 'undefined') return;
    state.progressIndex = index;
    if (typeof renderProgress === 'function') renderProgress();
    if (typeof announceAgent === 'function') announceAgent(currentAgentForStage(index), message);
  }

  async function runRealEngineering(objective) {
    if (typeof state === 'undefined' || state.workflowRunning) return;
    if (!state.selectedRepository || !state.selectedBranch) throw new Error('Select a repository and working branch first.');

    state.workflowRunning = true;
    const input = $('#messageInput');
    if (input) input.disabled = true;
    if (typeof addMessage === 'function') addMessage('SADE is executing the real backend engineering pipeline. Repository evidence will be inspected before analysis.', 'sade');

    try {
      await ensureBackend();
      setPipelineState(0, 'Backend connection established. Starting repository-aware engineering run.');
      const result = await window.SADE_BACKEND.runEngineering(objective, state.selectedRepository.fullName, state.selectedBranch);

      setPipelineState(Math.min(1, state.steps.length - 1), `Reconnaissance complete: ${result.evidence?.filesInspected?.length || 0} repository files inspected.`);
      if (state.steps.length > 2) setPipelineState(Math.min(2, state.steps.length - 1), 'Architecture and implementation analysis returned by the backend.');
      if (state.steps.length > 3) setPipelineState(Math.min(3, state.steps.length - 1), 'Patch proposal generated from the inspected repository evidence.');
      if (state.steps.length > 5) setPipelineState(Math.min(5, state.steps.length - 1), 'Independent audit result returned.');
      if (state.steps.length > 7) setPipelineState(Math.min(7, state.steps.length - 1), 'Validation result returned. No repository write was performed.');
      state.progressIndex = state.steps.length - 1;
      if (typeof renderProgress === 'function') renderProgress();
      if (typeof announceAgent === 'function') announceAgent(currentAgentForStage(state.progressIndex), 'Real backend engineering run complete. Awaiting Commander review and approval.');
      if (typeof addMessage === 'function') addMessage(renderResult(result), 'sade');
      if (typeof persistCurrentMessages === 'function') persistCurrentMessages();
    } catch (error) {
      if (typeof addMessage === 'function') addMessage(`REAL BACKEND RUN FAILED\n\n${error.message}`, 'sade');
      if (typeof announceAgent === 'function') announceAgent(null, 'Backend run failed. No repository changes were made by this operation.');
    } finally {
      state.workflowRunning = false;
      if (input) { input.disabled = false; input.focus(); }
    }
  }

  function interceptSubmit(event) {
    if (!event.target || event.target.id !== 'chatForm') return;
    const input = $('#messageInput');
    const objective = input?.value.trim();
    if (!objective || state.workflowRunning) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof addMessage === 'function') addMessage(objective, 'user');
    input.value = '';
    runRealEngineering(objective).catch(error => {
      if (typeof addMessage === 'function') addMessage(`SADE could not start the backend run: ${error.message}`, 'sade');
      state.workflowRunning = false;
      input.disabled = false;
    });
  }

  document.addEventListener('submit', interceptSubmit, true);
  window.SADE_REAL_ENGINEERING = { run: runRealEngineering };
})();
