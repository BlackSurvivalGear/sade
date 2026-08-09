const { onRequest } = require('firebase-functions/v2/https');
const { defineJsonSecret, defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('node:crypto');
const { generatePatches } = require('./patcher');
const { auditPatches } = require('./auditor');
const { validatePatches } = require('./validator');

admin.initializeApp();

const githubAppConfig = defineJsonSecret('SADE_GITHUB_APP');
const openaiApiKey = defineSecret('SADE_OPENAI_API_KEY');
const API_VERSION = '2026-03-10';
const MAX_FILE_BYTES = 100 * 1024;
const MAX_FILES = 40;

const pipeline = [
  ['intake', 'Intake', 'Orchestrator'],
  ['recon', 'Reconnaissance', 'Recon'],
  ['architecture', 'Architecture', 'Architect'],
  ['plan', 'Plan', 'Planner'],
  ['implementation', 'Implementation', 'Patcher'],
  ['audit', 'Audit', 'Auditor'],
  ['validation', 'Validation', 'Validator'],
  ['pr', 'PR Preparation', 'PR Steward']
];

const constitution = `SADE SOFTWARE ENGINEERING CONSTITUTION

1. Understand before proposing.
2. Inspect evidence before making assumptions.
3. Separate the user's objective from implementation decisions.
4. Prefer the smallest safe change that satisfies the objective.
5. Preserve existing behaviour unless the objective explicitly requires change.
6. Every proposed change must have a validation strategy.
7. Audit proposed results for regressions, security, correctness and maintainability.
8. Never claim code was changed, tested, committed, pushed or merged unless that action actually occurred.
9. When repository evidence is unavailable, say evidence required rather than inventing facts.
10. The user remains the authority for implementation approval and merge approval.`;

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
function send(res, status, body) { cors(res); res.status(status).json(body); }

async function requireUser(req) {
  const header = req.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Firebase authentication required.'), { status: 401 });
  return admin.auth().verifyIdToken(header.slice(7));
}

function appJwt(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(config.appId) })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(config.privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!response.ok) throw Object.assign(new Error(data.message || `GitHub request failed (${response.status}).`), { status: response.status });
  return data;
}

async function installationToken(owner, repo) {
  const config = githubAppConfig.value();
  if (!config?.appId || !config?.privateKey) throw new Error('SADE_GITHUB_APP is not configured.');
  const jwt = appJwt(config);
  const installation = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`, jwt);
  const token = await githubRequest(`/app/installations/${installation.id}/access_tokens`, jwt, { method: 'POST' });
  return token.token;
}

function selectRelevantFiles(tree) {
  const priority = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|vite\.config\.|next\.config\.|firebase\.json|README|tsconfig\.json|jsconfig\.json|src\/|app\/|lib\/|functions\/|config\/|docs\/)/i;
  return (tree.tree || []).filter(item => item.type === 'blob' && item.size <= MAX_FILE_BYTES)
    .sort((a, b) => Number(priority.test(b.path)) - Number(priority.test(a.path)) || a.path.localeCompare(b.path)).slice(0, MAX_FILES);
}

async function inspectRepository(owner, repo, branch) {
  const token = await installationToken(owner, repo);
  const repository = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
  const tree = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
  const selected = selectRelevantFiles(tree);
  const files = [];
  for (const item of selected) {
    try {
      const blob = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${item.sha}`, token);
      const content = blob.encoding === 'base64' ? Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8') : String(blob.content || '');
      files.push({ path: item.path, size: item.size || content.length, content });
    } catch (error) { files.push({ path: item.path, size: item.size || 0, error: error.message }); }
  }
  return { repository: { fullName: repository.full_name, defaultBranch: repository.default_branch, private: repository.private, language: repository.language }, branch, treeCount: tree.tree?.length || 0, truncated: Boolean(tree.truncated), files };
}

function buildInstructions(context) {
  const stages = pipeline.map(([id, name, role], i) => `${i + 1}. ${name} (${role}) [${id}]`).join('\n');
  return `${constitution}\n\nSADE PIPELINE:\n${stages}\n\nYou are SADE's engineering orchestrator. You have been given real repository evidence. Use it as the source of truth. Do not invent files, frameworks, dependencies or repository state. If evidence is incomplete, state exactly what is missing. Produce repository-specific implementation guidance and concrete code changes. Do not claim anything has been committed or merged.`;
}

