const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { advancePipeline, listStages } = require('./pipeline-orchestrator');

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function send(res, status, body) { cors(res); return res.status(status).json(body); }
async function requireUser(req) {
  const header = req.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Firebase authentication required.'), { status: 401 });
  return admin.auth().verifyIdToken(header.slice(7));
}

exports.pipelineStages = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return send(res, 405, { error: 'GET required.' });
  try { await requireUser(req); return send(res, 200, { stages: listStages() }); }
  catch (error) { return send(res, error.status || 500, { error: error.message }); }
});

exports.advancePipeline = onRequest({ region: 'europe-west2' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required.' });
  try {
    const user = await requireUser(req);
    const { sessionId, stage, status, artifact } = req.body || {};
    if (!sessionId || !stage) return send(res, 400, { error: 'sessionId and stage are required.' });
    const session = await advancePipeline({ uid: user.uid, sessionId, stage, status, artifact });
    return send(res, 200, session);
  } catch (error) { console.error('advancePipeline', error); return send(res, error.status || 400, { error: error.message }); }
});
