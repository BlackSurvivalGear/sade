const GITHUB_API='https://api.github.com';
const GITHUB_OAUTH='https://github.com';
const API_VERSION='2022-11-28';
const TOKEN_KEY='sade.github.auth.v1';
const CLIENT_KEY='sade.github.client-id';
const STATE_KEY='sade.github.oauth.state';
const VERIFIER_KEY='sade.github.oauth.verifier';
const CALLBACK_URL='https://blacksurvivalgear.github.io/sade/';

function configuredClientId(){const configured=window.SADE_GITHUB_APP?.clientId;if(configured&&!configured.startsWith('REPLACE_'))return configured;return localStorage.getItem(CLIENT_KEY)||'';}
function saveClientId(clientId){localStorage.setItem(CLIENT_KEY,clientId.trim());}
function readAuth(){try{return JSON.parse(sessionStorage.getItem(TOKEN_KEY)||'null');}catch{return null;}}
function writeAuth(auth){sessionStorage.setItem(TOKEN_KEY,JSON.stringify(auth));}
function clearAuth(){sessionStorage.removeItem(TOKEN_KEY);}

async function ensureFirebaseConfig(){if(window.SADE_FIREBASE_CONFIG?.projectId&&!String(window.SADE_FIREBASE_CONFIG.projectId).startsWith('YOUR_'))return window.SADE_FIREBASE_CONFIG;const existing=document.querySelector('script[data-sade-firebase-config]');if(existing){await new Promise(resolve=>existing.addEventListener('load',resolve,{once:true}));}else{await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='config/firebase-config.js';script.dataset.sadeFirebaseConfig='true';script.onload=resolve;script.onerror=()=>reject(new Error('SADE Firebase configuration could not be loaded.'));document.head.appendChild(script);});}const config=window.SADE_FIREBASE_CONFIG;if(!config?.projectId||String(config.projectId).startsWith('YOUR_'))throw new Error('SADE Firebase is not configured. Add the real Firebase project configuration before connecting GitHub.');return config;}
function randomString(length=64){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return Array.from(bytes,b=>('0'+(b%36).toString(36)).slice(-1)).join('');}
function base64Url(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function sha256(value){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));}
async function beginWebAuth(clientId){const verifier=randomString(96);const state=randomString(48);const challenge=base64Url(await sha256(verifier));sessionStorage.setItem(STATE_KEY,state);sessionStorage.setItem(VERIFIER_KEY,verifier);const params=new URLSearchParams({client_id:clientId,state,code_challenge:challenge,code_challenge_method:'S256'});window.location.assign(`${GITHUB_OAUTH}/login/oauth/authorize?${params.toString()}`);}
async function exchangeCode(code,verifier){const config=await ensureFirebaseConfig();const endpoint=`https://europe-west2-${config.projectId}.cloudfunctions.net/githubOAuthExchange`;const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({code,codeVerifier:verifier,redirectUri:CALLBACK_URL})});const data=await response.json().catch(()=>({}));if(!response.ok||data.error||!data.access_token)throw new Error(data.error||`GitHub OAuth exchange failed (${response.status}).`);return data;}
async function completeWebAuth(){const query=new URLSearchParams(window.location.search);const code=query.get('code');const returnedState=query.get('state');const oauthError=query.get('error');if(!code&&!oauthError)return;if(oauthError)throw new Error(query.get('error_description')||`GitHub authorization failed: ${oauthError}`);const expectedState=sessionStorage.getItem(STATE_KEY);const verifier=sessionStorage.getItem(VERIFIER_KEY);if(!expectedState||returnedState!==expectedState)throw new Error('GitHub authentication state validation failed. Please reconnect.');if(!verifier)throw new Error('GitHub PKCE verifier is missing. Please reconnect.');const token=await exchangeCode(code,verifier);writeAuth({accessToken:token.access_token,refreshToken:token.refresh_token||null,expiresAt:token.expires_in?Date.now()+Number(token.expires_in)*1000:null,refreshExpiresAt:token.refresh_token_expires_in?Date.now()+Number(token.refresh_token_expires_in)*1000:null});sessionStorage.removeItem(STATE_KEY);sessionStorage.removeItem(VERIFIER_KEY);history.replaceState({},document.title,CALLBACK_URL);window.location.reload();}
const callbackPromise=completeWebAuth().catch(error=>{sessionStorage.removeItem(STATE_KEY);sessionStorage.removeItem(VERIFIER_KEY);console.error('SADE GitHub OAuth callback',error);window.SADE_GITHUB_OAUTH_ERROR=error.message;});

async function connect(onProgress){await callbackPromise;const clientId=configuredClientId();if(!clientId)throw new Error('SADE needs the GitHub App Client ID before it can connect.');await ensureFirebaseConfig();onProgress?.({type:'redirect'});await beginWebAuth(clientId);return null;}
async function refreshAccessToken(){return null;}
async function ensureToken(){const auth=readAuth();if(!auth?.accessToken)throw new Error('GitHub is not connected.');if(auth.expiresAt&&Date.now()>auth.expiresAt-60000){clearAuth();throw new Error('The GitHub session expired. Please reconnect.');}return auth.accessToken;}
async function api(path,options={}){const token=await ensureToken();const response=await fetch(`${GITHUB_API}${path}`,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':API_VERSION,...(options.headers||{})}});if(response.status===401){clearAuth();throw new Error('GitHub rejected the current session. Please reconnect.');}if(!response.ok){let message=`GitHub API error ${response.status}`;try{message=(await response.json()).message||message;}catch{}throw new Error(message);}return response.json();}
async function getCurrentUser(){return api('/user');}
async function listRepositories(){const repositories=[];for(let page=1;page<=20;page+=1){const batch=await api(`/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=100&page=${page}`);repositories.push(...batch);if(batch.length<100)break;}return repositories;}
async function listBranches(owner,repo){const branches=[];for(let page=1;page<=10;page+=1){const batch=await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`);branches.push(...batch);if(batch.length<100)break;}return branches;}
async function getRepository(owner,repo){return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);}
async function getTree(owner,repo,branch){return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);}
async function getFile(owner,repo,path,branch){return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`);}
function isConnected(){return Boolean(readAuth()?.accessToken);}
function disconnect(){clearAuth();}
window.SADE_GitHub={connect,configuredClientId,saveClientId,getCurrentUser,listRepositories,listBranches,getRepository,getTree,getFile,isConnected,disconnect,completeWebAuth,callbackPromise};
