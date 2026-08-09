const STAGES = ['intake', 'recon', 'architecture', 'plan', 'implementation', 'audit', 'validation', 'pr'];

function assertNext(current, next) {
  const from = STAGES.indexOf(current || 'intake');
  const to = STAGES.indexOf(next);
  if (to < 0) throw new Error(`Unknown pipeline stage: ${next}`);
  if (to < from) throw new Error('Pipeline cannot move backwards.');
  if (to > from + 1) throw new Error('Pipeline stages must advance sequentially.');
}

function nextStage(current) {
  const i = STAGES.indexOf(current || 'intake');
  return STAGES[Math.min(i + 1, STAGES.length - 1)];
}

function advance(session, stage, status = 'RUNNING', artifact = null) {
  const current = session.currentStage || 'intake';
  assertNext(current, stage);
  return {
    ...session,
    currentStage: stage,
    status,
    pipeline: { ...(session.pipeline || {}), [stage]: status },
    ...(artifact === null ? {} : { artifacts: { ...(session.artifacts || {}), [stage]: artifact } })
  };
}

module.exports = { STAGES, assertNext, nextStage, advance };
