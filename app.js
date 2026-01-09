/* global API_BASE_URL, API_KEY */

/**
 * Build: incrementa questa stringa alla prossima modifica (es. 1.001)
 */
const BUILD_VERSION = "1.116";


// ===== Stato UI: evita "torna in HOME" quando iOS aggiorna il Service Worker =====
const __RESTORE_KEY = "__ddae_restore_state";

function __readRestoreState(){
  try {
    const raw = sessionStorage.getItem(__RESTORE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(__RESTORE_KEY);
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function __writeRestoreState(obj){
  try { sessionStorage.setItem(__RESTORE_KEY, JSON.stringify(obj || {})); } catch (_) {}
}

function __captureFormValue(id){
  try {
    const el = document.getElementById(id);
    if (!el) return null;
    return (el.type === "checkbox") ? !!el.checked : (el.value ?? "");
  } catch (_) { return null; }
}

function __applyFormValue(id, v){
  try {
    const el = document.getElementById(id);
    if (!el || v == null) return;
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = String(v);
  } catch (_) {}
}

function __captureUiState(){
  const out = {
    page: state.page || "home",
    period: state.period || { from:"", to:"" },
    preset: state.periodPreset || "this_month",
    guest: {
      mode: state.guestMode || "create",
      editId: state.guestEditId || null,
      depositType: state.guestDepositType || "contante",
      saldoType: state.guestSaldoType || "contante",
      depositReceipt: !!state.guestDepositReceipt,
      saldoReceipt: !!state.guestSaldoReceipt,
      marriage: !!state.guestMarriage,
      rooms: Array.from(state.guestRooms || []),
      lettiPerStanza: state.lettiPerStanza || {},
      form: {
        guestName: __captureFormValue("guestName"),
        guestAdults: __captureFormValue("guestAdults"),
        guestKidsU10: __captureFormValue("guestKidsU10"),
        guestCheckIn: __captureFormValue("guestCheckIn"),
        guestCheckOut: __captureFormValue("guestCheckOut"),
        guestTotal: __captureFormValue("guestTotal"),
        guestBooking: __captureFormValue("guestBooking"),
        guestDeposit: __captureFormValue("guestDeposit"),
        guestSaldo: __captureFormValue("guestSaldo"),
      }
    },
    calendar: {
      anchor: (state.calendar && state.calendar.anchor) ? toISO(state.calendar.anchor) : ""
    }
  };
  return out;
}

function __applyUiState(restore){
  if (!restore || typeof restore !== "object") return;

  try {
    // periodo
    const p = restore.period || null;
    if (p && p.from && p.to) {
      setPeriod(p.from, p.to);
    }

    if (restore.preset) setPresetValue(restore.preset);

    // calendario
    if (restore.calendar?.anchor) {
      if (!state.calendar) state.calendar = { anchor: new Date(), ready:false, guests:[], rangeKey:"" };
      state.calendar.anchor = new Date(restore.calendar.anchor + "T00:00:00");
      state.calendar.ready = false;
    }

    // ospite (solo se eri in quella sezione)
    if (restore.guest) {
      state.guestMode = restore.guest.mode || state.guestMode;
      state.guestEditId = restore.guest.editId || state.guestEditId;
      state.guestDepositType = restore.guest.depositType || state.guestDepositType;
      state.guestSaldoType = restore.guest.saldoType || state.guestSaldoType;
      state.guestDepositReceipt = !!restore.guest.depositReceipt;
      state.guestSaldoReceipt = !!restore.guest.saldoReceipt;
      state.guestMarriage = !!restore.guest.marriage;

      // stanze selezionate
      try {
        state.guestRooms = new Set((restore.guest.rooms || []).map(n=>parseInt(n,10)).filter(n=>isFinite(n)));
        state.lettiPerStanza = restore.guest.lettiPerStanza || {};
      } catch (_) {}

      // campi form
      const f = restore.guest.form || {};
      __applyFormValue("guestName", f.guestName);
      __applyFormValue("guestAdults", f.guestAdults);
      __applyFormValue("guestKidsU10", f.guestKidsU10);
      __applyFormValue("guestCheckIn", f.guestCheckIn);
      __applyFormValue("guestCheckOut", f.guestCheckOut);
      __applyFormValue("guestTotal", f.guestTotal);
      __applyFormValue("guestBooking", f.guestBooking);
      __applyFormValue("guestDeposit", f.guestDeposit);
      __applyFormValue("guestSaldo", f.guestSaldo);
      try { updateGuestRemaining(); } catch (_) {}

      // UI rooms + pills
      try {
        document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
          const n = parseInt(btn.getAttribute("data-room"), 10);
          const on = state.guestRooms.has(n);
          btn.classList.toggle("selected", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        });
      } catch (_) {}
      try { setPayType("depositType", state.guestDepositType); } catch (_) {}
      try { setPayType("saldoType", state.guestSaldoType); } catch (_) {}
      try { setPayReceipt("depositType", state.guestDepositReceipt); } catch (_) {}
      try { setPayReceipt("saldoType", state.guestSaldoReceipt); } catch (_) {}
      try { setMarriage(state.guestMarriage); } catch (_) {}
    }

  } catch (_) {}
}


function genId(prefix){
  return `${prefix}_${Date.now()}_${Math.floor(Math.random()*1000000)}`;
}

const $ = (sel) => document.querySelector(sel);

function setMarriage(on){
  state.guestMarriage = !!on;
  const btn = document.getElementById("roomMarriage");
  if (!btn) return;
  btn.classList.toggle("selected", state.guestMarriage);
  btn.setAttribute("aria-pressed", state.guestMarriage ? "true" : "false");
}


function setPayType(containerId, type){
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const t = (type || "contante").toString().toLowerCase();
  wrap.querySelectorAll(".pay-dot[data-type]").forEach(b => {
    const v = (b.getAttribute("data-type") || "").toLowerCase();
    const on = v === t;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}


function setPayReceipt(containerId, on){
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const btn = wrap.querySelector('.pay-dot[data-receipt]');
  if (!btn) return;
  const active = !!on;
  btn.classList.toggle("selected", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}



function setRegFlag(containerId, flag, on){
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const btn = wrap.querySelector(`.pay-dot[data-flag="${flag}"]`);
  if (!btn) return;
  const active = !!on;
  btn.classList.toggle("selected", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}

function setRegFlags(containerId, psOn, istatOn){
  setRegFlag(containerId, "ps", psOn);
  setRegFlag(containerId, "istat", istatOn);
}

function truthy(v){
  if (v === true) return true;
  if (v === false || v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return (s === "1" || s === "true" || s === "yes" || s === "si" || s === "on");
}

// dDAE_1.086 — error overlay: evita blocchi silenziosi su iPhone PWA
window.addEventListener("error", (e) => {
  try {
    const msg = (e?.message || "Errore JS") + (e?.filename ? ` @ ${e.filename.split("/").pop()}:${e.lineno||0}` : "");
    console.error("JS error", e?.error || e);
    toast(msg);
  } catch (_) {}
});
window.addEventListener("unhandledrejection", (e) => {
  try {
    console.error("Unhandled promise rejection", e?.reason || e);
    const msg = (e?.reason?.message || e?.reason || "Promise rejection").toString();
    toast("Errore: " + msg);
  } catch (_) {}
});

const state = {
  motivazioni: [],
  spese: [],
  report: null,
  _dataKey: "",
  period: { from: "", to: "" },
  periodPreset: "this_month",
  page: "home",
  speseView: "list",
  guests: [],
  stanzeRows: [],
  stanzeByKey: {},
  guestRooms: new Set(),
  guestDepositType: "contante",
  guestEditId: null,
  guestMode: "create",
  lettiPerStanza: {},
  guestMarriage: false,
  guestSaldoType: "contante",
  guestPSRegistered: false,
  guestISTATRegistered: false,
  // Scheda ospite (sola lettura): ultimo ospite aperto
  guestViewItem: null,
};

const COLORS = {
  CONTANTI: "#2b7cb4",          // azzurro
  TASSA_SOGGIORNO: "#d8bd97",   // beige
  IVA_22: "#c9772b",            // arancio
  IVA_10: "#7ac0db",            // azzurro chiaro
  IVA_4: "#1f2937",             // scuro
};


// Loader globale (gestisce richieste parallele + anti-flicker)
const loadingState = {
  requestCount: 0,
  showTimer: null,
  shownAt: 0,
  isVisible: false,
  delayMs: 500,      // opzionale: evita flicker se rapidissimo
  minVisibleMs: 300, // opzionale: se compare non sparisce subito
};

function showLoading(){
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.hidden = false;
  loadingState.isVisible = true;
  loadingState.shownAt = performance.now();
}

function hideLoading(){
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  ov.hidden = true;
  loadingState.isVisible = false;
}

function beginRequest(){
  loadingState.requestCount += 1;
  if (loadingState.requestCount !== 1) return;

  // Programma la comparsa dopo delayMs
  if (loadingState.showTimer) clearTimeout(loadingState.showTimer);
  loadingState.showTimer = setTimeout(() => {
    if (loadingState.requestCount > 0 && !loadingState.isVisible) {
      showLoading();
    }
  }, loadingState.delayMs);
}

function endRequest(){
  loadingState.requestCount = Math.max(0, loadingState.requestCount - 1);
  if (loadingState.requestCount !== 0) return;

  if (loadingState.showTimer) {
    clearTimeout(loadingState.showTimer);
    loadingState.showTimer = null;
  }

  // Se non è mai comparso, fine.
  if (!loadingState.isVisible) return;

  const elapsed = performance.now() - (loadingState.shownAt || performance.now());
  const remaining = loadingState.minVisibleMs - elapsed;
  if (remaining > 0) {
    setTimeout(() => {
      // Ricontrollo: potrebbe essere partita un'altra richiesta.
      if (loadingState.requestCount === 0) hideLoading();
    }, remaining);
  } else {
    hideLoading();
  }
}

function euro(n){
  const x = Number(n || 0);
  return x.toLocaleString("it-IT", { style:"currency", currency:"EUR" });
}

function toast(msg){
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1700);
}

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

// --- Guest status LED (scheda ospiti) ---
function _dayNumFromISO(iso){
  if (!iso || typeof iso !== 'string') return null;

  // ISO datetime (es: 2026-01-05T23:00:00.000Z) -> converti in data locale (YYYY-MM-DD)
  if (iso.includes("T")) {
    const dt = new Date(iso);
    if (!isNaN(dt)) {
      return Math.floor(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000);
    }
    iso = iso.split("T")[0];
  }

  // Support both YYYY-MM-DD and DD/MM/YYYY
  if (iso.includes('/')) {
    const parts = iso.split('/').map(n=>parseInt(n,10));
    if (parts.length === 3 && parts.every(n=>isFinite(n))) {
      const [dd,mm,yy] = parts;
      return Math.floor(Date.UTC(yy, mm-1, dd) / 86400000);
    }
  }

  const parts = iso.split('-').map(n=>parseInt(n,10));
  if (parts.length !== 3 || parts.some(n=>!isFinite(n))) return null;
  const [y,m,d] = parts;
  // day number in UTC to avoid DST issues
  return Math.floor(Date.UTC(y, m-1, d) / 86400000);
}

function guestLedStatus(item){
  const ci = item?.check_in || item?.checkIn || "";
  const co = item?.check_out || item?.checkOut || "";

  const t = _dayNumFromISO(todayISO());
  const dIn = _dayNumFromISO(ci);
  const dOut = _dayNumFromISO(co);

  if (t == null) return { cls: "led-gray", label: "Nessuna scadenza" };

  // Priorità: check-out (rosso) > giorno prima check-out (arancione) > dopo check-in (verde) > grigio
  if (dOut != null) {
    if (t === dOut) return { cls: "led-red", label: "Check-out oggi" };
    if (t > dOut) return { cls: "led-red", label: "Check-out passato" };
    if (t === (dOut - 1)) return { cls: "led-orange", label: "Check-out domani" };
  }

  if (dIn != null) {
    if (t === dIn) return { cls: "led-green", label: "Check-in oggi" };
    if (t > dIn) return { cls: "led-green", label: "In soggiorno" };
    return { cls: "led-gray", label: "In arrivo" };
  }

  return { cls: "led-gray", label: "Nessuna data" };
}




function toISO(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatISODateLocal(value){
  if (!value) return "";
  const s = String(value);

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO datetime -> local date
  if (s.includes("T")) {
    const dt = new Date(s);
    if (!isNaN(dt)) return toISO(dt); // toISO usa date locale
    return s.split("T")[0];
  }

  // Fallback: DD/MM/YYYY
  if (s.includes("/")) {
    const parts = s.split("/").map(x=>parseInt(x,10));
    if (parts.length === 3 && parts.every(n=>isFinite(n))) {
      const [dd,mm,yy] = parts;
      const dt = new Date(yy, mm-1, dd);
      return toISO(dt);
    }
  }

  // Last resort: cut
  return s.slice(0,10);
}

// 2026-01-01 -> "1 Gennaio 2026" (mese con iniziale maiuscola)
function formatLongDateIT(value){
  const iso = formatISODateLocal(value);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y,m,d] = iso.split("-").map(n=>parseInt(n,10));
  const dt = new Date(y, (m-1), d);
  if (isNaN(dt)) return "";
  const s = dt.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  // capitalizza il mese (in it-IT normalmente è minuscolo)
  // es: "1 gennaio 2026" -> "1 Gennaio 2026"
  const parts = s.split(" ");
  if (parts.length >= 3) {
    parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    return parts.join(" ");
  }
  return s;
}


function monthRangeISO(date = new Date()){
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m+1, 0);
  return [toISO(start), toISO(end)];
}


// Period preset (scroll picker iOS) — nessuna API extra
let periodSyncLock = 0;
let presetSyncLock = 0;

function addDaysISO(iso, delta){
  const [y,m,d] = iso.split("-").map(n=>parseInt(n,10));
  const dt = new Date(y, (m-1), d);
  dt.setDate(dt.getDate() + delta);
  return toISO(dt);
}

function monthRangeFromYM(ym){
  const [yy,mm] = ym.split("-").map(n=>parseInt(n,10));
  const start = new Date(yy, mm-1, 1);
  const end = new Date(yy, mm, 0);
  return [toISO(start), toISO(end)];
}

function recentMonths(n=8){
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i=0;i<n;i++){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth()-1);
  }
  return out;
}

function buildPeriodPresetOptions(){
  const opts = [
    { value:"this_month", label:"Questo mese" },
    { value:"last_month", label:"Mese scorso" },
    { value:"last_7", label:"Ultimi 7 giorni" },
    { value:"last_30", label:"Ultimi 30 giorni" },
    { value:"ytd", label:"Anno corrente" },
    { value:"all", label:"Tutto" },
  ];
  for (const ym of recentMonths(8)){
    opts.push({ value:`month:${ym}`, label: ym });
  }
  opts.push({ value:"custom", label:"Personalizzato" });
  return opts;
}

function fillPresetSelect(selectEl){
  if (!selectEl) return;
  const opts = buildPeriodPresetOptions();
  selectEl.innerHTML = "";
  for (const o of opts){
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    selectEl.appendChild(opt);
  }
}

function setPresetValue(value){
  state.periodPreset = value;
  presetSyncLock += 1;
  try {
    const sels = ["#periodPreset1","#periodPreset2","#periodPreset3"]
      .map(s => document.querySelector(s))
      .filter(Boolean);
    for (const s of sels) s.value = value;
  } finally {
    presetSyncLock -= 1;
  }
}

function presetToRange(value){
  const today = todayISO();
  if (value === "this_month") return monthRangeISO(new Date());
  if (value === "last_month"){
    const d = new Date();
    d.setMonth(d.getMonth()-1);
    return monthRangeISO(d);
  }
  if (value === "last_7") return [addDaysISO(today, -6), today];
  if (value === "last_30") return [addDaysISO(today, -29), today];
  if (value === "ytd"){
    const y = new Date().getFullYear();
    return [`${y}-01-01`, today];
  }
  if (value === "all") return ["2000-01-01", today];
  if (value && value.startsWith("month:")){
    const ym = value.split(":")[1];
    return monthRangeFromYM(ym);
  }
  return null;
}

function bindPresetSelect(sel){
  const el = document.querySelector(sel);
  if (!el) return;
  fillPresetSelect(el);
  el.value = state.periodPreset || "this_month";

  el.addEventListener("change", async () => {
    if (presetSyncLock > 0) return;
    const v = el.value;
    const range = presetToRange(v);
    setPresetValue(v);
    if (!range) return;
    const [from,to] = range;

    setPeriod(from,to);

    try { await onPeriodChanged({ showLoader:false }); } catch (e) { toast(e.message); }
  });
}

function categoriaLabel(cat){
  return ({
    CONTANTI: "Contanti",
    TASSA_SOGGIORNO: "Tassa soggiorno",
    IVA_22: "IVA 22%",
    IVA_10: "IVA 10%",
    IVA_4: "IVA 4%",
  })[cat] || cat;
}

async function api(action, { method="GET", params={}, body=null, showLoader=true } = {}){
  if (showLoader) beginRequest();
  try {
  if (!API_BASE_URL || API_BASE_URL.includes("INCOLLA_QUI")) {
    throw new Error("Config mancante: imposta API_BASE_URL in config.js");
  }

  const url = new URL(API_BASE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("apiKey", API_KEY);
  // Cache-busting for iOS/Safari aggressive caching
  url.searchParams.set("_ts", String(Date.now()));

  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).length) url.searchParams.set(k, v);
  });

  let realMethod = method;
  if (method === "PUT" || method === "DELETE") {
    url.searchParams.set("_method", method);
    realMethod = "POST";
  }

  // Timeout concreto: evita loader infinito su iOS quando la rete “si pianta”
const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 15000);

const fetchOpts = {
  method: realMethod,
  signal: controller.signal,
  cache: "no-store",
};

// Headers/body solo quando serve (riduce rischi di preflight su Safari iOS)
if (realMethod !== "GET") {
  fetchOpts.headers = { "Content-Type": "text/plain;charset=utf-8" };
  fetchOpts.body = body ? JSON.stringify(body) : "{}";
}

let res;
try {
  try {
  res = await fetch(url.toString(), fetchOpts);
} catch (err) {
  const msg = String(err && err.message || err || "");
  if (msg.toLowerCase().includes("failed to fetch")) {
    throw new Error("Failed to fetch (API). Verifica: 1) Web App Apps Script distribuita come 'Chiunque', 2) URL /exec corretto, 3) rete iPhone ok. Se hai appena aggiornato lo script, ridistribuisci una nuova versione.");
  }
  throw err;
}
} finally {
  clearTimeout(t);
}

let json;
try {
  json = await res.json();
} catch (_) {
  throw new Error("Risposta non valida dal server");
}

if (!json.ok) throw new Error(json.error || "API error");
return json.data;
  } finally { if (showLoader) if (showLoader) endRequest(); }
}



