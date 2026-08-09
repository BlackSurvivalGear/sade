const admin = require('firebase-admin');

const STAGES = ['intake', 'recon', 'architecture', 'plan', 'implementation', 'audit', 'validation', 'pr'];
const STATUSES = ['PENDING', 'RUNNING', 'COMPLETE', 'BLOCKED'];

function sessionRef(uid, sessionId) {
  if (!uid || !sessionId || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) throw new Error('Invalid session identifier.');
  return admin.firestore().collection('users').doc(uid).collection('sessions').doc(sessionId);
}

function assertStage(stage) {
  if (!STAGES.includes(stage)) throw new Error('Invalid pipeline stage.');
}

function assertStatus(status) {
  if (!STATUSES.includes(status)) throw new Error('Invalid pipeline status.');
}

async function updatePipelineState({ uid, sessionId, stage, status, currentStage = stage, lastError = null }) {
  assertStage(stage);
  assertStatus(status);
  assertStage(currentStage);

  const update = {
    currentStage,
    [`pipeline.${stage}`]: status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (lastError !== null) update.lastError = String(lastError).slice(0, 5000);
  await sessionRef(uid, sessionId).update(update);
  return { stage, status, currentStage };
}

async function completePipelineStage({ uid, sessionId, stage, nextStage = null }) {
  assertStage(stage);
  if (nextStage !== null) assertStage(nextStage);

  const update = {
    [`pipeline.${stage}`]: 'COMPLETE',
    currentStage: nextStage || stage,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (nextStage) update[`pipeline.${nextStage}`] = 'RUNNING';
  await sessionRef(uid, sessionId).update(update);
  return { stage, status: 'COMPLETE', nextStage };
}

module.exports = { STAGES, STATUSES, updatePipelineState, completePipelineStage };
