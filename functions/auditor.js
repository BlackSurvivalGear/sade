function extractJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }
  throw new Error('Auditor returned invalid structured output.');
}

async function auditPatches({ objective, context, patches, apiKey, model = 'gpt-5.4' }) {
  const evidence = context.files.map(file => `\n===== ${file.path} =====\n${file.error ? `[UNAVAILABLE: ${file.error}]` : file.content}`).join('\n');
  const proposed = JSON.stringify(patches, null, 2);
  const instructions = `You are SADE's Auditor Agent. Audit a proposed repository patch against REAL repository evidence and the SADE Software Engineering Constitution. Do not assume the patch is correct. Look for functional regressions, security weaknesses, broken interfaces, missing dependencies, incorrect file paths, incomplete implementation, destructive changes, test gaps and contradictions with existing code. Return ONLY valid JSON: {"verdict":"PASS|PASS_WITH_WARNINGS|FAIL","summary":"string","findings":[{"severity":"critical|high|medium|low","category":"correctness|security|architecture|compatibility|testing|maintainability","file":"string","finding":"string","recommendation":"string"}],"requiredChanges":["string"],"testsRequired":["string"]}. PASS means no material issue was found. PASS_WITH_WARNINGS means safe to continue only with the listed warnings understood. FAIL means the patch must not proceed to write/PR stage.`;
  const input = `OBJECTIVE:\n${objective}\n\nREPOSITORY: ${context.repository.fullName}\nBRANCH: ${context.branch}\n\nACTUAL SOURCE EVIDENCE:\n${evidence}\n\nPROPOSED PATCHER OUTPUT:\n${proposed}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, instructions, input }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI request failed (${response.status}).`), { status: response.status });
  return extractJson(data.output_text || (data.output || []).flatMap(item => item.content || []).map(item => item.text || '').join('\n').trim());
}

module.exports = { auditPatches };