// ===== API Cache (speed + dedupe richieste) =====
const __apiCache = new Map();      // key -> { t:number, data:any }
const __apiInflight = new Map();   // key -> Promise

function __cacheKey(action, params){
  try { return action + "|" + JSON.stringify(params || {}); }
  catch (_) { return action + "|{}"; }
}

function invalidateApiCache(prefix){
  try{
    for (const k of Array.from(__apiCache.keys())){
      if (!prefix || k.startsWith(prefix)) __apiCache.delete(k);
    }
  } catch (_) {}
}

// GET con cache in-memory (non tocca SW): evita chiamate duplicate e loader continui
async function cachedGet(action, params = {}, { ttlMs = 30000, showLoader = true, force = false } = {}){
  const key = __cacheKey(action, params);

  if (!force) {
    const hit = __apiCache.get(key);
    if (hit && (Date.now() - hit.t) < ttlMs) return hit.data;
  }

  if (__apiInflight.has(key)) return __apiInflight.get(key);

  const p = (async () => {
    const data = await api(action, { params, showLoader });
    __apiCache.set(key, { t: Date.now(), data });
    return data;
  })();

  __apiInflight.set(key, p);

  try {
    return await p;
  } finally {
    __apiInflight.delete(key);
  }
}

/* Launcher modal (popup) */



// iOS/PWA: elimina i “tap” persi (click non sempre affidabile su Safari PWA)
function bindFastTap(el, fn){
  if (!el) return;
  let last = 0;
  const handler = (e)=>{
    const now = Date.now();
    if (now - last < 450) return;
    last = now;
    try{ e.preventDefault(); }catch(_){ }
    try{ e.stopPropagation(); }catch(_){ }
    fn();
  };
  ["click","touchstart","touchend","pointerdown","pointerup"].forEach(evt=>{
    try{ el.addEventListener(evt, handler, { passive:false }); }
    catch(_){ el.addEventListener(evt, handler); }
  });
}

let launcherDelegationBound = false;
let homeDelegationBound = false;
function bindHomeDelegation(){
  if (homeDelegationBound) return;
  homeDelegationBound = true;
  document.addEventListener("click", (e)=>{
    const o = e.target.closest && e.target.closest("#goOspite");
    if (o){ hideLauncher(); showPage("ospiti"); return; }
    const cal = e.target.closest && e.target.closest("#goCalendario");
    if (cal){ hideLauncher(); showPage("calendario"); return; }
    const tassa = e.target.closest && e.target.closest("#goTassaSoggiorno");
    if (tassa){ hideLauncher(); toast("Tassa soggiorno: in arrivo"); return; }
    const pul = e.target.closest && e.target.closest("#goPulizie");
    if (pul){ hideLauncher(); toast("Pulizie: in arrivo"); return; }
    const g = e.target.closest && e.target.closest("#goGuadagni");
    if (g){ hideLauncher(); toast("Guadagni: in arrivo"); return; }

  });
}

function bindLauncherDelegation(){
  if (launcherDelegationBound) return;
  launcherDelegationBound = true;

  document.addEventListener("click", (e) => {
    const goBtn = e.target.closest && e.target.closest("#launcherModal [data-go]");
    if (goBtn){
      const page = goBtn.getAttribute("data-go");
      hideLauncher();
      showPage(page);
      return;
    }
    const close = e.target.closest && e.target.closest("#launcherModal [data-close], #closeLauncher");
    if (close){
      hideLauncher();
    }
  });
}

