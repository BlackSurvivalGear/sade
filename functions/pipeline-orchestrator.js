const { getSession, updateSession, appendMessage } = require('./firestore');

const STAGES = ['intake', 'recon', 'architecture', 'plan', 'implementation', 'audit', 'validation', 'pr'];
const TERMINAL = new Set(['COMPLETE', 'FAILED', 'BLOCKED']);

function stageIndex(stage) {
  return STAGES.indexOf(stage);
}

function assertTransition(currentStage, nextStage) {
  if (!STAGES.includes(nextStage)) throw new Error(`Unknown pipeline stage: ${nextStage}`);
  if (stageIndex(nextStage) < stageIndex(currentStage)) throw new Error('Pipeline cannot move backwards.');
  if (stageIndex(nextStage) > stageIndex(currentStage) + 1) throw new Error('Pipeline stages must advance sequentially.');
}

async function advancePipeline({ uid, sessionId, stage, status = 'RUNNING', artifact = null }) {
  const session = await getSession({ uid, sessionId });
  if (!session) throw Object.assign(new Error('Session not found.'), { status: 404 });
  const current = session.currentStage || 'intake';
  assertTransition(current, stage);

  const pipeline = { ...(session.pipeline || {}) };
  pipeline[stage] = status;

  const patch = {
    currentStage: stage,
    status,
    pipeline
  };
  if (artifact !== null) patch.artifacts = { ...(session.artifacts || {}), [stage]: artifact };
  if (TERMINAL.has(status)) patch.status = status;

  const updated = await updateSession({ uid, sessionId, patch });
  await appendMessage({ uid, sessionId, role: 'system', content: `Pipeline stage ${stage}: ${status}`, stage });
  return updated;
}

function listStages() {
  return [...STAGES];
}

module.exports = { STAGES, advancePipeline, listStages };
