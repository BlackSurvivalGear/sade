const crypto = require('node:crypto');

function sanitizeBranchPart(value) {
  return String(value || 'task').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'task';
}

function validatePatchFiles(patches) {
  if (!patches || !Array.isArray(patches.files) || patches.files.length === 0) throw new Error('No patch files supplied.');
  if (patches.files.length > 20) throw new Error('Writer limit exceeded: maximum 20 files per controlled write.');
  for (const file of patches.files) {
    if (!file.path || file.path.startsWith('/') || file.path.includes('..')) throw new Error(`Unsafe repository path: ${file.path || '(missing)'}`);
    if (!['modify', 'create', 'delete'].includes(file.action)) throw new Error(`Unsupported patch action for ${file.path}.`);
    if (file.action !== 'delete' && typeof file.content !== 'string') throw new Error(`Writer requires complete file content for ${file.path}. Regenerate the patch with content.`);
    if (typeof file.content === 'string' && Buffer.byteLength(file.content, 'utf8') > 200 * 1024) throw new Error(`File too large for controlled write: ${file.path}.`);
  }
}

function proposalHash({ objective, repository, branch, patches }) {
  return crypto.createHash('sha256').update(JSON.stringify({ objective, repository, branch, patches })).digest('hex');
}

async function writeApprovedProposal({ githubRequest, installationToken, owner, repo, baseBranch, objective, patches, validation }) {
  if (validation?.status !== 'READY' && validation?.verdict !== 'READY') throw new Error('Controlled write blocked: Validator must return READY.');
  if (validation?.writeAllowed !== false) throw new Error('Controlled write blocked: validation must explicitly set writeAllowed=false until human approval is supplied.');
  validatePatchFiles(patches);

  const base = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`, installationToken);
  const parentSha = base.object.sha;
  const branchName = `sade/${sanitizeBranchPart(objective)}-${parentSha.slice(0, 7)}`;

  // Re-read every target immediately before writing. This prevents SADE from overwriting a file changed since Recon.
  const treeChanges = [];
  for (const file of patches.files) {
    const current = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${file.path}?ref=${encodeURIComponent(baseBranch)}`, installationToken);
    const currentSha = Array.isArray(current) ? null : current.sha;
    if (file.action === 'create' && currentSha) throw new Error(`Write blocked: ${file.path} already exists on ${baseBranch}.`);
    if (file.action === 'modify' && !currentSha) throw new Error(`Write blocked: ${file.path} no longer exists on ${baseBranch}.`);
    if (file.expectedSha && currentSha !== file.expectedSha) throw new Error(`Write blocked: ${file.path} changed since validation.`);
    treeChanges.push({ path: file.path, mode: '100644', type: 'blob', content: file.action === 'delete' ? undefined : file.content, sha: file.action === 'delete' ? null : undefined });
  }

  // Create the feature branch from the exact current base commit.
  await githubRequest('/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/git/refs', installationToken, {
    method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: parentSha })
  });

  const tree = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`, installationToken, {
    method: 'POST', body: JSON.stringify({ base_tree: (await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${parentSha}`, installationToken)).tree.sha, tree: treeChanges })
  });
  const commit = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`, installationToken, {
    method: 'POST', body: JSON.stringify({ message: `sade: ${String(objective).trim().slice(0, 72)}`, tree: tree.sha, parents: [parentSha] })
  });
  await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branchName)}`, installationToken, {
    method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return { branch: branchName, parentSha, commitSha: commit.sha, filesWritten: patches.files.map(file => file.path), proposalHash: proposalHash({ objective, repository: `${owner}/${repo}`, branch: baseBranch, patches }) };
}

module.exports = { writeApprovedProposal, proposalHash, validatePatchFiles };