function showLauncher(){
  const m = document.getElementById("launcherModal");
  if (!m) return;
  m.hidden = false;
  m.setAttribute("aria-hidden", "false");
}
function hideLauncher(){
  const m = document.getElementById("launcherModal");
  if (!m) return;
  m.hidden = true;
  m.setAttribute("aria-hidden", "true");
}


function setSpeseView(view, { render=false } = {}){
  state.speseView = view;
  const list = document.getElementById("speseViewList");
  const ins = document.getElementById("speseViewInsights");
  if (list) list.hidden = (view !== "list");
  if (ins) ins.hidden = (view !== "insights");

  const btn = document.getElementById("btnSpeseInsights");
  if (btn){
    btn.setAttribute("aria-pressed", view === "insights" ? "true" : "false");
    btn.classList.toggle("is-active", view === "insights");
  }

  if (render){
    if (view === "list") {
      try{ renderSpese(); }catch(_){}
    } else {
      try{ renderRiepilogo(); }catch(_){}
      try{ renderGrafico(); }catch(_){}
    }
  }
}

/* NAV pages (5 pagine interne: home + 4 funzioni) */
function showPage(page){
  // Redirect: grafico/riepilogo ora sono dentro "Spese" (videata unica)
  if (page === "riepilogo" || page === "grafico"){
    page = "spese";
    state.speseView = "insights";
  }
  if (page === "spese" && !state.speseView) state.speseView = "list";

  state.page = page;
  document.body.dataset.page = page;

  document.querySelectorAll(".page").forEach(s => s.hidden = true);
  const el = $(`#page-${page}`);
  if (el) el.hidden = false;

  // Sotto-viste della pagina Spese (lista ↔ grafico+riepilogo)
  if (page === "spese") {
    try { setSpeseView(state.speseView || "list"); } catch (_) {}
  }

  // Period chip: nascosto in HOME (per rispettare "nessun altro testo" sulla home)
  const chip = $("#periodChip");
  if (chip){
    if (page === "home" || page === "ospite" || page === "ospiti") {
      chip.hidden = true;
    } else {
      chip.hidden = false;
      chip.textContent = `${state.period.from} → ${state.period.to}`;
    }
  }

  // render on demand
  if (page === "spese") { ensurePeriodData({ showLoader:true }).then(()=>renderSpese()).catch(e=>toast(e.message)); }
  if (page === "riepilogo") { ensurePeriodData({ showLoader:true }).then(()=>renderRiepilogo()).catch(e=>toast(e.message)); }
  if (page === "grafico") { ensurePeriodData({ showLoader:true }).then(()=>renderGrafico()).catch(e=>toast(e.message)); }
  if (page === "calendario") { ensureCalendarData().then(()=>renderCalendario()).catch(e=>toast(e.message)); }
  if (page === "ospiti") loadOspiti(state.period || {}).catch(e => toast(e.message));
}

function setupHeader(){
  const hb = $("#hamburgerBtn");
  if (hb) hb.addEventListener("click", () => { hideLauncher(); showPage("home"); });
}
function setupHome(){
  bindLauncherDelegation();
  bindHomeDelegation();
  // stampa build
  const build = $("#buildText");
  if (build) build.textContent = `${BUILD_VERSION}`;

  // SPESE: pulsante + (nuova spesa) e pulsante grafico+riepilogo
  const btnAdd = $("#btnAddSpesa");
  if (btnAdd){
    bindFastTap(btnAdd, () => { hideLauncher(); showPage("inserisci"); });
  }
  const btnInsights = $("#btnSpeseInsights");
  if (btnInsights){
    bindFastTap(btnInsights, async () => {
      // toggle vista
      const next = (state.speseView === "insights") ? "list" : "insights";
      if (next === "insights"){
        try{
          await ensurePeriodData({ showLoader:true });
          setSpeseView("insights", { render:true });
        }catch(e){ toast(e.message); }
      } else {
        setSpeseView("list");
      }
    });
  }


  // HOME: tasto Spese apre direttamente la pagina "spese" (senza launcher)
  const openBtn = $("#openLauncher");
  if (openBtn){
    bindFastTap(openBtn, () => { try{ setSpeseView("list"); }catch(_){} hideLauncher(); showPage("spese"); });
  }

  // HOME: icona Ospite va alla pagina ospite
  const goO = $("#goOspite");
  if (goO){
    goO.addEventListener("click", () => { showPage("ospiti"); });
  }
  // HOME: icona Ospiti va alla pagina elenco ospiti
  const goOs = $("#goOspiti");
  if (goOs){
    goOs.addEventListener("click", () => showPage("ospiti"));
  }


// OSPITI: pulsante + (nuovo ospite)
const btnNewGuestOspiti = $("#btnNewGuestOspiti");
if (btnNewGuestOspiti){
  btnNewGuestOspiti.addEventListener("click", () => { enterGuestCreateMode(); showPage("ospite"); });
}

  // HOME: icona Calendario (attiva e “tap-safe” su iOS PWA)
  const goCal = $("#goCalendario");
  if (goCal){
    goCal.disabled = false;
    goCal.removeAttribute("aria-disabled");
    bindFastTap(goCal, () => showPage("calendario"));

    // HARD FIX iOS PWA: alcuni tap finiscono su SVG/path e non generano click affidabile
    let __calTapLock = 0;
    const __go = (e)=>{
      const now = Date.now();
      if (now - __calTapLock < 450) return;
      __calTapLock = now;
      try{ e.preventDefault(); }catch(_){}
      try{ e.stopPropagation(); }catch(_){}
      showPage("calendario");
    };
    ["touchend","pointerup"].forEach(evt=>{
      try{ goCal.addEventListener(evt, __go, { passive:false, capture:true }); }
      catch(_){ goCal.addEventListener(evt, __go, true); }
    });
  }


  // launcher: icone interne navigano alle pagine
  document.querySelectorAll("#launcherModal [data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.getAttribute("data-go");
      hideLauncher();
      showPage(page);
    });
  });

  // chiusura launcher
  const closeBtn = $("#closeLauncher");
  if (closeBtn) closeBtn.addEventListener("click", hideLauncher);

  const modal = $("#launcherModal");
  if (modal){
    modal.querySelectorAll("[data-close]").forEach(el => {
      el.addEventListener("click", hideLauncher);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideLauncher();
  });
}


function setupGuestListControls(){
  const sortSel = $("#guestSortBy");
  const dirBtn = $("#guestSortDir");
  if (!sortSel) return;

  const savedBy = localStorage.getItem("dDAE_guestSortBy");
  const savedDir = localStorage.getItem("dDAE_guestSortDir");
  state.guestSortBy = savedBy || state.guestSortBy || "arrivo";
  state.guestSortDir = savedDir || state.guestSortDir || "asc";

  try { sortSel.value = state.guestSortBy; } catch(_) {}

  const paintDir = () => {
    if (!dirBtn) return;
    const asc = (state.guestSortDir !== "desc");
    dirBtn.textContent = asc ? "↑" : "↓";
    dirBtn.setAttribute("aria-pressed", asc ? "false" : "true");
  };
  paintDir();

  sortSel.addEventListener("change", () => {
    state.guestSortBy = sortSel.value;
    try { localStorage.setItem("dDAE_guestSortBy", state.guestSortBy); } catch(_){}
    renderGuestCards();
  });

  if (dirBtn){
    dirBtn.addEventListener("click", () => {
      state.guestSortDir = (state.guestSortDir === "desc") ? "asc" : "desc";
      try { localStorage.setItem("dDAE_guestSortDir", state.guestSortDir); } catch(_){}
      paintDir();
      renderGuestCards();
    });
  }
}

function guestIdOf(g){
  return String(g?.id ?? g?.ID ?? g?.ospite_id ?? g?.ospiteId ?? g?.guest_id ?? g?.guestId ?? "").trim();
}

function parseDateTs(v){
  const s = String(v ?? "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function computeInsertionMap(guests){
  const arr = (guests || []).map((g, idx) => {
    const id = guestIdOf(g);
    const c = g?.created_at ?? g?.createdAt ?? "";
    const t = parseDateTs(c);
    return { id, idx, t };
  });

  arr.sort((a,b) => {
    const at = a.t, bt = b.t;
    if (at != null && bt != null) return at - bt;
    if (at != null) return -1;
    if (bt != null) return 1;
    return a.idx - b.idx;
  });

  const map = {};
  let n = 1;
  for (const x of arr){
    if (!x.id) continue;
    map[x.id] = n++;
  }
  return map;
}

function sortGuestsList(items){
  const by = state.guestSortBy || "arrivo";
  const dir = (state.guestSortDir === "desc") ? -1 : 1;
  const nameKey = (s) => String(s ?? "").trim().toLowerCase();

  const out = items.slice();
  out.sort((a,b) => {
    if (by === "nome") {
      return nameKey(a.nome).localeCompare(nameKey(b.nome), "it") * dir;
    }
    if (by === "inserimento") {
      const aa = Number(a._insNo) || 1e18;
      const bb = Number(b._insNo) || 1e18;
      return (aa - bb) * dir;
    }
    const ta = parseDateTs(a.check_in ?? a.checkIn);
    const tb = parseDateTs(b.check_in ?? b.checkIn);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return (ta - tb) * dir;
  });
  return out;
}

/* PERIOD SYNC */
function setPeriod(from, to){
  state.period = { from, to };

  periodSyncLock += 1;
  try {
    const map = [
      ["#fromDate", "#toDate"],
      ["#fromDate2", "#toDate2"],
      ["#fromDate3", "#toDate3"],
      ["#fromDate4", "#toDate4"],
    ];
    for (const [fSel,tSel] of map){
      const f = $(fSel), t = $(tSel);
      if (f) f.value = from;
      if (t) t.value = to;
    }
  } finally {
    periodSyncLock -= 1;
  }

  const chip = $("#periodChip");
  if (chip && state.page !== "home") chip.textContent = `${from} → ${to}`;
}


async function onPeriodChanged({ showLoader=false } = {}){
  // Quando cambia il periodo, i dati “period-based” vanno considerati obsoleti
  state._dataKey = "";

  // Aggiorna solo ciò che serve (evita chiamate inutili e loader continui)
  if (state.page === "ospiti") {
    await loadOspiti(state.period || {});
    return;
  }
  if (state.page === "calendario") {
    if (state.calendar) state.calendar.ready = false;
    await ensureCalendarData();
    renderCalendario();
    return;
  }
  if (state.page === "spese") {
    await ensurePeriodData({ showLoader });
    // Se siamo nella sotto-vista "grafico+riepilogo", aggiorna anche quella
    if (state.speseView === "insights") {
      renderRiepilogo();
      renderGrafico();
    } else {
      renderSpese();
    }
    return;
  }
  if (state.page === "riepilogo") {
    await ensurePeriodData({ showLoader });
    renderRiepilogo();
    return;
  }
  if (state.page === "grafico") {
    await ensurePeriodData({ showLoader });
    renderGrafico();
    return;
  }
}

/* DATA LOAD */
async function loadMotivazioni(){
  const data = await cachedGet("motivazioni", {}, { showLoader:false, ttlMs: 5*60*1000 });
  state.motivazioni = data;

  const list = $("#motivazioniList");
  if (list) {
    list.innerHTML = "";
    data.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.motivazione;
      list.appendChild(opt);
    });
  }
}


