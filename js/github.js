const GITHUB_API='https://api.github.com';
const GITHUB_OAUTH='https://github.com';
const API_VERSION='2022-11-28';
const TOKEN_KEY='sade.github.auth.v1';
const CLIENT_KEY='sade.github.client-id';

function configuredClientId(){const configured=window.SADE_GITHUB_APP?.clientId;if(configured&&!configured.startsWith('REPLACE_'))return configured;return localStorage.getItem(CLIENT_KEY)||'';}
function saveClientId(clientId){localStorage.setItem(CLIENT_KEY,clientId.trim());}
function readAuth(){try{return JSON.parse(sessionStorage.getItem(TOKEN_KEY)||'null');}catch{return null;}}
function writeAuth(auth){sessionStorage.setItem(TOKEN_KEY,JSON.stringify(auth));}
function clearAuth(){sessionStorage.removeItem(TOKEN_KEY);}

async function parseOAuthResponse(response){
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=data.error_description||data.message||`GitHub authentication request failed (${response.status}).`;
    throw new Error(message);
  }
  if(data.error){
    if(data.error==='authorization_pending'||data.error==='slow_down')return data;
    const messages={
      device_flow_disabled:'GitHub Device Flow is disabled for the SADE GitHub App. Enable Device Flow in the GitHub App settings and try again.',
      incorrect_client_credentials:'The configured GitHub App Client ID is invalid. Verify the Client ID in the SADE GitHub App settings.',
      bad_verification_code:'The GitHub verification code is invalid or expired. Start the connection again.',
      access_denied:'GitHub authorisation was cancelled.',
      expired_token:'The GitHub verification code expired. Start again.'
    };
    throw new Error(messages[data.error]||data.error_description||data.error);
  }
  return data;
}

async function oauthJson(path,params){
  const targetUrl=`${GITHUB_OAUTH}${path}`;
  const request={method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams(params)};
  let directError=null;

  // Prefer GitHub directly. This avoids routing authentication codes/tokens through
  // third-party CORS proxies. GitHub App device flow must be enabled in the App settings.
  try{
    const response=await fetch(targetUrl,request);
    return await parseOAuthResponse(response);
  }catch(error){
    directError=error;
    console.warn('Direct GitHub authentication request failed; trying compatibility fallback.',error);
  }

  // Compatibility fallback for hosts whose browser security policy blocks the direct
  // GitHub OAuth endpoint. These proxies are only a transport fallback; never log or
  // persist OAuth response bodies or device codes.
  const proxies=[
    url=>`https://corsproxy.io/?${encodeURIComponent(url)}`,
    url=>`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];
  for(const getProxiedUrl of proxies){
    try{
      const response=await fetch(getProxiedUrl(targetUrl),request);
      return await parseOAuthResponse(response);
    }catch(error){
      console.warn('GitHub OAuth compatibility proxy failed.',error);
    }
  }

  throw new Error(`GitHub authentication could not reach GitHub from this browser. ${directError?.message||'Check browser/network access to github.com.'}`);
}

async function requestDeviceCode(clientId){return oauthJson('/login/device/code',{client_id:clientId});}
async function pollDeviceToken(clientId,deviceCode,interval,onPending){
  let delay=Math.max(Number(interval)||5,5)*1000;
  const deadline=Date.now()+15*60*1000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,delay));
    const data=await oauthJson('/login/oauth/access_token',{client_id:clientId,device_code:deviceCode,grant_type:'urn:ietf:params:oauth:grant-type:device_code'});
    if(data.access_token)return data;
    if(data.error==='authorization_pending'){onPending?.('Waiting for GitHub authorisation…');continue;}
    if(data.error==='slow_down'){delay+=5000;onPending?.('GitHub asked SADE to slow down. Still waiting…');continue;}
    throw new Error(data.error_description||data.error||'GitHub authorisation failed.');
  }
  throw new Error('The GitHub authorisation window expired. Start again.');
}
function normaliseToken(token){return{accessToken:token.access_token,refreshToken:token.refresh_token||null,expiresAt:token.expires_in?Date.now()+Number(token.expires_in)*1000:null,refreshExpiresAt:token.refresh_token_expires_in?Date.now()+Number(token.refresh_token_expires_in)*1000:null};}
async function connect(onProgress){
  const clientId=configuredClientId();
  if(!clientId)throw new Error('SADE needs the GitHub App Client ID before it can connect.');
  const device=await requestDeviceCode(clientId);
  onProgress?.({type:'device',...device});
  const verification=device.verification_uri_complete||device.verification_uri;
  if(verification)window.open(verification,'_blank','noopener,noreferrer');
  const token=await pollDeviceToken(clientId,device.device_code,device.interval,message=>onProgress?.({type:'pending',message}));
  writeAuth(normaliseToken(token));
  try{return await getCurrentUser();}catch(error){clearAuth();throw new Error(`GitHub authorised the SADE App, but the API session could not be established: ${error.message}`);}
}
async function refreshAccessToken(){
  const auth=readAuth();const clientId=configuredClientId();
  if(!auth?.refreshToken||!clientId)return null;
  const token=await oauthJson('/login/oauth/access_token',{client_id:clientId,refresh_token:auth.refreshToken,grant_type:'refresh_token'}).catch(()=>null);
  if(!token?.access_token)return null;
  const refreshed=normaliseToken(token);writeAuth(refreshed);return refreshed;
}
async function ensureToken(){
  let auth=readAuth();
  if(!auth?.accessToken)throw new Error('GitHub is not connected.');
  if(auth.expiresAt&&Date.now()>auth.expiresAt-60000){auth=await refreshAccessToken();if(!auth){clearAuth();throw new Error('The GitHub session expired. Please reconnect.');}}
  return auth.accessToken;
}
async function api(path,options={}){
  const token=await ensureToken();
  const response=await fetch(`${GITHUB_API}${path}`,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':API_VERSION,...(options.headers||{})}});
  if(response.status===401){clearAuth();throw new Error('GitHub rejected the current session. Please reconnect.');}
  if(!response.ok){let message=`GitHub API error ${response.status}`;try{message=(await response.json()).message||message;}catch{}throw new Error(message);}
  return response.json();
}
async function getCurrentUser(){return api('/user');}
async function listRepositories(){const repositories=[];for(let page=1;page<=20;page+=1){const batch=await api(`/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100&page=${page}`);repositories.push(...batch);if(batch.length<100)break;}return repositories;}
async function listBranches(owner,repo){const branches=[];for(let page=1;page<=10;page+=1){const batch=await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`);branches.push(...batch);if(batch.length<100)break;}return branches;}
async function getRepository(owner,repo){return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);}
async function getTree(owner,repo,branch){return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);}
async function getFile(owner,repo,path,branch){return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);}
function isConnected(){return Boolean(readAuth()?.accessToken);}
function disconnect(){clearAuth();}
window.SADE_GitHub={connect,configuredClientId,saveClientId,getCurrentUser,listRepositories,listBranches,getRepository,getTree,getFile,isConnected,disconnect};
