const admin = require('firebase-admin');

const db = () => admin.firestore();

function clean(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  return String(value);
}

function sessionRef(uid, sessionId) {
  if (!uid || !sessionId || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) throw new Error('Invalid session identifier.');
  return db().collection('users').doc(uid).collection('sessions').doc(sessionId);
}

async function createSession({ uid, sessionId, repository, branch, objective }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const data = {
    repository: clean(repository),
    branch: clean(branch),
    objective: clean(objective),
    status: 'INTAKE',
    currentStage: 'intake',
    createdAt: now,
    updatedAt: now,
    pipeline: {
      intake: 'PENDING', recon: 'PENDING', architecture: 'PENDING', plan: 'PENDING',
      implementation: 'PENDING', audit: 'PENDING', validation: 'PENDING', pr: 'PENDING'
    }
  };
  await sessionRef(uid, sessionId).set(data, { merge: false });
  return { id: sessionId, ...data };
}

async function getSession({ uid, sessionId }) {
  const snap = await sessionRef(uid, sessionId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function listSessions(uid, limit = 50) {
  const size = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const snap = await db().collection('users').doc(uid).collection('sessions').orderBy('updatedAt', 'desc').limit(size).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function updateSession({ uid, sessionId, patch }) {
  const allowed = ['status', 'currentStage', 'repository', 'branch', 'objective', 'pipeline', 'artifacts', 'audit', 'validation', 'pr', 'lastError'];
  const update = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key)).map(([key, value]) => [key, clean(value)]));
  update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await sessionRef(uid, sessionId).update(update);
  return getSession({ uid, sessionId });
}

async function appendMessage({ uid, sessionId, role, content, stage = null }) {
  if (!['user', 'assistant', 'system'].includes(role)) throw new Error('Invalid message role.');
  if (!content || String(content).length > 50000) throw new Error('Message content is empty or too large.');
  const ref = sessionRef(uid, sessionId);
  const messageRef = ref.collection('messages').doc();
  await messageRef.set({ role, content: String(content), stage, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  await ref.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { id: messageRef.id, role, content: String(content), stage };
}

async function listMessages({ uid, sessionId, limit = 100 }) {
  const size = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const snap = await sessionRef(uid, sessionId).collection('messages').orderBy('createdAt', 'asc').limit(size).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = { createSession, getSession, listSessions, updateSession, appendMessage, listMessages };
