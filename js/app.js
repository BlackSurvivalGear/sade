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
  sessions: [
    { title: 'New engineering session', time: 'Just now' },
    { title: 'Repository architecture', time: 'Earlier today' },
    { title: 'PR audit', time: 'Yesterday' }
  ],
  steps: fallbackSteps,
  progressIndex: 0
};

const $ = (selector) => document.querySelector(selector);
const landing = $('#landing');
const workspace = $('#workspace');
const launchButton = $('#launchButton');
const sessionsEl = $('#sessions');
const sessionCount = $('#sessionCount');
const newSessionButton = $('#newSessionButton');
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

function renderSessions() {
  sessionCount.textContent = state.sessions.length;
  sessionsEl.innerHTML = state.sessions.map((session, index) => `
    <div class="session ${index === 0 ? 'active' : ''}" data-session="${index}">
      <strong>${escapeHtml(session.title)}</strong>
      <small>${escapeHtml(session.time)}</small>
    </div>
  `).join('');
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

function launch() {
  landing.classList.add('hidden');
  workspace.classList.remove('hidden');
  document.title = 'SADE AI Workspace';
  renderSessions();
  renderProgress();
  messageInput.focus();
}

launchButton.addEventListener('click', launch);

newSessionButton.addEventListener('click', () => {
  state.sessions.unshift({ title: 'New engineering session', time: 'Just now' });
  state.progressIndex = 0;
  renderSessions();
  renderProgress();
  chatMessages.innerHTML = `
    <div class="welcome-message">
      <img src="assets/brand/favi.png" alt="">
      <div><strong>New session ready.</strong><p>Give me the repository, feature or engineering problem.</p></div>
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
    addMessage('Understood. I will begin with repository inspection and architectural understanding before implementation. The current interface is the SADE frontend shell; the engineering backend will execute repository operations and enforce the complete workflow.', 'sade');
  }, 350);
});

renderSessions();
renderProgress();
loadWorkflow();