async function loadStanze({ showLoader=true } = {}){
  const data = await cachedGet("stanze", {}, { showLoader, ttlMs: 60*1000 });
  const rows = Array.isArray(data) ? data : [];
  state.stanzeRows = rows;

  // indicizza per ospite_id + stanza_num
  const map = {};
  for (const r of rows){
    const gid = String(r.ospite_id ?? r.ospiteId ?? r.guest_id ?? r.guestId ?? "").trim();
    const sn = String(r.stanza_num ?? r.stanzaNum ?? r.room_number ?? r.roomNumber ?? r.stanza ?? r.room ?? "").trim();
    if (!gid || !sn) continue;
    const key = `${gid}:${sn}`;
    map[key] = {
      letto_m: Number(r.letto_m ?? r.lettoM ?? 0) || 0,
      letto_s: Number(r.letto_s ?? r.lettoS ?? 0) || 0,
      culla: Number(r.culla ?? r.crib ?? 0) || 0,
    };
  }
  state.stanzeByKey = map;
}

async function loadOspiti({ from="", to="" } = {}){
  // ✅ Necessario per mostrare i "pallini letti" stanza-per-stanza nelle schede ospiti
  await loadStanze({ showLoader:false });
  const data = await cachedGet("ospiti", { from, to }, { showLoader:true, ttlMs: 30*1000 });
  state.guests = Array.isArray(data) ? data : [];
  renderGuestCards();
}


async function ensurePeriodData({ showLoader=true, force=false } = {}){
  const { from, to } = state.period;
  const key = `${from}|${to}`;

  if (!force && state._dataKey === key && state.report && Array.isArray(state.spese)) {
    return;
  }

  const [report, spese] = await Promise.all([
    cachedGet("report", { from, to }, { showLoader, ttlMs: 15*1000, force }),
    cachedGet("spese", { from, to }, { showLoader, ttlMs: 15*1000, force }),
  ]);

  state.report = report;
  state.spese = spese;
  state._dataKey = key;
}

// Compat: vecchi call-site
async function loadData({ showLoader=true } = {}){
  return ensurePeriodData({ showLoader });
}


/* 1) INSERISCI */
function resetInserisci(){
  $("#spesaImporto").value = "";
  $("#spesaMotivazione").value = "";
  $("#spesaCategoria").value = "";
  $("#spesaData").value = todayISO();

  // Motivazione: se l'utente scrive una variante già esistente, usa la versione canonica
  const mot = $("#spesaMotivazione");
  if (mot) {
    mot.addEventListener("blur", () => {
      const v = collapseSpaces((mot.value || "").trim());
      if (!v) return;
      const canonical = findCanonicalMotivazione(v);
      if (canonical) mot.value = canonical;
      else mot.value = v; // pulizia spazi multipli
    });
  } // lascia oggi
}


function collapseSpaces(s){
  return String(s || "").replace(/\s+/g, " ");
}

// Normalizza SOLO per confronto (non altera la stringa salvata se già esistente)
function normalizeMotivazioneForCompare(s){
  let x = collapseSpaces(String(s || "").trim()).toLowerCase();
  // rimuove accenti SOLO per confronto
  try {
    x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  return x;
}

function findCanonicalMotivazione(input){
  const needle = normalizeMotivazioneForCompare(input);
  for (const m of (state.motivazioni || [])){
    const val = m?.motivazione ?? "";
    if (normalizeMotivazioneForCompare(val) === needle) return val;
  }
  return null;
}

async function saveSpesa(){
  const dataSpesa = $("#spesaData").value;
  const categoria = $("#spesaCategoria").value;
  const importoLordo = Number($("#spesaImporto").value);
  const motivazione = ($("#spesaMotivazione").value || "").trim();

  if (!isFinite(importoLordo) || importoLordo <= 0) return toast("Importo non valido");
  if (!motivazione) return toast("Motivazione obbligatoria");
  if (!dataSpesa) return toast("Data obbligatoria");
  if (!categoria) return toast("Categoria obbligatoria");

  // se motivazione nuova => salva per futuro
  const canonical = findCanonicalMotivazione(motivazione);
  // Se esiste già (spazi/case/accenti diversi), non salvare duplicati
  if (canonical) {
    $("#spesaMotivazione").value = canonical; // versione canonica
  } else {
    try {
      await api("motivazioni", { method:"POST", body:{ motivazione }, showLoader:false });
      await loadMotivazioni();
    } catch (_) {}
  }

  await api("spese", { method:"POST", body:{ dataSpesa, categoria, motivazione, importoLordo, note: "" } });

  toast("Salvato");
  resetInserisci();

  // aggiorna dati
  try {
    invalidateApiCache("spese|");
    invalidateApiCache("report|");
    await ensurePeriodData({ showLoader:false, force:true });
    if (state.page === "spese") renderSpese();
    if (state.page === "riepilogo") renderRiepilogo();
    if (state.page === "grafico") renderGrafico();
  } catch(_) {}
}

/* 2) SPESE */
function renderSpese(){
  const list = $("#speseList");
  if (!list) return;
  list.innerHTML = "";

  if (!state.spese || !state.spese.length){
    list.innerHTML = `<div style="font-size:13px; opacity:.75; padding:8px 2px;">Nessuna spesa nel periodo.</div>`;
    return;
  }

  for (const s of state.spese){
    const el = document.createElement("div");
    el.className = "item";

    el.innerHTML = `
      <div class="item-top">
        <div>
          <div class="item-title">${euro(s.importoLordo)} <span style="opacity:.7; font-weight:800;">· IVA ${euro(s.iva)}</span></div>
          <div class="item-sub">
            <span class="badge" style="background:${hexToRgba(COLORS[s.categoria] || "#d8bd97", 0.20)}">${categoriaLabel(s.categoria)}</span>
            <span class="mini">${s.dataSpesa}</span>
            <span class="mini" style="opacity:.75;">${escapeHtml(s.motivazione)}</span>
          </div>
        </div>
        <button class="delbtn" type="button" data-del="${s.id}">Elimina</button>
      </div>
    `;

    const __btnDel = el.querySelector("[data-del]");


    if (__btnDel) __btnDel.addEventListener("click", async () => {
      if (!confirm("Eliminare questa spesa?")) return;
      await api("spese", { method:"DELETE", params:{ id: s.id } });
      toast("Eliminata");
      invalidateApiCache("spese|");
      invalidateApiCache("report|");
      await ensurePeriodData({ showLoader:false, force:true });
      renderSpese();
    });

    list.appendChild(el);
  }
}

/* 3) RIEPILOGO */
function renderRiepilogo(){
  const r = state.report;
  if (!r) return;

  $("#kpiTotSpese").textContent = euro(r.totals.importoLordo);
  $("#kpiIvaDetraibile").textContent = euro(r.totals.ivaDetraibile);
  $("#kpiImponibile").textContent = euro(r.totals.imponibile);

  // Lista semplice: 5 righe (categoria + totale lordo)
  const container = $("#byCat");
  if (!container) return;

  const by = r.byCategoria || {};
  const order = ["CONTANTI","TASSA_SOGGIORNO","IVA_22","IVA_10","IVA_4"];

  container.innerHTML = "";
  for (const k of order){
    const o = by[k] || { importoLordo: 0 };
    const row = document.createElement("div");
    row.className = "catitem";
    row.innerHTML = `
      <div class="catitem-left">
        <span class="badge" style="background:${hexToRgba(COLORS[k] || "#d8bd97", 0.20)}">${categoriaLabel(k)}</span>
        <div class="catitem-name">Totale</div>
      </div>
      <div class="catitem-total">${euro(o.importoLordo)}</div>
    `;
    container.appendChild(row);
  }
}

/* 4) GRAFICO */
function renderGrafico(){
  const r = state.report;
  if (!r) return;

  const by = r.byCategoria || {};
  const order = ["CONTANTI","TASSA_SOGGIORNO","IVA_22","IVA_10","IVA_4"];
  const values = order.map(k => Number(by[k]?.importoLordo || 0));
  const total = values.reduce((a,b)=>a+b,0);

  drawPie("pieCanvas", order.map((k,i)=>({
    key: k,
    label: categoriaLabel(k),
    value: values[i],
    color: COLORS[k] || "#999999"
  })));

  const leg = $("#pieLegend");
  if (!leg) return;
  leg.innerHTML = "";

  order.forEach((k,i) => {
    const v = values[i];
    const pct = total > 0 ? (v/total*100) : 0;
    const row = document.createElement("div");
    row.className = "legrow";
    row.innerHTML = `
      <div class="legleft">
        <div class="dot" style="background:${COLORS[k] || "#999"}"></div>
        <div class="legname">${categoriaLabel(k)}</div>
      </div>
      <div class="legright">${pct.toFixed(1)}% · ${euro(v)}</div>
    `;
    leg.appendChild(row);
  });
}

/* PIE DRAW (no librerie) */
function drawPie(canvasId, slices){
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const cssSize = Math.min(320, Math.floor(window.innerWidth * 0.78));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssSize + "px";
  canvas.style.height = cssSize + "px";
  canvas.width = Math.floor(cssSize * dpr);
  canvas.height = Math.floor(cssSize * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssSize,cssSize);

  const total = slices.reduce((a,s)=>a+Math.max(0,Number(s.value||0)),0);
  const cx = cssSize/2, cy = cssSize/2;
  const r = cssSize/2 - 10;

  // Glass ring background
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.stroke();

  let ang = -Math.PI/2;
  if (total <= 0){
    ctx.beginPath();
    ctx.arc(cx, cy, r-8, 0, Math.PI*2);
    ctx.fillStyle = "rgba(43,124,180,0.10)";
    ctx.fill();
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.font = "600 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Nessun dato", cx, cy+4);
    return;
  }

  slices.forEach(s => {
    const v = Math.max(0, Number(s.value||0));
    const a = (v/total) * Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r-8,ang,ang+a);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ang += a;
  });

  // inner hole
  ctx.beginPath();
  ctx.arc(cx, cy, r*0.58, 0, Math.PI*2);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(15,23,42,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // center label
  ctx.fillStyle = "rgba(15,23,42,0.75)";
  ctx.font = "900 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Totale", cx, cy-4);
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.font = "950 14px system-ui";
  ctx.fillText(euro(total), cx, cy+14);
}

/* Helpers */
function hexToRgba(hex, a){
  const h = (hex || "").replace("#","");
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

/* Wire buttons */


function bindPeriodAuto(fromSel, toSel){
  const fromEl = document.querySelector(fromSel);
  const toEl = document.querySelector(toSel);
  if (!fromEl || !toEl) return;

  let timer = null;

  const schedule = () => {
    if (periodSyncLock > 0) return; // update programmatici: ignora
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (periodSyncLock > 0) return;
      const from = fromEl.value;
      const to = toEl.value;

      if (!from || !to) return;
      if (from > to) {
        toast("Periodo non valido");
        return;
      }

      setPresetValue("custom");
      setPeriod(from, to);

      try { await onPeriodChanged({ showLoader:false }); } catch (e) { toast(e.message); }
    }, 220);
  };

  fromEl.addEventListener("change", schedule);
  toEl.addEventListener("change", schedule);
}

