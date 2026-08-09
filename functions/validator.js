function extractJson(text) {
  const cleaned = String(text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
  }
  throw new Error('Validator returned invalid structured output.');
}

async function validatePatches({ objective, context, patches, audit, apiKey, model = 'gpt-5.4' }) {
  const instructions = `You are SADE's Validator Agent. Validate whether a proposed repository patch is sufficiently grounded and ready for a future controlled write/PR step. You must treat the repository evidence and Auditor result as authoritative inputs. Check objective coverage, file/action consistency, patch completeness, test adequacy, audit disposition, and whether the proposal makes unsupported claims. This phase does not execute code and must not claim tests actually ran. Return ONLY valid JSON: {"verdict":"READY|READY_WITH_WARNINGS|BLOCKED","summary":"string","checks":[{"name":"objective_coverage|file_integrity|patch_completeness|audit_disposition|test_plan|safety_boundary","status":"PASS|WARN|FAIL","details":"string"}],"requiredActions":["string"],"testPlan":["string"],"writeAllowed":false}. writeAllowed MUST remain false in this phase.`;
  const input = `OBJECTIVE:\n${objective}\n\nREPOSITORY: ${context.repository.fullName}\nBRANCH: ${context.branch}\n\nPATCHER OUTPUT:\n${JSON.stringify(patches, null, 2)}\n\nAUDITOR OUTPUT:\n${JSON.stringify(audit, null, 2)}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, instructions, input }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI request failed (${response.status}).`), { status: response.status });
  const result = extractJson(data.output_text || (data.output || []).flatMap(item => item.content || []).map(item => item.text || '').join('\n').trim());
  result.writeAllowed = false;
  return result;
}

module.exports = { validatePatches };
