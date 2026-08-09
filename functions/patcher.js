function extractJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }
  throw new Error('Patcher returned invalid structured output.');
}

async function generatePatches({ objective, context, apiKey, model = 'gpt-5.4' }) {
  const evidence = context.files.map(file => `\n===== ${file.path} =====\n${file.error ? `[UNAVAILABLE: ${file.error}]` : file.content}`).join('\n');
  const instructions = `You are SADE's Patcher Agent. Generate repository-specific code changes from REAL repository evidence. Follow the SADE Software Engineering Constitution. Never invent a file that is not justified by the evidence or objective. Never claim a change has been applied. Do not commit, push or merge anything. Prefer minimal, production-ready changes. Every modified file must include a complete unified diff patch or, for a new file, the complete file content. Return ONLY valid JSON matching this schema: {"summary":"string","files":[{"path":"string","action":"modify|create|delete","reason":"string","patch":"string"}],"tests":["string"],"risks":["string"],"auditNotes":["string"]}. For modifications, patch must be a unified diff. For create, patch must be the complete new file content. Delete actions must use an empty patch.`;
  const input = `ENGINEERING OBJECTIVE:\n${objective}\n\nREPOSITORY: ${context.repository.fullName}\nBRANCH: ${context.branch}\nDEFAULT BRANCH: ${context.repository.defaultBranch}\n\nACTUAL REPOSITORY EVIDENCE:\n${evidence}`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, instructions, input })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI request failed (${response.status}).`), { status: response.status });
  const text = data.output_text || (data.output || []).flatMap(item => item.content || []).map(item => item.text || '').join('\n').trim();
  const result = extractJson(text);
  if (!Array.isArray(result.files)) throw new Error('Patcher output contains no files array.');
  return result;
}

module.exports = { generatePatches };