function bindPeriodAutoGuests(fromSel, toSel){
  const fromEl = document.querySelector(fromSel);
  const toEl = document.querySelector(toSel);
  if (!fromEl || !toEl) return;

  let timer = null;

  const schedule = () => {
    if (periodSyncLock > 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (periodSyncLock > 0) return;
      const from = fromEl.value;
      const to = toEl.value;
      if (!from || !to) return;

      // valida
      if (from > to){
        toast("Periodo non valido");
        return;
      }

      setPresetValue("custom");
      setPeriod(from, to);

      try { await loadOspiti({ from, to }); } catch (e) { toast(e.message); }
    }, 220);
  };

  fromEl.addEventListener("change", schedule);
  toEl.addEventListener("change", schedule);
}






function updateGuestRemaining(){
  const out = document.getElementById("guestRemaining");
  if (!out) return;

  const totalEl = document.getElementById("guestTotal");
  const depEl = document.getElementById("guestDeposit");
  const saldoEl = document.getElementById("guestSaldo");

  const totalStr = (totalEl?.value ?? "");
  const depStr = (depEl?.value ?? "");
  const saldoStr = (saldoEl?.value ?? "");

  const anyFilled = [totalStr, depStr, saldoStr].some(s => String(s).trim().length > 0);
  if (!anyFilled) {
    out.value = "";
    try { refreshFloatingLabels(); } catch (_) {}
    return;
  }

  const total = parseFloat(totalStr || "0") || 0;
  const deposit = parseFloat(depStr || "0") || 0;
  const saldo = parseFloat(saldoStr || "0") || 0;
  const remaining = total - deposit - saldo;

  out.value = (isFinite(remaining) ? remaining.toFixed(2) : "");
  try { refreshFloatingLabels(); } catch (_) {}
}

function enterGuestCreateMode(){
  setGuestFormViewOnly(false);

  state.guestViewItem = null;

  state.guestMode = "create";
  state.guestEditId = null;
  state.guestEditCreatedAt = null;

  const title = document.getElementById("ospiteFormTitle");
  if (title) title.textContent = "Nuovo ospite";
  const btn = document.getElementById("createGuestCard");
  if (btn) btn.textContent = "Crea ospite";

  // reset fields
  const fields = ["guestName","guestAdults","guestKidsU10","guestCheckOut","guestTotal","guestBooking","guestDeposit","guestSaldo","guestRemaining"];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  try { updateGuestRemaining(); } catch (_) {}

  const ci = document.getElementById("guestCheckIn");
  if (ci) ci.value = todayISO();

  setMarriage(false);
  state.guestRooms = state.guestRooms || new Set();
  state.guestRooms.clear();
  state.lettiPerStanza = {};

  // Pagamenti (pillole): default contanti + ricevuta OFF
  state.guestDepositType = "contante";
  state.guestSaldoType = "contante";
  state.guestDepositReceipt = false;
  state.guestSaldoReceipt = false;

  setPayType("depositType", state.guestDepositType);
  setPayType("saldoType", state.guestSaldoType);
  setPayReceipt("depositType", state.guestDepositReceipt);
  setPayReceipt("saldoType", state.guestSaldoReceipt);


  // Registrazioni (PS/ISTAT): default OFF
  state.guestPSRegistered = false;
  state.guestISTATRegistered = false;
  setRegFlags("regTags", state.guestPSRegistered, state.guestISTATRegistered);
  // refresh rooms UI if present
  try {
    document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
      btn.classList.remove("selected");
      btn.setAttribute("aria-pressed", "false");
    });
  } catch (_) {}
  try { updateOspiteHdActions(); } catch (_) {}
}

