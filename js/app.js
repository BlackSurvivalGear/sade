const fallbackSteps = [
  'Inspect repository',
  'Understand architecture',
  'Plan implementation',
  'Write production code',
  'Run tests',
  'Audit diff',
  'Fix findings',
  'Validate',
  'Prepare PR'
];

const state = {
  githubConnected: false,
  previewMode: false,
  repositories: [],
  selectedRepository: null,
  selectedBranch: null,
  sessions: [
    { title: 'New engineering session', time: 'Just now' },
    { title: 'Repository architecture', time: 'Earlier today' },
    { title: 'PR audit', time: 'Yesterday' }
  ],
  steps: fallbackSteps,
  progressIndex: 0
};

const $ = (selector) => document.querySelector(selector);
const repositoryHome = $('#repositoryHome');
const workspace = $('#workspace');
const connectGithub = $('#connectGithub');
const connectGithubSecondary = $('#connectGithubSecondary');
const connectionPill = $('#connectionPill');
const accountChip = $('#accountChip');
const repoSubtitle = $('#repoSubtitle');
const repoSearch = $('#repoSearch');
const repoList = $('#repoList');
const workspaceRepo = $('#workspaceRepo');
const chatSubtitle = $('#chatSubtitle');
const repoChip = $('#repoChip');
const sessionsEl = $('#sessions');
const sessionCount = $('#sessionCount');
const newSessionButton = $('#newSessionButton');
const backHomeButton = $('#backHomeButton');
const chatForm = $('#chatForm');
const messageInput = $('#messageInput');
const chatMessages = $('#chatMessages');
const progressSteps = $('#progressSteps');
const progressBar = $('#progressBar');
const progressPercent = $('.progress-percent');

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function renderConnectionState() {
  if (state.githubConnected) {
    connectionPill.classList.add('connected');
    connectionPill.innerHTML = '<span class="status-dot"></span> GITHUB · PREVIEW CONNECTED';
    connectGithub.textContent = 'GitHub settings';
    repoSearch.disabled = false;
    accountChip.hidden = false;
    accountChip.textContent = 'BlackSurvivalGear';
    repoSubtitle.textContent = 'Repository data is ready for selection. Live OAuth will replace this preview connection.';
  } else {
    connectionPill.classList.remove('connected');
    connectionPill.innerHTML = '<span class="status-dot muted"></span> GITHUB NOT CONNECTED';
    connectGithub.textContent = 'Connect GitHub';
    repoSearch.disabled = true;
    accountChip.hidden = true;
    repoSubtitle.textContent = 'Connect GitHub to load your repositories.';
  }
}

function renderRepositories(filter = '') {
  if (!state.githubConnected) {
    repoList.innerHTML = `
      <div class="connection-empty">
        <div class="empty-icon">GH</div>
        <strong>Connect GitHub to begin</strong>
        <p>SADE will use authorised GitHub access to discover repositories, branches and engineering sessions.</p>
        <button id="connectGithubInline" class="launch-button" type="button">Connect GitHub <span class="arrow">→</span></button>
      </div>`;
    $('#connectGithubInline').addEventListener('click', connectGitHubPreview);
    return;
  }

  const query = filter.trim().toLowerCase();
  const repositories = state.repositories.filter((repository) => {
    return !query || `${repository.owner}/${repository.name} ${repository.description} ${repository.language}`.toLowerCase().includes(query);
  });

  if (!repositories.length) {
    repoList.innerHTML = '<div class="connection-empty"><div class="empty-icon">⌕</div><strong>No repositories found</strong><p>Try another repository name.</p></div>';
    return;
  }

  repoList.innerHTML = repositories.map((repository) => `
    <button class="repo-card" type="button" data-repository="${escapeHtml(repository.fullName)}">
      <span class="repo-avatar">${escapeHtml(repository.initials)}</span>
      <span class="repo-main">
        <span class="repo-name">${escapeHtml(repository.owner)} <span>/ ${escapeHtml(repository.name)}</span></span>
        <span class="repo-meta">${escapeHtml(repository.language)} · ${escapeHtml(repository.defaultBranch)} · ${escapeHtml(repository.description)}</span>
      </span>
      <span class="repo-arrow" aria-hidden="true">›</span>
    </button>`).join('');

  repoList.querySelectorAll('[data-repository]').forEach((button) => {
    button.addEventListener('click', () => selectRepository(button.dataset.repository));
  });
}

function selectRepository(fullName) {
  const repository = state.repositories.find((item) => item.fullName === fullName);
  if (!repository) return;
  state.selectedRepository = repository;
  renderBranchSelector(repository);
}

