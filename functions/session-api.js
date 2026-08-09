const { onRequest } = require('firebase-functions/v2/https');
const { createSession, getSession, listSessions, updateSession, appendMessage, listMessages } = require('./firestore');

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
}
function send(res, status, body) { cors(res); res.status(status).json(body); }
async function requireUser(req) {
  const header = req.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Firebase authentication required.'), { status: 401 });
  return require('firebase-admin').auth().verifyIdToken(header.slice(7));
}

exports.createSession = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try {
    const user = await requireUser(req);
    const { sessionId, repository, branch, objective } = req.body || {};
    if (!sessionId || !repository || !branch || !objective) return send(res, 400, { error: 'sessionId, repository, branch and objective are required.' });
    return send(res, 201, await createSession({ uid: user.uid, sessionId, repository, branch, objective }));
  } catch (error) { console.error('createSession', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.getSession = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try {
    const user = await requireUser(req);
    const { sessionId } = req.body || {};
    const session = await getSession({ uid: user.uid, sessionId });
    if (!session) return send(res, 404, { error: 'Session not found.' });
    return send(res, 200, session);
  } catch (error) { console.error('getSession', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.listSessions = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try {
    const user = await requireUser(req);
    return send(res, 200, { sessions: await listSessions(user.uid, req.body?.limit) });
  } catch (error) { console.error('listSessions', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.updateSession = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'PATCH' && req.method !== 'POST') return send(res, 405, { error: 'POST or PATCH required.' });
  try {
    const user = await requireUser(req);
    const { sessionId, patch } = req.body || {};
    if (!sessionId || !patch) return send(res, 400, { error: 'sessionId and patch are required.' });
    return send(res, 200, await updateSession({ uid: user.uid, sessionId, patch }));
  } catch (error) { console.error('updateSession', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.addSessionMessage = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try {
    const user = await requireUser(req);
    const { sessionId, role, content, stage } = req.body || {};
    if (!sessionId || !role || !content) return send(res, 400, { error: 'sessionId, role and content are required.' });
    return send(res, 201, await appendMessage({ uid: user.uid, sessionId, role, content, stage }));
  } catch (error) { console.error('addSessionMessage', error); return send(res, error.status || 500, { error: error.message }); }
});

exports.listSessionMessages = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try {
    const user = await requireUser(req);
    const { sessionId, limit } = req.body || {};
    return send(res, 200, { messages: await listMessages({ uid: user.uid, sessionId, limit }) });
  } catch (error) { console.error('listSessionMessages', error); return send(res, error.status || 500, { error: error.message }); }
});