function enterGuestEditMode(ospite){
  setGuestFormViewOnly(false);

  state.guestViewItem = null;

  state.guestMode = "edit";
  state.guestEditId = ospite?.id ?? null;
  state.guestEditCreatedAt = (ospite?.created_at ?? ospite?.createdAt ?? null);

  const title = document.getElementById("ospiteFormTitle");
  if (title) title.textContent = "Modifica ospite";
  const btn = document.getElementById("createGuestCard");
  if (btn) btn.textContent = "Salva modifiche";

  document.getElementById("guestName").value = ospite.nome || ospite.name || "";
  document.getElementById("guestAdults").value = ospite.adulti ?? ospite.adults ?? 0;
  document.getElementById("guestKidsU10").value = ospite.bambini_u10 ?? ospite.kidsU10 ?? 0;
  document.getElementById("guestCheckIn").value = formatISODateLocal(ospite.check_in || ospite.checkIn || "") || "";
  document.getElementById("guestCheckOut").value = formatISODateLocal(ospite.check_out || ospite.checkOut || "") || "";
  document.getElementById("guestTotal").value = ospite.importo_prenotazione ?? ospite.total ?? 0;
  document.getElementById("guestBooking").value = ospite.importo_booking ?? ospite.booking ?? 0;
  document.getElementById("guestDeposit").value = ospite.acconto_importo ?? ospite.deposit ?? 0;
  document.getElementById("guestSaldo").value = ospite.saldo_pagato ?? ospite.saldoPagato ?? ospite.saldo ?? 0;

  // matrimonio
  const mEl = document.getElementById("guestMarriage");
  if (mEl) mEl.checked = !!(ospite.matrimonio);
  refreshFloatingLabels();
  try { updateGuestRemaining(); } catch (_) {}


  // deposit type (se disponibile)
  const dt = ospite.acconto_tipo || ospite.depositType || "contante";
  state.guestDepositType = dt;
  setPayType("depositType", dt);

  const st = ospite.saldo_tipo || ospite.saldoTipo || "contante";
  state.guestSaldoType = st;
  setPayType("saldoType", st);

  // ricevuta fiscale (toggle indipendente)
  const depRec = truthy(ospite.acconto_ricevuta ?? ospite.accontoRicevuta ?? ospite.ricevuta_acconto ?? ospite.ricevutaAcconto ?? ospite.acconto_ricevutain);
  const saldoRec = truthy(ospite.saldo_ricevuta ?? ospite.saldoRicevuta ?? ospite.ricevuta_saldo ?? ospite.ricevutaSaldo ?? ospite.saldo_ricevutain);
  state.guestDepositReceipt = depRec;
  state.guestSaldoReceipt = saldoRec;
  setPayReceipt("depositType", depRec);
  setPayReceipt("saldoType", saldoRec);



  // registrazioni PS/ISTAT
  const psReg = truthy(ospite.ps_registrato ?? ospite.psRegistrato);
  const istatReg = truthy(ospite.istat_registrato ?? ospite.istatRegistrato);
  state.guestPSRegistered = psReg;
  state.guestISTATRegistered = istatReg;
  setRegFlags("regTags", psReg, istatReg);
  // stanze: backend non espone GET stanze; se in futuro arrivano su ospite.stanze li applichiamo
  try {
    if (ospite.stanze) {
      const rooms = Array.isArray(ospite.stanze) ? ospite.stanze : String(ospite.stanze).split(",").map(x=>x.trim()).filter(Boolean);
      state.guestRooms = new Set(rooms.map(x=>parseInt(x,10)).filter(n=>isFinite(n)));
      document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
        const n = parseInt(btn.getAttribute("data-room"), 10);
        const on = state.guestRooms.has(n);
        btn.classList.toggle("selected", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  } catch (_) {}
  try { updateOspiteHdActions(); } catch (_) {}
}

function _guestIdOf(item){
  return String(item?.id || item?.ID || item?.ospite_id || item?.ospiteId || item?.guest_id || item?.guestId || "").trim();
}

function _parseRoomsArr(stanzeField){
  let roomsArr = [];
  try {
    const st = stanzeField;
    if (Array.isArray(st)) roomsArr = st;
    else if (st != null && String(st).trim().length) {
      const s = String(st);
      const m = s.match(/[1-6]/g) || [];
      roomsArr = m.map(x => parseInt(x, 10));
    }
  } catch (_) {}
  roomsArr = Array.from(new Set((roomsArr||[]).map(n => parseInt(n,10)).filter(n => isFinite(n) && n>=1 && n<=6))).sort((a,b)=>a-b);
  return roomsArr;
}

function buildRoomsStackHTML(guestId, roomsArr){
  if (!roomsArr || !roomsArr.length) return `<span class="room-dot-badge is-empty" aria-label="Nessuna stanza">—</span>`;
  return `<div class="rooms-stack" aria-label="Stanze e letti">` + roomsArr.map((n) => {
    const key = `${guestId}:${n}`;
    const info = (state.stanzeByKey && state.stanzeByKey[key]) ? state.stanzeByKey[key] : { letto_m: 0, letto_s: 0, culla: 0 };
    const lettoM = Number(info.letto_m || 0) || 0;
    const lettoS = Number(info.letto_s || 0) || 0;
    const culla  = Number(info.culla  || 0) || 0;

    let dots = "";
    if (lettoM > 0) dots += `<span class="bed-dot bed-dot-m" aria-label="Letto matrimoniale"></span>`;
    for (let i = 0; i < lettoS; i++) dots += `<span class="bed-dot bed-dot-s" aria-label="Letto singolo"></span>`;
    if (culla > 0) dots += `<span class="bed-dot bed-dot-c" aria-label="Culla"></span>`;

    return `<div class="room-row">
      <span class="room-dot-badge">${n}</span>
      <div class="bed-dots" aria-label="Letti">${dots || `<span class="bed-dot bed-dot-empty" aria-label="Nessun letto"></span>`}</div>
    </div>`;
  }).join("") + `</div>`;
}

function renderRoomsReadOnly(ospite){
  const ro = document.getElementById("roomsReadOnly");
  if (!ro) return;

  const guestId = _guestIdOf(ospite);
  let roomsArr = _parseRoomsArr(ospite?.stanze);

  // fallback: se per qualche motivo non arriva 'stanze' dal backend, usa lo stato locale
  if (!roomsArr.length && state.guestRooms && state.guestRooms.size){
    roomsArr = Array.from(state.guestRooms).map(n => parseInt(n,10)).filter(n => isFinite(n) && n>=1 && n<=6).sort((a,b)=>a-b);
  }

  ro.innerHTML = buildRoomsStackHTML(guestId, roomsArr);
}

function updateOspiteHdActions(){
  const hdActions = document.getElementById("ospiteHdActions");
  if (!hdActions) return;

  // Mostra il contenitore (poi nascondiamo i singoli pallini senza azione)
  hdActions.hidden = false;

  const btnBack = hdActions.querySelector("[data-guest-back]");
  const btnEdit = hdActions.querySelector("[data-guest-edit]");
  const btnDel  = hdActions.querySelector("[data-guest-del]");

  const mode = state.guestMode; // "create" | "edit" | "view"

  // Verde: sempre presente (torna alla lista ospiti)
  if (btnBack) btnBack.hidden = false;

  // Giallo: solo in sola lettura (azione: passa a modifica)
  if (btnEdit) btnEdit.hidden = (mode !== "view");

  // Rosso: in sola lettura e in modifica (azione: elimina ospite)
  if (btnDel) btnDel.hidden = !(mode === "view" || mode === "edit");
}

function setGuestFormViewOnly(isView, ospite){
  const card = document.querySelector("#page-ospite .guest-form-card");
  if (card) card.classList.toggle("is-view", !!isView);

  const btn = document.getElementById("createGuestCard");
  if (btn) btn.hidden = !!isView;

  const picker = document.getElementById("roomsPicker");
  if (picker) picker.hidden = !!isView;

  const ro = document.getElementById("roomsReadOnly");
  if (ro) {
    ro.hidden = !isView;
    if (isView) renderRoomsReadOnly(ospite);
    else ro.innerHTML = "";
  }

  // Aggiorna i pallini in testata in base alla modalità corrente
  try { updateOspiteHdActions(); } catch (_) {}
}

function enterGuestViewMode(ospite){
  // Riempiamo la maschera usando la stessa logica dell'edit, poi blocchiamo tutto in sola lettura
  enterGuestEditMode(ospite);
  state.guestMode = "view";
  state.guestViewItem = ospite || null;

  const title = document.getElementById("ospiteFormTitle");
  if (title) title.textContent = "Scheda ospite";

  setGuestFormViewOnly(true, ospite);
  try { updateOspiteHdActions(); } catch (_) {}
}


async function saveGuest(){
  const name = (document.getElementById("guestName")?.value || "").trim();
  const adults = parseInt(document.getElementById("guestAdults")?.value || "0", 10) || 0;
  const kidsU10 = parseInt(document.getElementById("guestKidsU10")?.value || "0", 10) || 0;
  const checkIn = document.getElementById("guestCheckIn")?.value || "";
  const checkOut = document.getElementById("guestCheckOut")?.value || "";
  const total = parseFloat(document.getElementById("guestTotal")?.value || "0") || 0;
  const booking = parseFloat(document.getElementById("guestBooking")?.value || "0") || 0;
  const deposit = parseFloat(document.getElementById("guestDeposit")?.value || "0") || 0;
  const saldoPagato = parseFloat(document.getElementById("guestSaldo")?.value || "0") || 0;
  const saldoTipo = state.guestSaldoType || "contante";
  const rooms = Array.from(state.guestRooms || []).sort((a,b)=>a-b);
  const depositType = state.guestDepositType || "contante";
  const matrimonio = !!(state.guestMarriage);
if (!name) return toast("Inserisci il nome");
  const payload = {
    nome: name,
    adulti: adults,
    bambini_u10: kidsU10,
    check_in: checkIn,
    check_out: checkOut,
    importo_prenotazione: total,
    importo_booking: booking,
    acconto_importo: deposit,
    acconto_tipo: depositType,
    saldo_pagato: saldoPagato,
    saldo_tipo: saldoTipo,
    acconto_ricevuta: !!state.guestDepositReceipt,
    saldo_ricevuta: !!state.guestSaldoReceipt,
    saldo_ricevutain: !!state.guestSaldoReceipt,
    matrimonio,
    ps_registrato: state.guestPSRegistered ? "1" : "",
    istat_registrato: state.guestISTATRegistered ? "1" : "",
    stanze: rooms.join(",")
  };



  const isEdit = state.guestMode === "edit";
  if (isEdit){
    if (!state.guestEditId) return toast("ID ospite mancante");
    payload.id = state.guestEditId;
    // preserva la data di inserimento (non deve cambiare con le modifiche)
    const ca = state.guestEditCreatedAt;
    if (ca){
      payload.createdAt = ca;
      payload.created_at = ca;
    }
  }

  
  else {
    // CREATE: genera subito un ID stabile, così possiamo salvare le stanze al primo tentativo
    payload.id = payload.id || genId("o");
  }
// CREATE vs UPDATE (backend GAS: POST=create, PUT=update)
  const method = isEdit ? "PUT" : "POST";
  const res = await api("ospiti", { method, body: payload });

  // stanze: backend gestisce POST e sovrascrive (deleteWhere + append)
  const ospiteId = payload.id;
  const stanze = buildStanzeArrayFromState();
  try { await api("stanze", { method:"POST", body: { ospite_id: ospiteId, stanze } }); } catch (_) {}

  await loadOspiti(state.period || {});
  toast(isEdit ? "Modifiche salvate" : "Ospite creato");

  if (isEdit){
    showPage("ospiti");
  } else {
    enterGuestCreateMode();
  }
}

function setupOspite(){
  const hb = document.getElementById("hamburgerBtnOspite");
  if (hb) hb.addEventListener("click", () => { hideLauncher(); showPage("home"); });

  // Azioni Scheda ospite (solo lettura): verde=indietro, giallo=modifica, rosso=elimina
  const hdActions = document.getElementById("ospiteHdActions");
  if (hdActions && !hdActions.__bound){
    hdActions.__bound = true;
    hdActions.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn || !hdActions.contains(btn) || btn.hidden) return;

      // Verde: torna sempre alla lista ospiti (anche in Nuovo/Modifica)
      if (btn.hasAttribute("data-guest-back")){
        showPage("ospiti");
        return;
      }

      const mode = state.guestMode;
      const item = state.guestViewItem;

      // Giallo: dalla sola lettura passa a modifica
      if (btn.hasAttribute("data-guest-edit")){
        if (!item) return;
        enterGuestEditMode(item);
        try { updateOspiteHdActions(); } catch (_) {}
        return;
      }

      // Rosso: elimina (solo in sola lettura o modifica)
      if (btn.hasAttribute("data-guest-del")){
        let gid = null;

        if (mode === "view"){
          if (!item) return;
          gid = guestIdOf(item) || item.id;
        } else if (mode === "edit"){
          gid = state.guestEditId || null;
        }

        if (!gid) return;
        if (!confirm("Eliminare definitivamente questo ospite?")) return;

        try {
          await api("ospiti", { method:"DELETE", params:{ id: gid }});
          toast("Ospite eliminato");
          invalidateApiCache("ospiti|");
          invalidateApiCache("stanze|");
          await loadOspiti(state.period || {});
          showPage("ospiti");
        } catch (err) {
          toast(err?.message || "Errore");
        }
        return;
      }
    });
}

  const roomsWrap = document.getElementById("roomsPicker");
  const roomsOut = null; // removed UI string output

  function renderRooms(){
    const arr = Array.from(state.guestRooms).sort((a,b)=>a-b);
    roomsWrap?.querySelectorAll(".room-dot").forEach(btn => {
      const n = parseInt(btn.getAttribute("data-room"), 10);
      const on = state.guestRooms.has(n);
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  // matrimonio dot
  setMarriage(state.guestMarriage);

  }

  roomsWrap?.addEventListener("click", (e) => {
    const b = e.target.closest(".room-dot");
    if (!b) return;
    if (b.id === "roomMarriage") { setMarriage(!state.guestMarriage); return; }
    const n = parseInt(b.getAttribute("data-room"), 10);
    if (state.guestRooms.has(n)) {
      state.guestRooms.delete(n);
      if (state.lettiPerStanza) delete state.lettiPerStanza[String(n)];
    } else {
      state.guestRooms.add(n);
    }
    renderRooms();
  });

  function bindPayPill(containerId, kind){
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".pay-dot");
      if (!btn || !wrap.contains(btn)) return;

      const t = btn.getAttribute("data-type");
      if (t) {
        if (kind === "deposit") state.guestDepositType = t;
        if (kind === "saldo") state.guestSaldoType = t;
        setPayType(containerId, t);
        return;
      }

      if (btn.hasAttribute("data-receipt")) {
        if (kind === "deposit") state.guestDepositReceipt = !state.guestDepositReceipt;
        if (kind === "saldo") state.guestSaldoReceipt = !state.guestSaldoReceipt;
        setPayReceipt(containerId, kind === "deposit" ? state.guestDepositReceipt : state.guestSaldoReceipt);
        return;
      }
    });
  }

  bindPayPill("depositType", "deposit");
  bindPayPill("saldoType", "saldo");



  function bindRegPill(containerId){
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest('.pay-dot[data-flag]');
      if (!btn || !wrap.contains(btn)) return;

      const flag = (btn.getAttribute("data-flag") || "").toLowerCase();
      if (flag === "ps") state.guestPSRegistered = !state.guestPSRegistered;
      if (flag === "istat") state.guestISTATRegistered = !state.guestISTATRegistered;

      setRegFlags(containerId, state.guestPSRegistered, state.guestISTATRegistered);
    });
  }

  bindRegPill("regTags");

  // Rimanenza da pagare (Importo prenotazione - Acconto - Saldo)
  ["guestTotal","guestDeposit","guestSaldo"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => { try { updateGuestRemaining(); } catch (_) {} });
    el.addEventListener("change", () => { try { updateGuestRemaining(); } catch (_) {} });
  });
  try { updateGuestRemaining(); } catch (_) {}


  const btnCreate = document.getElementById("createGuestCard");
  btnCreate?.addEventListener("click", async () => {
    try { await saveGuest(); } catch (e) { toast(e.message || "Errore"); }
  });

  // Default: check-in oggi (solo UI)
  const today = new Date();
  const iso = today.toISOString().slice(0,10);
  const ci = document.getElementById("guestCheckIn");
  if (ci && !ci.value) ci.value = iso;

  renderRooms();
  renderGuestCards();
}

function euro(n){
  try { return (Number(n)||0).toLocaleString("it-IT", { style:"currency", currency:"EUR" }); }
  catch { return (Number(n)||0).toFixed(2) + " €"; }
}