function contextText(context) {
  return [`REPOSITORY: ${context.repository.fullName}`, `BRANCH: ${context.branch}`, `DEFAULT BRANCH: ${context.repository.defaultBranch}`, `LANGUAGE: ${context.repository.language || 'unknown'}`, `TREE FILE COUNT: ${context.treeCount}`, `TREE TRUNCATED: ${context.truncated}`, '', 'REPOSITORY FILE EVIDENCE:', ...context.files.map(file => `\n===== ${file.path} =====\n${file.error ? `[UNAVAILABLE: ${file.error}]` : file.content}`)].join('\n');
}

async function runOpenAI(objective, context) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey.value()}` },
    body: JSON.stringify({ model: 'gpt-5.4', instructions: buildInstructions(context), input: `ENGINEERING OBJECTIVE:\n${objective}\n\n${contextText(context)}\n\nReturn:\n1. Repository reconnaissance\n2. Architecture assessment\n3. Ordered implementation plan\n4. Exact files to modify/create\n5. Proposed production code or unified patches where practical\n6. Audit findings\n7. Validation/tests\n8. PR proposal\n9. Blockers / evidence still required` })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI request failed (${response.status}).`), { status: response.status });
  return data.output_text || (data.output || []).flatMap(item => item.content || []).map(item => item.text || '').join('\n').trim();
}

async function buildAuditedProposal(objective, context) {
  const patches = await generatePatches({ objective, context, apiKey: openaiApiKey.value() });
  const audit = await auditPatches({ objective, context, patches, apiKey: openaiApiKey.value() });
  const validation = await validatePatches({ objective, context, patches, audit, apiKey: openaiApiKey.value() });
  return { patches, audit, validation };
}

exports.inspectRepository = onRequest({ region: 'europe-west2', secrets: [githubAppConfig] }, async (req, res) => {
  cors(res); if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try { await requireUser(req); const { owner, repo, branch } = req.body || {}; if (!owner || !repo || !branch) return send(res, 400, { error: 'owner, repo and branch are required.' }); return send(res, 200, await inspectRepository(owner, repo, branch)); }
  catch (error) { console.error('inspectRepository', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.runEngineering = onRequest({ region: 'europe-west2', secrets: [githubAppConfig, openaiApiKey], timeoutSeconds: 300, memory: '1GiB' }, async (req, res) => {
  cors(res); if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try {
    const user = await requireUser(req);
    const { objective, owner, repo, branch } = req.body || {};
    if (!objective || !owner || !repo || !branch) return send(res, 400, { error: 'objective, owner, repo and branch are required.' });
    const context = await inspectRepository(owner, repo, branch);
    const output = await runOpenAI(objective, context);
    const proposal = await buildAuditedProposal(objective, context);
    return send(res, 200, { user: user.uid, repository: context.repository, branch, output, ...proposal, evidence: { filesInspected: context.files.map(file => file.path), treeCount: context.treeCount, truncated: context.truncated } });
  } catch (error) { console.error('runEngineering', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.generatePatches = onRequest({ region: 'europe-west2', secrets: [githubAppConfig, openaiApiKey], timeoutSeconds: 300, memory: '1GiB' }, async (req, res) => {
  cors(res); if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try { await requireUser(req); const { objective, owner, repo, branch } = req.body || {}; if (!objective || !owner || !repo || !branch) return send(res, 400, { error: 'objective, owner, repo and branch are required.' }); const context = await inspectRepository(owner, repo, branch); const patches = await generatePatches({ objective, context, apiKey: openaiApiKey.value() }); return send(res, 200, { repository: context.repository, branch, patches, evidence: { filesInspected: context.files.map(file => file.path), treeCount: context.treeCount, truncated: context.truncated } }); }
  catch (error) { console.error('generatePatches', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.auditAndValidate = onRequest({ region: 'europe-west2', secrets: [githubAppConfig, openaiApiKey], timeoutSeconds: 300, memory: '1GiB' }, async (req, res) => {
  cors(res); if (req.method === 'OPTIONS') return res.status(204).send(''); if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try { await requireUser(req); const { objective, owner, repo, branch } = req.body || {}; if (!objective || !owner || !repo || !branch) return send(res, 400, { error: 'objective, owner, repo and branch are required.' }); const context = await inspectRepository(owner, repo, branch); const proposal = await buildAuditedProposal(objective, context); return send(res, 200, { repository: context.repository, branch, ...proposal, evidence: { filesInspected: context.files.map(file => file.path), treeCount: context.treeCount, truncated: context.truncated } }); }
  catch (error) { console.error('auditAndValidate', error); return send(res, error.status || 500, { error: error.message }); }
});
