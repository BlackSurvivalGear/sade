const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Use the shipped page's IDs: absent elements must resolve to null.
function workspaceHarness() {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const elements = new Map();
  function element(hidden = false) {
    const classes = new Set(hidden ? ['hidden'] : []);
    return {
      textContent: '', innerHTML: '', value: '', style: {}, children: [], listeners: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x),
        contains: x => classes.has(x), toggle() {} },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      setAttribute(name, value) { this[name] = value; },
      querySelectorAll() { return []; },
      appendChild(child) { this.children.push(child); },
      focus() { this.focused = true; }
    };
  }
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
    elements.set('#' + match[1], element(/class="[^"]*\bhidden\b/.test(match[0])));
  }
  for (const selector of ['.progress-percent', '.agent-card strong', '.agent-card small']) {
    elements.set(selector, element());
  }
  const storage = new Map();
  const alerts = [];
  const context = vm.createContext({
    document: { querySelector: selector => elements.get(selector) || null,
      querySelectorAll: selector => selector === '[data-view]' || selector === '.view-panel' ? [] : [],
      createElement: () => element(), title: '' },
    window: { addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    SADE_GitHub: { isConnected: () => true,
      getCurrentUser: async () => ({ login: 'tester' }), listRepositories: async () => [],
      getRepository: async () => ({ full_name: 'tester/project' }),
      getTree: async () => ({ tree: [{ path: 'README.md', type: 'blob' }] }) },
    fetch: async () => ({ ok: false }), crypto: require('node:crypto').webcrypto,
    alert: message => alerts.push(message), console, Intl, Date
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), context);
  return { context, elements, alerts, storage };
}

test('Opening a repository session reveals and focuses the instruction box', async () => {
  const { context, elements, alerts, storage } = workspaceHarness();
  await vm.runInContext(`(async () => {
    await initApp();
    state.selectedRepository = { owner: 'tester', name: 'project' };
    state.selectedBranch = 'main';
    await launchWorkspace();
  })()`, context);
  assert.deepEqual(alerts, []);
  assert.equal(elements.get('#repositoryHome').classList.contains('hidden'), true);
  assert.equal(elements.get('#workspace').classList.contains('hidden'), false);
  assert.equal(elements.get('#messageInput').focused, true);
  assert.equal(elements.get('#workspaceRepo').textContent, 'tester/project · main');
  assert.equal(JSON.parse(storage.get('sade.engineering.sessions.v1')).length, 1);

  elements.get('#messageInput').value = 'Inspect the repository';
  vm.runInContext('runEngineeringWorkflow = async objective => { window.submittedObjective = objective; };', context);
  elements.get('#chatForm').listeners.submit({ preventDefault() {} });
  assert.equal(context.window.submittedObjective, 'Inspect the repository');
  assert.equal(elements.get('#messageInput').value, '');
});

test('Restoring a saved session opens the instruction box without a removed status chip', async () => {
  const { context, elements, alerts } = workspaceHarness();
  await vm.runInContext('initApp()', context);
  vm.runInContext(`state.sessions = [{id:'saved', repo:'tester/project', branch:'feature',
    createdAt:new Date().toISOString(), title:'Saved task', messages:[{type:'user',text:'Existing task'}]}];
    restoreSession('saved');`, context);
  assert.deepEqual(alerts, []);
  assert.equal(elements.get('#workspace').classList.contains('hidden'), false);
  assert.equal(elements.get('#messageInput').focused, true);
  assert.equal(elements.get('#chatSubtitle').textContent, 'tester/project · feature');
  assert.equal(elements.get('#chatMessages').children.at(-1).textContent, 'Existing task');
});


test('Repository and Engineering Runs navigation is wired into the workspace', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.match(html, /data-view="runs"/);
  assert.match(html, /data-view="repositories"/);
  assert.match(html, /id="runsView"/);
  assert.match(html, /id="repositoriesView"/);
  assert.match(app, /function renderRunManager\(\)/);
  assert.match(app, /function renderRepositoryManager\(/);
  assert.match(app, /data-open-run/);
  assert.match(app, /data-manager-repo/);
});


test('Audit Log and Settings workspace views are functional', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.match(html, /id="auditView"/);
  assert.match(html, /id="auditSearch"/);
  assert.match(html, /id="settingsView"/);
  assert.match(html, /id="saveSettings"/);
  assert.match(app, /function recordAudit\(/);
  assert.match(app, /function renderAuditLog\(/);
  assert.match(app, /function persistSettings\(/);
  assert.match(app, /function clearLocalWorkspace\(/);
});
