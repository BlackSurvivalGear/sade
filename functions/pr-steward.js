const crypto = require('node:crypto');

function sanitizeTitle(objective) {
  const title = String(objective || 'SADE engineering change').replace(/\s+/g, ' ').trim();
  return `sade: ${title.slice(0, 68)}`;
}

function validateRequest({ approval, validation, baseBranch, featureBranch, commitSha }) {
  if (approval !== true) throw new Error('PR creation requires explicit human approval.');
  if (!validation || (validation.status !== 'READY' && validation.verdict !== 'READY')) {
    throw new Error('PR creation blocked: Validator must return READY.');
  }
  if (validation.writeAllowed !== false) {
    throw new Error('PR creation blocked: validation must explicitly keep writeAllowed=false.');
  }
  if (!baseBranch || !featureBranch || baseBranch === featureBranch) {
    throw new Error('A distinct base branch and feature branch are required.');
  }
  if (!String(featureBranch).startsWith('sade/')) {
    throw new Error('PR creation blocked: feature branch must be a SADE-controlled branch.');
  }
  if (commitSha && !/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error('Invalid feature branch commit SHA.');
  }
}

function proposalHash({ objective, repository, baseBranch, featureBranch, commitSha, validation }) {
  return crypto.createHash('sha256').update(JSON.stringify({ objective, repository, baseBranch, featureBranch, commitSha, validation })).digest('hex');
}

function buildBody({ objective, baseBranch, featureBranch, commitSha, proposalHash: hash, validation, auditSummary }) {
  const checks = Array.isArray(validation?.checks)
    ? validation.checks.map(check => `- ${check.name}: ${check.status} — ${check.details || ''}`).join('\n')
    : '- Validator checks were not supplied.';
  const actions = Array.isArray(validation?.requiredActions) && validation.requiredActions.length
    ? validation.requiredActions.map(action => `- ${action}`).join('\n')
    : '- None.';
  const tests = Array.isArray(validation?.testPlan) && validation.testPlan.length
    ? validation.testPlan.map(test => `- ${test}`).join('\n')
    : '- Validation plan not supplied.';

  return [
    '## SADE Engineering Change',
    '',
    `**Objective:** ${objective}`,
    `**Base:** \`${baseBranch}\``,
    `**Feature branch:** \`${featureBranch}\``,
    `**Feature commit:** \`${commitSha}\``,
    `**Proposal hash:** \`${hash}\``,
    '',
    '### Validator',
    `**Verdict:** ${validation.verdict || validation.status}`,
    `**Summary:** ${validation.summary || 'No summary supplied.'}`,
    '',
    '### Validation checks',
    checks,
    '',
    '### Required actions',
    actions,
    '',
    '### Test plan',
    tests,
    '',
    '### Auditor',
    auditSummary || 'Audit summary not supplied.',
    '',
    '### SADE safety boundary',
    '- This PR was created only after explicit human approval.',
    '- SADE does not merge this PR.',
    '- SADE does not claim CI/test success unless GitHub reports it.',
    '- Merge remains a separate human-controlled operation.',
  ].join('\n');
}

async function createApprovedPullRequest({ githubRequest, installationToken, owner, repo, objective, baseBranch, featureBranch, commitSha, validation, approval, auditSummary, proposalHash: suppliedHash }) {
  validateRequest({ approval, validation, baseBranch, featureBranch, commitSha });

  const base = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`, installationToken);
  const head = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(featureBranch)}`, installationToken);
  const actualHeadSha = head.object.sha;

  if (commitSha && actualHeadSha.toLowerCase() !== commitSha.toLowerCase()) {
    throw new Error('PR creation blocked: feature branch changed after approval. Regenerate and approve the current proposal.');
  }
  if (actualHeadSha === base.object.sha) {
    throw new Error('PR creation blocked: feature branch contains no changes relative to the base branch.');
  }

  const repository = `${owner}/${repo}`;
  const hash = proposalHash({ objective, repository, baseBranch, featureBranch, commitSha: actualHeadSha, validation });
  if (suppliedHash && suppliedHash !== hash) {
    throw new Error('PR creation blocked: proposal hash does not match the approved validation state.');
  }

  const existing = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&base=${encodeURIComponent(baseBranch)}&head=${encodeURIComponent(`${owner}:${featureBranch}`)}`, installationToken);
  if (Array.isArray(existing) && existing.length) {
    const existingPr = existing[0];
    return {
      status: 'ALREADY_OPEN',
      pullRequestNumber: existingPr.number,
      pullRequestUrl: existingPr.html_url,
      baseBranch,
      featureBranch,
      commitSha: actualHeadSha,
      proposalHash: hash,
    };
  }

  const pr = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, installationToken, {
    method: 'POST',
    body: JSON.stringify({
      title: sanitizeTitle(objective),
      head: featureBranch,
      base: baseBranch,
      body: buildBody({ objective, baseBranch, featureBranch, commitSha: actualHeadSha, proposalHash: hash, validation, auditSummary }),
      maintainer_can_modify: false,
    })
  });

  return {
    status: 'PR_CREATED',
    pullRequestNumber: pr.number,
    pullRequestUrl: pr.html_url,
    baseBranch,
    featureBranch,
    commitSha: actualHeadSha,
    proposalHash: hash,
    mergeAllowed: false,
  };
}

module.exports = { createApprovedPullRequest, proposalHash, validateRequest };