function renderGuestCards(){
  const wrap = document.getElementById("guestCards");
  if (!wrap) return;
  wrap.hidden = false;
  wrap.innerHTML = "";

  let items = Array.isArray(state.ospiti) && state.ospiti.length
    ? state.ospiti
    : (Array.isArray(state.guests) ? state.guests : []);

  if (!items.length){
    wrap.innerHTML = '<div style="opacity:.7;font-size:14px;padding:8px;">Nessun ospite nel periodo.</div>';
    return;
  }

  // Numero progressivo di inserimento (stabile) + sorting
  const insMap = computeInsertionMap(items);
  items.forEach((it) => {
    const id = guestIdOf(it);
    it._insNo = id ? insMap[id] : null;
  });

  items = sortGuestsList(items);

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "guest-card";

    const nome = escapeHtml(item.nome || item.name || "Ospite");

    const insNo = (Number(item._insNo) && Number(item._insNo) > 0) ? Number(item._insNo) : null;

    const led = guestLedStatus(item);
    const depositTypeRaw = (item.acconto_tipo || item.depositType || item.guestDepositType || "contante").toString().toLowerCase();
    const depositTag = (depositTypeRaw.includes("elet")) ? "Elettronico" : "Contanti";

    const depAmount = Number(item.acconto_importo || 0);
    const saldoAmount = Number(item.saldo_pagato ?? item.saldoPagato ?? item.saldo ?? 0);
    const saldoTypeRaw = (item.saldo_tipo || item.saldoTipo || item.saldoType || item.guestSaldoType || "").toString().toLowerCase();

    const depLedCls = (!depAmount) ? "led-gray led-off" : (depositTypeRaw.includes("elet") ? "led-green" : "led-red");
    const saldoLedCls = (!saldoAmount) ? "led-gray led-off" : (saldoTypeRaw.includes("elet") ? "led-green" : "led-red");

    // Stanze prenotate (campo 'stanze' se presente: "1,2", "[1,2]", "1 2", ecc.)
    let roomsArr = [];
    try {
      const st = item.stanze;
      if (Array.isArray(st)) {
        roomsArr = st;
      } else if (st != null && String(st).trim().length) {
        const s = String(st);
        // Estrae SOLO numeri 1–6 (robusto contro separatori strani)
        const m = s.match(/[1-6]/g) || [];
        roomsArr = m.map(x => parseInt(x, 10));
      }
    } catch (_) {}
    roomsArr = Array.from(new Set((roomsArr||[]).map(n=>parseInt(n,10)).filter(n=>isFinite(n) && n>=1 && n<=6))).sort((a,b)=>a-b);

    const guestId = String(item.id || item.ID || item.ospite_id || item.ospiteId || item.guest_id || item.guestId || "").trim();

    const roomsDotsHTML = roomsArr.length
      ? `<div class="rooms-stack" aria-label="Stanze e letti">` + roomsArr.map((n) => {
          const key = `${guestId}:${n}`;
          const info = (state.stanzeByKey && state.stanzeByKey[key]) ? state.stanzeByKey[key] : { letto_m: 0, letto_s: 0, culla: 0 };
          const lettoM = Number(info.letto_m || 0) || 0;
          const lettoS = Number(info.letto_s || 0) || 0;
          const culla = Number(info.culla || 0) || 0;

          let dots = "";
          if (lettoM > 0) dots += `<span class="bed-dot bed-dot-m" aria-label="Letto matrimoniale"></span>`;
          for (let i = 0; i < lettoS; i++) dots += `<span class="bed-dot bed-dot-s" aria-label="Letto singolo"></span>`;
          if (culla > 0) dots += `<span class="bed-dot bed-dot-c" aria-label="Culla"></span>`;

          return `<div class="room-row">
            <span class="room-dot-badge" aria-label="Stanza ${n}">${n}</span>
            <div class="bed-dots" aria-label="Dotazione letti">${dots}</div>
          </div>`;
        }).join("") + `</div>`
      : `<span class="room-dot-badge is-empty" aria-label="Nessuna stanza">—</span>`;




    const arrivoText = formatLongDateIT(item.check_in || item.checkIn || "") || "—";

    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Apri scheda ospite: ${nome}`);

    card.innerHTML = `
      <div class="guest-row">
        <div class="guest-main">
          ${insNo ? `<span class="guest-insno">${insNo}</span>` : ``}
          <span class="guest-name-text">${nome}</span>
        </div>
        <div class="guest-meta-right" aria-label="Arrivo e stato">
          <span class="guest-arrivo" aria-label="Arrivo">${arrivoText}</span>
          <span class="guest-led ${led.cls}" aria-label="${led.label}" title="${led.label}"></span>
        </div>
      </div>
    `;

    const open = () => {
      enterGuestViewMode(item);
      showPage("ospite");
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    wrap.appendChild(card);
  });
}






function initFloatingLabels(){
  const fields = document.querySelectorAll(".field.float");
  fields.forEach((f) => {
    const control = f.querySelector("input, select, textarea");
    if (!control) return;
    const update = () => {
      const has = !!(control.value && String(control.value).trim().length);
      f.classList.toggle("has-value", has);
    };
    control.addEventListener("input", update);
    control.addEventListener("change", update);
    update();
  });
}


function refreshFloatingLabels(){
  try{
    document.querySelectorAll(".field.float").forEach(f => {
      const c = f.querySelector("input, select, textarea");
      const v = c ? String(c.value ?? "").trim() : "";
      f.classList.toggle("has-value", v.length > 0);
    });
  }catch(_){}
}


async function init(){
  const __restore = __readRestoreState();
  document.body.dataset.page = "home";
  setupHeader();
  setupHome();
  setupCalendario();

    setupOspite();
  initFloatingLabels();
// periodo iniziale
  if (__restore && __restore.preset) state.periodPreset = __restore.preset;
  if (__restore && __restore.period && __restore.period.from && __restore.period.to) {
    setPeriod(__restore.period.from, __restore.period.to);
  } else {
    const [from,to] = monthRangeISO(new Date());
    setPeriod(from,to);
  }

  // Preset periodo (scroll iOS)
  bindPresetSelect("#periodPreset1");
  bindPresetSelect("#periodPreset2");
  bindPresetSelect("#periodPreset3");
  bindPresetSelect("#periodPreset4");
  setPresetValue(state.periodPreset || "this_month");

  // Periodo automatico (niente tasto Applica)
  bindPeriodAuto("#fromDate", "#toDate");
  bindPeriodAuto("#fromDate2", "#toDate2");
  bindPeriodAuto("#fromDate3", "#toDate3");
  bindPeriodAutoGuests("#fromDate4", "#toDate4");
  setupGuestListControls();

  $("#spesaData").value = todayISO();

  // Motivazione: se l'utente scrive una variante già esistente, usa la versione canonica
  const mot = $("#spesaMotivazione");
  if (mot) {
    mot.addEventListener("blur", () => {
      const v = collapseSpaces((mot.value || "").trim());
      if (!v) return;
      const canonical = findCanonicalMotivazione(v);
      if (canonical) mot.value = canonical;
      else mot.value = v; // pulizia spazi multipli
    });
  }

  $("#btnSaveSpesa").addEventListener("click", async () => {
    try { await saveSpesa(); } catch(e){ toast(e.message); }
  });


  // prefetch leggero (evita lentezza all'avvio)
  try { await loadMotivazioni(); } catch(e){ toast(e.message); }

  // avvio: ripristina sezione se il SW ha forzato un reload su iOS
  const targetPage = (__restore && __restore.page) ? __restore.page : "home";
  showPage(targetPage);
  if (__restore) setTimeout(() => { try { __applyUiState(__restore); } catch(_) {} }, 0);
}


// ===== CALENDARIO (dDAE_1.094) =====
function setupCalendario(){
  const pickBtn = document.getElementById("calPickBtn");
  const todayBtn = document.getElementById("calTodayBtn");
  const prevBtn = document.getElementById("calPrevBtn");
  const nextBtn = document.getElementById("calNextBtn");
  const input = document.getElementById("calDateInput");

  if (!state.calendar) {
    state.calendar = { anchor: new Date(), ready: false, guests: [] };
  }

  const openPicker = () => {
    if (!input) return;
    try { input.value = formatISODateLocal(state.calendar.anchor) || todayISO(); } catch(_) {}
    input.click();
  };

  if (pickBtn) pickBtn.addEventListener("click", openPicker);
  if (input) input.addEventListener("change", () => {
    if (!input.value) return;
    state.calendar.anchor = new Date(input.value + "T00:00:00");
    renderCalendario();
  });
  if (todayBtn) todayBtn.addEventListener("click", () => {
    state.calendar.anchor = new Date();
    renderCalendario();
  });
  if (prevBtn) prevBtn.addEventListener("click", () => {
    state.calendar.anchor = addDays(state.calendar.anchor, -7);
    renderCalendario();
  });
  if (nextBtn) nextBtn.addEventListener("click", () => {
    state.calendar.anchor = addDays(state.calendar.anchor, 7);
    renderCalendario();
  });
}


async function ensureCalendarData() {
  if (!state.calendar) state.calendar = { anchor: new Date(), ready: false, guests: [], rangeKey: "" };

  const anchor = (state.calendar && state.calendar.anchor) ? state.calendar.anchor : new Date();
  const start = startOfWeekMonday(anchor);

  // Finestra dati: 2 settimane prima + 2 settimane dopo (evita payload enormi)
  const winFrom = toISO(addDays(start, -14));
  const winTo = toISO(addDays(start, 7 + 14));
  const rangeKey = `${winFrom}|${winTo}`;

  // Se ho già i dati per questa finestra, non ricarico
  if (state.calendar.ready && state.calendar.rangeKey === rangeKey) return;

  await loadStanze({ showLoader: true }); // necessario per i pallini letti
  const data = await cachedGet("ospiti", { from: winFrom, to: winTo }, { showLoader: true, ttlMs: 30*1000 });
  state.calendar.guests = Array.isArray(data) ? data : [];
  state.calendar.ready = true;
  state.calendar.rangeKey = rangeKey;
}


function renderCalendario(){
  const grid = document.getElementById("calGrid");
  const title = document.getElementById("calWeekTitle");
  if (!grid) return;

  const anchor = (state.calendar && state.calendar.anchor) ? state.calendar.anchor : new Date();
  const start = startOfWeekMonday(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  if (title) {
    const month = monthNameIT(start).toUpperCase();
    title.textContent = month;
  }

  const occ = buildWeekOccupancy(start);

  grid.innerHTML = "";

  // Angolo alto-sinistra: etichetta "STANZE" (a sinistra della stanza 1, sopra Lunedì)
  const corner = document.createElement("div");
  corner.className = "cal-pill corner";
  corner.textContent = "ST";
  grid.appendChild(corner);

  for (let r = 1; r <= 6; r++) {
    const pill = document.createElement("div");
    pill.className = `cal-pill room room-${r}`;
    pill.textContent = String(r);
    grid.appendChild(pill);
  }

  for (let i = 0; i < 7; i++) {
    const d = days[i];

    const dayPill = document.createElement("div");
    dayPill.className = "cal-pill day";
    dayPill.textContent = `${weekdayShortIT(d)} ${d.getDate()}`;
    grid.appendChild(dayPill);

    const dIso = isoDate(d);
    for (let r = 1; r <= 6; r++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cal-cell room-${r}`;
      cell.setAttribute("aria-label", `Stanza ${r}, ${weekdayShortIT(d)} ${d.getDate()}`);
      cell.dataset.date = dIso;
      cell.dataset.room = String(r);

      const info = occ.get(`${dIso}:${r}`);
      if (info) {
        if (info.lastDay) cell.classList.add("last-day");

        const inner = document.createElement("div");
        inner.className = "cal-cell-inner";

        const ini = document.createElement("div");
        ini.className = "cal-initials";
        ini.textContent = info.initials;
        inner.appendChild(ini);

        const dots = document.createElement("div");
        dots.className = "cal-dots";
        const arr = info.dots.slice(0, 4); // 2x2
        for (const t of arr) {
          const s = document.createElement("span");
          s.className = `bed-dot ${t === "m" ? "bed-dot-m" : t === "s" ? "bed-dot-s" : "bed-dot-c"}`;
          dots.appendChild(s);
        }
        inner.appendChild(dots);

        cell.appendChild(inner);

        cell.addEventListener("click", () => {
          const ospite = findCalendarGuestById(info.guestId);
          if (!ospite) return;
          enterGuestViewMode(ospite);
          showPage("ospite");
        });
      }

      grid.appendChild(cell);
    }
  }
}

function findCalendarGuestById(id){
  const gid = String(id ?? "").trim();
  const arr = (state.calendar && Array.isArray(state.calendar.guests)) ? state.calendar.guests : [];
  return arr.find(o => String(o.id ?? o.ID ?? o.ospite_id ?? o.ospiteId ?? o.guest_id ?? o.guestId ?? "").trim() === gid) || null;
}

