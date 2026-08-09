const sessions = [
  { title: 'New engineering session', time: 'Just now' },
  { title: 'Repository architecture', time: 'Earlier today' },
  { title: 'PR audit', time: 'Yesterday' }
];

const steps = ['Inspect repository','Understand architecture','Plan implementation','Write production code','Run tests','Audit diff','Fix findings','Validate','Prepare PR'];
let progressIndex = 0;

const landing = document.getElementById('landing');
const workspace = document.getElementById('workspace');
const launchButton = document.getElementById('launchButton');
const sessionsEl = document.getElementById('sessions');
const sessionCount = document.getElementById('sessionCount');
const newSessionButton = document.getElementById('newSessionButton');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');
const progressSteps = document.getElementById('progressSteps');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.querySelector('.progress-percent');

function renderSessions(){
  sessionCount.textContent = sessions.length;
  sessionsEl.innerHTML = sessions.map((s,i)=>`<div class="session ${i===0?'active':''}" data-session="${i}"><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.time)}</small></div>`).join('');
}

function renderProgress(){
  progressSteps.innerHTML = steps.map((step,i)=>{
    const state = i < progressIndex ? 'done' : i === progressIndex ? 'current' : '';
    return `<div class="step ${state}"><span class="step-icon">${i < progressIndex ? '✓' : i+1}</span><span>${step}</span></div>`;
  }).join('');
  const percent = progressIndex === 0 ? 0 : Math.round((progressIndex/(steps.length-1))*100);
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
}

function escapeHtml(value){
  return value.replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
}

function launch(){
  landing.classList.add('hidden');
  workspace.classList.remove('hidden');
  document.title = 'SADE AI Workspace';
  renderSessions();
  renderProgress();
  messageInput.focus();
}

function addMessage(text,type){
  const el = document.createElement('div');
  el.className = `message ${type}`;
  el.textContent = text;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

launchButton.addEventListener('click', launch);
newSessionButton.addEventListener('click', ()=>{
  sessions.unshift({title:'New engineering session',time:'Just now'});
  renderSessions();
  chatMessages.innerHTML = `<div class="welcome-message"><img src="favi.png" alt=""><div><strong>New session ready.</strong><p>Give me the repository, feature or engineering problem.</p></div></div>`;
  progressIndex = 0;
  renderProgress();
  messageInput.focus();
});

chatForm.addEventListener('submit', event=>{
  event.preventDefault();
  const text = messageInput.value.trim();
  if(!text) return;
  addMessage(text,'user');
  messageInput.value='';
  progressIndex = Math.max(progressIndex,1);
  renderProgress();
  setTimeout(()=>{
    addMessage('Understood. I will inspect the repository and existing architecture before making changes. This workspace is the frontend shell; connect the engineering agent backend to execute repository operations and the full PR workflow.', 'sade');
  },350);
});

renderSessions();
renderProgress();