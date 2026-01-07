/* global API_BASE_URL, API_KEY */

/**
 * Build: incrementa questa stringa alla prossima modifica (es. 1.001)
 */
const BUILD_VERSION = "1.087";

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
  wrap.querySelectorAll(".pay-dot").forEach(b => {
    const v = (b.getAttribute("data-type") || "").toLowerCase();
    const on = v === t;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// dDAE_1.087 — error overlay: evita blocchi silenziosi su iPhone PWA
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
  period: { from: "", to: "" },
  periodPreset: "this_month",
  page: "home",
  guests: [],
  guestRooms: new Set(),
  guestDepositType: "contante",
  guestEditId: null,
  guestMode: "create",
  lettiPerStanza: {},
  guestMarriage: false,
  guestSaldoType: "contante",
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

  // Preset periodo (scroll iOS)
  bindPresetSelect("#periodPreset1");
  bindPresetSelect("#periodPreset2");
  bindPresetSelect("#periodPreset3");
  bindPresetSelect("#periodPreset4");
  setPresetValue(state.periodPreset || "this_month");
    try { await loadData({ showLoader:false }); renderGuestCards(); } catch (e) { toast(e.message); }
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


/* Launcher modal (popup) */

let launcherDelegationBound = false;
let homeDelegationBound = false;
function bindHomeDelegation(){
  if (homeDelegationBound) return;
  homeDelegationBound = true;
  document.addEventListener("click", (e)=>{
    const o = e.target.closest && e.target.closest("#goOspite");
    if (o){ hideLauncher(); showPage("ospite"); return; }
    const cal = e.target.closest && e.target.closest("#goCalendario");
    if (cal){ hideLauncher(); toast("Calendario: in arrivo"); return; }
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

/* NAV pages (5 pagine interne: home + 4 funzioni) */
function showPage(page){
  state.page = page;
  document.body.dataset.page = page;

  document.querySelectorAll(".page").forEach(s => s.hidden = true);
  const el = $(`#page-${page}`);
  if (el) el.hidden = false;

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
  if (page === "spese") renderSpese();
  if (page === "riepilogo") renderRiepilogo();
  if (page === "grafico") renderGrafico();
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

  // HOME: icona principale apre il launcher
  const openBtn = $("#openLauncher");
  if (openBtn){
    openBtn.addEventListener("click", () => showLauncher());
  }

  // HOME: icona Ospite va alla pagina ospite
  const goO = $("#goOspite");
  if (goO){
    goO.addEventListener("click", () => { enterGuestCreateMode(); showPage("ospite"); });
  }
  // HOME: icona Ospiti va alla pagina elenco ospiti
  const goOs = $("#goOspiti");
  if (goOs){
    goOs.addEventListener("click", () => showPage("ospiti"));
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

/* DATA LOAD */
async function loadMotivazioni(){
  const data = await api("motivazioni", { showLoader:false });
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

async function loadOspiti({ from="", to="" } = {}){
  const data = await api("ospiti", { params: { from, to } });
  state.guests = Array.isArray(data) ? data : [];
  renderGuestCards();
}

async function loadData({ showLoader=true } = {}){
  const { from, to } = state.period;
  const [report, spese] = await Promise.all([
    api("report", { params: { from, to }, showLoader }),
    api("spese", { params: { from, to }, showLoader }),
  ]);
  state.report = report;
  state.spese = spese;

  // refresh current page
  if (state.page === "spese") renderSpese();
  if (state.page === "riepilogo") renderRiepilogo();
  if (state.page === "grafico") renderGrafico();
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
  try { await loadData({ showLoader:false }); renderGuestCards(); } catch(_) {}
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
      await loadData({ showLoader:false }); renderGuestCards();
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

      try { await loadData({ showLoader:false }); renderGuestCards(); } catch (e) { toast(e.message); }
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




function enterGuestCreateMode(){
  state.guestMode = "create";
  state.guestEditId = null;
  // UI
  const title = document.getElementById("ospiteFormTitle");
  if (title) title.textContent = "Nuovo ospite";
  const btn = document.getElementById("createGuestCard");
  if (btn) btn.textContent = "Crea ospite";

  // reset fields
  const fields = ["guestName","guestAdults","guestKidsU10","guestCheckOut","guestTotal","guestBooking","guestDeposit"];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

  const ci = document.getElementById("guestCheckIn");
  if (ci) ci.value = todayISO();

  setMarriage(false);
state.guestRooms = state.guestRooms || new Set();
  state.guestRooms.clear();
  state.lettiPerStanza = {};
  // segmented: default contante
  state.guestDepositType = "contante";
  state.guestSaldoType = "contante";
  setPayType("saldoType", state.guestSaldoType);
  const seg = document.getElementById("depositType");
  if (seg){
    seg.querySelectorAll(".pay-dot").forEach(b=>{
      const t = b.getAttribute("data-type");
      const active = t === "contante";
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });

  const segSaldo = document.getElementById("saldoType");
  segSaldo?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pay-dot");
    if (!btn) return;
    const t = btn.getAttribute("data-type");
    state.guestSaldoType = t;
    setPayType("saldoType", t);
  });
  }

  // refresh rooms UI if present
  try {
    document.querySelectorAll("#roomsPicker .room-dot").forEach(btn => {
      btn.classList.remove("selected");
      btn.setAttribute("aria-pressed", "false");
    });
  } catch (_) {}
}

function enterGuestEditMode(ospite){
  state.guestMode = "edit";
  state.guestEditId = ospite?.id ?? null;

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


  // deposit type (se disponibile)
  const dt = ospite.acconto_tipo || ospite.depositType || "contante";
  state.guestDepositType = dt;
  setPayType("depositType", dt);

  const st = ospite.saldo_tipo || ospite.saldoTipo || "contante";
  state.guestSaldoType = st;
  setPayType("saldoType", st);

  const seg = document.getElementById("depositType");
  if (seg){
    seg.querySelectorAll(".pay-dot").forEach(b=>{
      const t = b.getAttribute("data-type");
      const active = t === dt;
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

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
    // Chiavi "canoniche" lato Google Sheet
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
    matrimonio,
    stanze: rooms.join(","),

    // Compatibilità: alcune versioni di Apps Script mappano questi campi (name/adults/...) invece delle chiavi sopra
    name,
    adults,
    kidsU10,
    checkIn,
    checkOut,
    total,
    booking,
    deposit,
    depositType
  };



  const isEdit = state.guestMode === "edit";
  if (isEdit){
    if (!state.guestEditId) return toast("ID ospite mancante");
    payload.id = state.guestEditId;
  }

  // CREATE vs UPDATE (backend GAS: POST=create, PUT=update)
  const method = isEdit ? "PUT" : "POST";
  const res = await api("ospiti", { method, body: payload });

  // stanze: backend gestisce POST e sovrascrive (deleteWhere + append)
  const ospiteId = isEdit ? state.guestEditId : (res?.id || payload.id);
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

  const seg = document.getElementById("depositType");
  seg?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pay-dot");
    if (!btn) return;
    const t = btn.getAttribute("data-type");
    state.guestDepositType = t;
    seg.querySelectorAll(".pay-dot").forEach(b=>{
      const active = b.getAttribute("data-type") === t;
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
  });

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

  const items = Array.isArray(state.ospiti) && state.ospiti.length
    ? state.ospiti
    : (Array.isArray(state.guests) ? state.guests : []);

  if (!items.length){
    wrap.innerHTML = '<div style="opacity:.7;font-size:14px;padding:8px;">Nessun ospite nel periodo.</div>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "guest-card";

    const nome = escapeHtml(item.nome || item.name || "Ospite");

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

    const roomsDotsHTML = roomsArr.length
      ? roomsArr.map(n => `<span class="room-dot-badge" aria-label="Stanza ${n}">${n}</span>`).join("")
      : `<span class="room-dot-badge is-empty" aria-label="Nessuna stanza">—</span>`;



    card.innerHTML = `
      <div class="guest-top">
        <div class="guest-left">
          <span class="guest-led ${led.cls}" aria-label="${led.label}" title="${led.label}"></span>
          <div class="guest-name">${nome}</div>
        </div>
        <div class="guest-actions" role="group" aria-label="Azioni ospite">
          <button class="tl-btn tl-green" type="button" data-open aria-label="Apri/chiudi dettagli"><span class="sr-only">Apri</span></button>
          <button class="tl-btn tl-yellow" type="button" data-edit aria-label="Modifica ospite"><span class="sr-only">Modifica</span></button>
          <button class="tl-btn tl-red" type="button" data-del aria-label="Elimina ospite"><span class="sr-only">Elimina</span></button>
        </div>
      </div>

      <div class="guest-details" hidden>
        <div class="guest-badges" style="display:flex; gap:8px; flex-wrap:wrap; margin: 2px 0 10px;">
<div class="rooms-dots" aria-label="Stanze prenotate">${roomsDotsHTML}</div>
        </div>
        <div class="detail-grid">
          <div><b>Check-in</b><br>${formatISODateLocal(item.check_in || item.checkIn || "") || "—"}</div>
          <div><b>Check-out</b><br>${formatISODateLocal(item.check_out || item.checkOut || "") || "—"}</div>
          <div><b>Adulti</b><br>${item.adulti ?? "—"}</div>
          <div><b>Bambini &lt;10</b><br>${item.bambini_u10 ?? "—"}</div>
          <div><b>Prenotazione</b><br>${euro(item.importo_prenotazione || 0)}</div>
          <div><b>Booking</b><br>${euro(item.importo_booking || 0)}</div>
          <div><b>Acconto</b><br><span class="guest-led mini-led ${depLedCls}" aria-hidden="true"></span> ${euro(item.acconto_importo || 0)}</div>
          <div><b>Saldo</b><br><span class="guest-led mini-led ${saldoLedCls}" aria-hidden="true"></span> ${euro(item.saldo_pagato ?? item.saldoPagato ?? item.saldo ?? 0)}</div>
        </div>
      </div>
    `;

    const btnOpen = card.querySelector("[data-open]");
    const details = card.querySelector(".guest-details");

    if (!btnOpen || !details){
      console.warn("dDAE guest card: elementi mancanti", { btnOpen: !!btnOpen, details: !!details });
      return;
    }

    btnOpen.addEventListener("click", ()=>{
      const willOpen = details.hidden;
      details.hidden = !willOpen;
      btnOpen.classList.toggle("is-open", willOpen);
      btnOpen.setAttribute("aria-pressed", willOpen ? "true" : "false");
    });

    card.querySelector("[data-edit]").addEventListener("click", ()=>{
      enterGuestEditMode(item);
      showPage("ospite");
    });

    const __btnDel = card.querySelector("[data-del]");


    if (__btnDel) __btnDel.addEventListener("click", async ()=>{
      if (!confirm("Eliminare definitivamente questo ospite?")) return;
      await api("ospiti", { method:"DELETE", params:{ id: item.id }});
      toast("Ospite eliminato");
      await loadData({ showLoader:false }); renderGuestCards();
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
  document.body.dataset.page = "home";
  setupHeader();
  setupHome();

    setupOspite();
  initFloatingLabels();
// default period = this month
  const [from,to] = monthRangeISO(new Date());
  setPeriod(from,to);

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


  // pre-carico dati (non cambia flusso API)
  try {
    await loadMotivazioni();
    await loadData({ showLoader:false }); renderGuestCards();
  } catch(e){
    toast(e.message);
  }

  // avvio: mostra la HOME
  showPage("home");
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
      await loadData({ showLoader:false }); renderGuestCards();
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
    await loadData({ showLoader:false }); renderGuestCards();
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