function buildWeekOccupancy(weekStart){
  const map = new Map();
  const guests = (state.calendar && Array.isArray(state.calendar.guests)) ? state.calendar.guests : [];
  const weekEnd = addDays(weekStart, 7);

  for (const g of guests){
    const guestId = String(g.id ?? g.ID ?? g.ospite_id ?? g.ospiteId ?? g.guest_id ?? g.guestId ?? "").trim();
    if (!guestId) continue;

    const ciStr = formatISODateLocal(g.check_in || g.checkIn || "");
    const coStr = formatISODateLocal(g.check_out || g.checkOut || "");
    if (!ciStr || !coStr) continue;

    const ci = new Date(ciStr + "T00:00:00");
    const co = new Date(coStr + "T00:00:00");
    const last = addDays(co, -1);

    let roomsArr = [];
    try {
      const st = g.stanze;
      if (Array.isArray(st)) roomsArr = st;
      else if (st != null && String(st).trim().length) {
        const m = String(st).match(/[1-6]/g) || [];
        roomsArr = m.map(x => parseInt(x, 10));
      }
    } catch (_) {}
    roomsArr = Array.from(new Set((roomsArr||[]).map(n=>parseInt(n,10)).filter(n=>isFinite(n) && n>=1 && n<=6))).sort((a,b)=>a-b);
    if (!roomsArr.length) continue;

    const initials = initialsFromName(g.nome || g.name || "");

    for (let d = new Date(ci); d < co; d = addDays(d, 1)) {
      if (d < weekStart || d >= weekEnd) continue;
      const dIso = isoDate(d);
      const isLast = isoDate(d) === isoDate(last);

      for (const r of roomsArr) {
        const dots = dotsForGuestRoom(guestId, r);
        map.set(`${dIso}:${r}`, { guestId, initials, dots, lastDay: isLast });
      }
    }
  }
  return map;
}

function dotsForGuestRoom(guestId, room){
  const key = `${guestId}:${room}`;
  const info = (state.stanzeByKey && state.stanzeByKey[key]) ? state.stanzeByKey[key] : { letto_m:0, letto_s:0, culla:0 };
  const lettoM = Number(info.letto_m || 0) || 0;
  const lettoS = Number(info.letto_s || 0) || 0;
  const culla = Number(info.culla || 0) || 0;

  const arr = [];
  if (lettoM > 0) arr.push("m");
  for (let i=0;i<lettoS;i++) arr.push("s");
  if (culla > 0) arr.push("c");
  return arr;
}

function initialsFromName(name){
  const s = collapseSpaces(String(name||"").trim());
  if (!s) return "";
  const parts = s.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  const a = parts[0].slice(0,1);
  const b = parts[parts.length-1].slice(0,1);
  return (a+b).toUpperCase();
}

function startOfWeekMonday(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  return addDays(d, diff);
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0,0,0,0);
  return d;
}

function isoDate(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function weekdayShortIT(date){
  const names = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
  return names[new Date(date).getDay()];
}

function monthNameIT(date){
  const names = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  return names[new Date(date).getMonth()];
}

function romanWeekOfMonth(weekStart){
  const d = new Date(weekStart);
  const y = d.getFullYear();
  const m = d.getMonth();
  const firstOfMonth = new Date(y, m, 1);
  const firstWeekStart = startOfWeekMonday(firstOfMonth);
  const diff = Math.floor((startOfWeekMonday(d) - firstWeekStart) / (7*24*60*60*1000));
  const n = Math.max(1, diff + 1);
  return toRoman(n);
}

function toRoman(n){
  const map = [[10,"X"],[9,"IX"],[8,"VIII"],[7,"VII"],[6,"VI"],[5,"V"],[4,"IV"],[3,"III"],[2,"II"],[1,"I"]];
  let out = "";
  let x = Math.max(1, Math.min(10, n));
  for (const [v,s] of map){
    while (x >= v){ out += s; x -= v; }
  }
  return out || "I";
}


init();


/* Service Worker: forza update su iOS (cache-bust via query) */
async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try {
    // Query param = BUILD_VERSION -> forza fetch del file SW anche con cache aggressiva
    const reg = await navigator.serviceWorker.register(`./service-worker.js?v=${BUILD_VERSION}`, {
      updateViaCache: "none"
    });

    const checkUpdate = () => {
      try { reg?.update?.(); } catch (_) {}
    };

    // check immediato + quando torna in primo piano
    checkUpdate();
    window.addEventListener("focus", checkUpdate);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkUpdate();
    });
    // check periodico (non invasivo)
    setInterval(checkUpdate, 60 * 60 * 1000);

    // Se viene trovata una nuova versione, prova ad attivarla subito
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          try { nw.postMessage({ type: "SKIP_WAITING" }); } catch (_) {}
        }
      });
    });

    // se cambia controller, ricarica una volta per prendere i file nuovi
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      try { __writeRestoreState(__captureUiState()); } catch (_) {}
      location.reload();
    });
  } catch (_) {}
}
registerSW();




// --- Stanze helpers (sheet "stanze") ---
function buildStanzeArrayFromState(){
  const rooms = Array.from(state.guestRooms || []).map(n=>parseInt(n,10)).filter(n=>isFinite(n)).sort((a,b)=>a-b);
  const lp = state.lettiPerStanza || {};
  return rooms.map((n)=>{
    const d = lp[String(n)] || lp[n] || {};
    return {
      stanza_num: n,
      letto_m: !!d.matrimoniale,
      letto_s: parseInt(d.singoli || 0, 10) || 0,
      culla: !!d.culla,
      note: (d.note || "").toString()
    };
  });
}

function applyStanzeToState(rows){
  state.guestRooms = state.guestRooms || new Set();
  state.lettiPerStanza = {};
  state.guestRooms.clear();
  (Array.isArray(rows) ? rows : []).forEach(r=>{
    const n = parseInt(r.stanza_num ?? r.stanzaNum ?? r.room ?? r.stanza, 10);
    if (!isFinite(n) || n<=0) return;
    state.guestRooms.add(n);
    state.lettiPerStanza[String(n)] = {
      matrimoniale: !!(r.letto_m ?? r.lettoM ?? r.matrimoniale),
      singoli: parseInt(r.letto_s ?? r.lettoS ?? r.singoli, 10) || 0,
      culla: !!(r.culla),
      note: (r.note || "").toString()
    };
  });
}

// --- Room beds config (non-invasive) ---
state.lettiPerStanza = state.lettiPerStanza || {};
let __rc_room = null;

function __rc_renderToggle(el, on){
  el.innerHTML = `<span class="dot ${on?'on':''}"></span>`;
  el.onclick = ()=> el.firstElementChild.classList.toggle('on');
}
function __rc_renderSingoli(el, n){
  el.innerHTML = '';
  for(let i=1;i<=3;i++){
    const s=document.createElement('span');
    s.className='dot'+(i<=n?' on':'');
    s.onclick=()=>{
      [...el.children].forEach((c,ix)=>c.classList.toggle('on', ix < i));
    };
    el.appendChild(s);
  }
}

function openRoomConfig(room){
  __rc_room = String(room);
  const d = state.lettiPerStanza[__rc_room] || {matrimoniale:false,singoli:0,culla:false};
  document.getElementById('roomConfigTitle').textContent = 'Stanza '+room;
  __rc_renderToggle(document.getElementById('rc_matrimoniale'), d.matrimoniale);
  __rc_renderSingoli(document.getElementById('rc_singoli'), d.singoli);
  __rc_renderToggle(document.getElementById('rc_culla'), d.culla);
  document.getElementById('roomConfigModal').hidden = false;
}

document.addEventListener('click', (e)=>{
  const b = e.target.closest && e.target.closest('[data-room]');
  if(b){ openRoomConfig(b.getAttribute('data-room')); }
});

document.getElementById('rc_save')?.addEventListener('click', ()=>{
  const matrimoniale = document.querySelector('#rc_matrimoniale .dot')?.classList.contains('on')||false;
  const culla = document.querySelector('#rc_culla .dot')?.classList.contains('on')||false;
  const singoli = document.querySelectorAll('#rc_singoli .dot.on').length;
  state.lettiPerStanza[__rc_room] = {matrimoniale, singoli, culla};
  document.getElementById('roomConfigModal').hidden = true;
});
// --- end room beds config ---


// --- FIX dDAE_1.057: renderSpese allineato al backend ---
function renderSpese(){
  const list = document.getElementById("speseList");
  if (!list) return;
  list.innerHTML = "";

  const items = Array.isArray(state.spese) ? state.spese : [];
  if (!items.length){
    list.innerHTML = '<div style="font-size:13px; opacity:.75; padding:8px 2px;">Nessuna spesa nel periodo.</div>';
    return;
  }

  items.forEach(s => {
    const el = document.createElement("div");
    el.className = "item";
    const importo = Number(s.importoLordo || 0);
    const iva = Number(s.iva || 0);
    el.innerHTML = `
      <div class="item-top">
        <div>
          <div class="item-title">${euro(importo)} <span style="opacity:.7; font-weight:800;">· IVA ${euro(iva)}</span></div>
          <div class="item-sub">
            <span class="badge">${categoriaLabel(s.categoria)}</span>
            <span class="mini">${s.dataSpesa || ""}</span>
            <span class="mini" style="opacity:.75;">${escapeHtml(s.motivazione || "")}</span>
          </div>
        </div>
        <button class="delbtn" type="button" data-del="${s.id}">Elimina</button>
      </div>
    `;
    const __btnDel = el.querySelector("[data-del]");

    if (__btnDel) __btnDel.addEventListener("click", async () => {
      if (!confirm("Eliminare questa spesa?")) return;
      await api("spese", { method:"DELETE", params:{ id: s.id } });
      toast("Eliminata");
      invalidateApiCache("spese|");
      invalidateApiCache("report|");
      await ensurePeriodData({ showLoader:false, force:true });
      renderSpese();
    });
    list.appendChild(el);
  });
}


// --- FIX dDAE_1.057: delete reale ospiti ---
function attachDeleteOspite(card, ospite){
  const btn = document.createElement("button");
  btn.className = "delbtn";
  btn.textContent = "Elimina";
  btn.addEventListener("click", async () => {
    if (!confirm("Eliminare definitivamente questo ospite?")) return;
    await api("ospiti", { method:"DELETE", params:{ id: ospite.id } });
    toast("Ospite eliminato");
    invalidateApiCache("ospiti|");
    invalidateApiCache("stanze|");
    await loadOspiti(state.period || {});
  });
  const actions = card.querySelector(".actions") || card;
  actions.appendChild(btn);
}


// Hook delete button into ospiti render
(function(){
  const orig = window.renderOspiti;
  if (!orig) return;
  window.renderOspiti = function(){
    orig();
    const cards = document.querySelectorAll(".guest-card");
    cards.forEach(card => {
      const id = card.getAttribute("data-id");
      const ospite = (state.ospiti||[]).find(o=>String(o.id)===String(id));
      if (ospite) attachDeleteOspite(card, ospite);
    });
  }
})();


// --- FIX dDAE_1.057: mostra nome ospite ---
(function(){
  const orig = window.renderOspiti;
  if (!orig) return;
  window.renderOspiti = function(){
    orig();
    document.querySelectorAll(".guest-card").forEach(card=>{
      const id = card.getAttribute("data-id");
      const ospite = (state.ospiti||[]).find(o=>String(o.id)===String(id));
      if(!ospite) return;
      if(card.querySelector(".guest-name")) return;
      const name = document.createElement("div");
      name.className = "guest-name";
      name.textContent = ospite.nome || ospite.name || "Ospite";
      name.style.fontWeight = "950";
      name.style.fontSize = "18px";
      name.style.marginBottom = "6px";
      card.prepend(name);
    });
  }
})();
