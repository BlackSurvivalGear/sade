(() => {
  const AGENT_ORDER = ['orchestrator','recon','researcher','planner','coder','tester','patcher','browser','auditor','git'];
  const FALLBACK_AGENTS = [
    {id:'orchestrator',name:'SADE Orchestrator',role:'Routes the engineering task and controls workflow state.'},
    {id:'recon',name:'Recon',role:'Inspects repository structure, branches, dependencies and relevant files.'},
    {id:'researcher',name:'Researcher',role:'Gathers technical evidence and authoritative project context.'},
    {id:'planner',name:'Planner',role:'Builds the implementation plan and acceptance criteria.'},
    {id:'coder',name:'Code Engineer',role:'Implements the approved production changes.'},
    {id:'tester',name:'Tester',role:'Runs validation and records evidence.'},
    {id:'patcher',name:'Patcher',role:'Diagnoses failures and applies targeted repairs.'},
    {id:'browser',name:'Browser Verifier',role:'Checks user-facing behaviour when applicable.'},
    {id:'auditor',name:'Diff Auditor',role:'Reviews scope, security, regressions and unintended changes.'},
    {id:'git',name:'Git / PR Engineer',role:'Prepares the reviewable commit and pull request.'}
  ];

  function escape(value){return String(value ?? '').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
  function agentForStage(stage, agents){
    const text=String(stage||'').toLowerCase();
    const match=[
      ['inspect','recon'],['understand','recon'],['research','researcher'],['plan','planner'],
      ['write','coder'],['test','tester'],['audit','auditor'],['fix','patcher'],
      ['validate','browser'],['prepare','git']
    ].find(([needle])=>text.includes(needle));
    return agents.find(agent=>agent.id===(match?.[1]||'orchestrator')) || agents[0];
  }
  function render(container, architecture, steps, currentIndex){
    if(!container)return;
    const agents=(architecture?.agents?.length?architecture.agents:FALLBACK_AGENTS).filter(agent=>AGENT_ORDER.includes(agent.id));
    const active=agentForStage(steps[currentIndex],agents);
    container.classList.add('agent-workflow');
    container.innerHTML=agents.map((agent,index)=>{
      const stageIndex=steps.findIndex(step=>agentForStage(step,agents).id===agent.id);
      const done=stageIndex>=0 && stageIndex<currentIndex;
      const current=agent.id===active.id;
      const waiting=!done&&!current;
      const status=done?'DONE':current?'ACTIVE':'WAITING';
      return `<button class="agent-step ${done?'is-done':''} ${current?'is-active':''} ${waiting?'is-waiting':''}" type="button" data-agent-id="${escape(agent.id)}" title="${escape(agent.role)}"><span class="agent-step-index">${done?'✓':index+1}</span><span class="agent-step-copy"><strong>${escape(agent.name)}</strong><small>${escape(agent.role)}</small></span><span class="agent-step-status">${status}</span></button>`;
    }).join('');

    container.querySelectorAll('.agent-step').forEach(button=>button.addEventListener('click',()=>{
      const agent=agents.find(item=>item.id===button.dataset.agentId);
      if(agent) window.dispatchEvent(new CustomEvent('sade:agent-selected',{detail:agent}));
    }));

    const currentName=document.querySelector('.agent-card strong');
    const currentRole=document.querySelector('.agent-card small');
    if(currentName)currentName.textContent=active.name;
    if(currentRole)currentRole.textContent=active.role;
  }

  window.SADE_AgentWorkflow={render,AGENT_ORDER,FALLBACK_AGENTS};
})();
