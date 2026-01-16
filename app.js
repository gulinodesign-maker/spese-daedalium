/* dDAE client (template minimo)
 * - Login (username/password)
 * - Token stateless (ritornato dal backend)
 * - Wrapper fetch con apiKey + token
 */

const LS_TOKEN = "ddae_token";
const LS_USER = "ddae_user";

function $(sel){ return document.querySelector(sel); }

function setStatus(msg){
  const el = $('#status');
  if (el) el.textContent = msg || '';
}

function setBuild(){
  const el = document.querySelector('[data-build]');
  if (el) el.textContent = BUILD_VERSION;
}

function getToken(){ return localStorage.getItem(LS_TOKEN) || ''; }
function setToken(t){ localStorage.setItem(LS_TOKEN, t || ''); }
function clearToken(){ localStorage.removeItem(LS_TOKEN); }

function setUser(u){ localStorage.setItem(LS_USER, JSON.stringify(u||null)); }
function getUser(){
  try { return JSON.parse(localStorage.getItem(LS_USER) || 'null'); }
  catch(e){ return null; }
}

async function apiCall(action, method='GET', body=null, params={}){
  if (!API_URL) throw new Error('Config mancante: API_URL');
  const url = new URL(API_URL);
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('action', action);

  // method override via _method (compatibile con backend)
  if (method !== 'GET' && method !== 'POST') {
    url.searchParams.set('_method', method);
    method = 'POST';
  }

  const token = getToken();
  if (token) url.searchParams.set('token', token);

  Object.entries(params||{}).forEach(([k,v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const opt = { method };
  if (method === 'POST') {
    opt.headers = { 'Content-Type': 'application/json' };
    opt.body = JSON.stringify(body || {});
  }

  const res = await fetch(url.toString(), opt);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Errore');
  return data.data;
}

async function login(username, password){
  const data = await apiCall('auth_login', 'POST', { username, password });
  setToken(data.token);
  setUser(data.user);
  return data;
}

function showLoggedIn(){
  const u = getUser();
  $('#loginBox').classList.add('hidden');
  $('#appBox').classList.remove('hidden');
  $('#whoami').textContent = u ? `${u.nome || u.username} (${u.ruolo || ''})` : '';
}

function showLoggedOut(){
  $('#loginBox').classList.remove('hidden');
  $('#appBox').classList.add('hidden');
  $('#whoami').textContent = '';
}

async function ping(){
  const data = await apiCall('ping', 'GET');
  return data;
}

async function init(){
  setBuild();

  // SW
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js'); }
    catch(e){ /* ignore */ }
  }

  // UI
  $('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setStatus('Login...');
    try {
      const username = $('#username').value.trim();
      const password = $('#password').value;
      const out = await login(username, password);
      setStatus(`OK (anno attivo: ${out.anno_attivo})`);
      showLoggedIn();
    } catch (e) {
      setStatus(String(e.message || e));
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    clearToken();
    setUser(null);
    showLoggedOut();
  });

  // bootstrap
  if (getToken()) showLoggedIn();
  else showLoggedOut();

  // quick test
  try { await ping(); }
  catch(e){ /* ignore */ }
}

window.addEventListener('DOMContentLoaded', init);