function renderBranchSelector(repository) {
  repoList.innerHTML = `
    <div class="branch-panel">
      <button class="back-link" id="backToRepositories" type="button">← All repositories</button>
      <div class="selected-repo">
        <div class="repo-avatar">${escapeHtml(repository.initials)}</div>
        <div><strong>${escapeHtml(repository.owner)} / ${escapeHtml(repository.name)}</strong><small>${escapeHtml(repository.description)}</small></div>
      </div>
      <label class="branch-label" for="branchSelect">Working branch</label>
      <select id="branchSelect" class="branch-select">
        ${repository.branches.map((branch) => `<option value="${escapeHtml(branch)}" ${branch === repository.defaultBranch ? 'selected' : ''}>${escapeHtml(branch)}${branch === repository.defaultBranch ? ' · default' : ''}</option>`).join('')}
      </select>
      <button id="startSessionButton" class="launch-button start-session" type="button">Start engineering session <span class="arrow">→</span></button>
      <p class="branch-note">SADE will inspect this branch before proposing or making implementation changes.</p>
    </div>`;

  $('#backToRepositories').addEventListener('click', () => renderRepositories(repoSearch.value));
  $('#startSessionButton').addEventListener('click', () => {
    state.selectedBranch = $('#branchSelect').value;
    launchWorkspace();
  });
}

function renderSessions() {
  sessionCount.textContent = state.sessions.length;
  sessionsEl.innerHTML = state.sessions.map((session, index) => `
    <div class="session ${index === 0 ? 'active' : ''}" data-session="${index}">
      <strong>${escapeHtml(session.title)}</strong>
      <small>${escapeHtml(session.time)}</small>
    </div>`).join('');
}

function renderProgress() {
  progressSteps.innerHTML = state.steps.map((step, index) => {
    const status = index < state.progressIndex ? 'done' : index === state.progressIndex ? 'current' : '';
    return `<div class="step ${status}"><span class="step-icon">${index < state.progressIndex ? '✓' : index + 1}</span><span>${escapeHtml(step)}</span></div>`;
  }).join('');

  const percent = state.progressIndex === 0
    ? 0
    : Math.round((state.progressIndex / Math.max(state.steps.length - 1, 1)) * 100);
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
}

function addMessage(text, type) {
  const element = document.createElement('div');
  element.className = `message ${type}`;
  element.textContent = text;
  chatMessages.appendChild(element);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadWorkflow() {
  try {
    const response = await fetch('config/engineering-workflow.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Workflow request failed: ${response.status}`);
    const workflow = await response.json();
    if (Array.isArray(workflow.stages) && workflow.stages.length) {
      state.steps = workflow.stages.map((stage) => stage.name);
    }
  } catch (error) {
    console.warn('Using local workflow fallback.', error);
  }
  renderProgress();
}

async function loadRepositories() {
  try {
    const response = await fetch('config/repositories.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Repository request failed: ${response.status}`);
    const data = await response.json();
    state.repositories = Array.isArray(data.repositories) ? data.repositories : [];
  } catch (error) {
    console.warn('Repository preview data unavailable.', error);
    state.repositories = [];
  }
}

async function connectGitHubPreview() {
  if (state.githubConnected) return;
  await loadRepositories();
  state.githubConnected = true;
  state.previewMode = true;
  renderConnectionState();
  renderRepositories();
}

function launchWorkspace() {
  if (!state.selectedRepository || !state.selectedBranch) return;
  repositoryHome.classList.add('hidden');
  workspace.classList.remove('hidden');
  const repoName = `${state.selectedRepository.owner} / ${state.selectedRepository.name}`;
  workspaceRepo.textContent = `${repoName} · ${state.selectedBranch}`;
  chatSubtitle.textContent = `${repoName} · branch ${state.selectedBranch}`;
  repoChip.textContent = `GITHUB · ${state.previewMode ? 'PREVIEW' : 'CONNECTED'}`;
  document.title = `SADE AI — ${repoName}`;
  renderSessions();
  renderProgress();
  messageInput.focus();
}

function returnHome() {
  workspace.classList.add('hidden');
  repositoryHome.classList.remove('hidden');
  renderConnectionState();
  renderRepositories(repoSearch.value);
}

connectGithub.addEventListener('click', connectGitHubPreview);
connectGithubSecondary.addEventListener('click', connectGitHubPreview);
repoSearch.addEventListener('input', () => renderRepositories(repoSearch.value));
backHomeButton.addEventListener('click', returnHome);

newSessionButton.addEventListener('click', () => {
  state.sessions.unshift({ title: 'New engineering session', time: 'Just now' });
  state.progressIndex = 0;
  renderSessions();
  renderProgress();
  chatMessages.innerHTML = `
    <div class="welcome-message">
      <img src="assets/brand/favi.png" alt="">
      <div><strong>New session ready.</strong><p>Give me the engineering task. SADE will begin with repository inspection.</p></div>
    </div>`;
  messageInput.focus();
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  messageInput.value = '';
  state.progressIndex = Math.max(state.progressIndex, 1);
  renderProgress();

  window.setTimeout(() => {
    addMessage(`Understood. I will inspect ${state.selectedRepository?.fullName || 'the selected repository'} on branch ${state.selectedBranch || 'main'} before making changes.`, 'sade');
  }, 350);
});

renderConnectionState();
renderRepositories();
renderProgress();
loadWorkflow();
