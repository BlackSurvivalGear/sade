const SADE_AI = (() => {
  const KEY = 'sade.openai.api-key';
  const MODEL_KEY = 'sade.openai.model';
  const DEFAULT_MODEL = 'gpt-5.4';
  const constitutionPath = 'docs/SADE-SOFTWARE-ENGINEERING-CONSTITUTION.md';
  const pipelinePath = 'config/sade-prompt-pipeline.json';
  const legacyPromptPaths = [
    'prompts/core/system.md',
    'prompts/workflow/01-inspect-repository.md',
    'prompts/workflow/02-understand-architecture.md',
    'prompts/workflow/03-plan-implementation.md',
    'prompts/workflow/04-write-production-code.md',
    'prompts/workflow/05-run-tests.md',
    'prompts/workflow/06-audit-diff.md',
    'prompts/workflow/07-fix-findings.md',
    'prompts/workflow/08-validate.md',
    'prompts/workflow/09-prepare-pr.md'
  ];

  const state = { constitution: '', pipeline: null, legacyPrompts: [] };

  async function loadText(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.text();
  }

  async function initialise() {
    state.constitution = await loadText(constitutionPath);
    state.pipeline = await fetch(pipelinePath, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('Could not load SADE pipeline configuration.');
      return r.json();
    });
    state.legacyPrompts = (await Promise.allSettled(legacyPromptPaths.map(loadText)))
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    return state;
  }

  function getApiKey() { return sessionStorage.getItem(KEY) || ''; }
  function setApiKey(value) { value ? sessionStorage.setItem(KEY, value.trim()) : sessionStorage.removeItem(KEY); }
  function getModel() { return sessionStorage.getItem(MODEL_KEY) || DEFAULT_MODEL; }
  function setModel(value) { sessionStorage.setItem(MODEL_KEY, value.trim() || DEFAULT_MODEL); }

  function buildInstructions() {
    const stages = state.pipeline.stages.map((stage, index) => `${index + 1}. ${stage.name} [${stage.role}] — ${stage.prompt}`).join('\n');
    const legacy = state.legacyPrompts.length
      ? `\n\nEXISTING SADE PROMPT GUIDANCE:\n${state.legacyPrompts.join('\n\n--- NEXT PROMPT ---\n\n')}`
      : '';
    return `${state.constitution}\n\nPROMPT PIPELINE:\n${stages}${legacy}\n\nYou are the reasoning engine inside SADE. Process every user request through the pipeline. Do not skip stages merely because the request looks simple. You may combine internal reasoning stages, but the visible result must show the pipeline status. Return concise, concrete engineering information. Never invent repository state.`;
  }

  function extractText(data) {
    if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
    const chunks = [];
    for (const item of (data.output || [])) {
      for (const content of (item.content || [])) {
        if (typeof content.text === 'string') chunks.push(content.text);
      }
    }
    return chunks.join('\n').trim() || 'The model returned no text.';
  }

  async function run(userPrompt) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Add your OpenAI API key first. The key is kept only in this browser session.');
    if (!state.pipeline || !state.constitution) await initialise();

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: getModel(),
        instructions: buildInstructions(),
        input: `ENGINEERING OBJECTIVE FROM USER:\n${userPrompt}\n\nProcess this objective through the SADE pipeline and return:\n1. Objective\n2. Assumptions / missing evidence\n3. Pipeline assessment by stage\n4. Implementation plan\n5. Proposed code/component changes\n6. Audit findings\n7. Validation plan\n8. PR proposal\n9. Blockers`
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status}).`);
    return { text: extractText(data), model: getModel() };
  }

  return { state, initialise, getApiKey, setApiKey, getModel, setModel, run };
})();
