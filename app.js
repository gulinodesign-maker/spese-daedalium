/* global API_BASE_URL, API_KEY */

/**
 * Build: incrementa questa stringa alla prossima modifica (es. 1.001)
 */
const BUILD_VERSION = "1.031";

const $ = (sel) => document.querySelector(sel);

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
  delayMs: 180,      // opzionale: evita flicker se rapidissimo
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

function toISO(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
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
  setPresetValue(state.periodPreset || "this_month");
    try { await loadData(); } catch (e) { toast(e.message); }
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

async function api(action, { method="GET", params={}, body=null } = {}){
  beginRequest();
  try {
  if (!API_BASE_URL || API_BASE_URL.includes("INCOLLA_QUI")) {
    throw new Error("Config mancante: imposta API_BASE_URL in config.js");
  }

  const url = new URL(API_BASE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("apiKey", API_KEY);

  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).length) url.searchParams.set(k, v);
  });

  let realMethod = method;
  if (method === "PUT" || method === "DELETE") {
    url.searchParams.set("_method", method);
    realMethod = "POST";
  }

  const res = await fetch(url.toString(), {
    method: realMethod,
    headers: { "Content-Type":"text/plain;charset=utf-8" },
    body: body ? JSON.stringify(body) : null
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "API error");
  return json.data;
  } finally {
    endRequest();
  }
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
    if (page === "home" || page === "ospite") {
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
  if (build) build.textContent = `Build ${BUILD_VERSION}`;

  // HOME: icona principale apre il launcher
  const openBtn = $("#openLauncher");
  if (openBtn){
    openBtn.addEventListener("click", () => showLauncher());
  }

  // HOME: icona Ospite va alla pagina ospite
  const goO = $("#goOspite");
  if (goO){
    goO.addEventListener("click", () => showPage("ospite"));
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
  const data = await api("motivazioni");
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

async function loadData(){
  const { from, to } = state.period;
  const [report, spese] = await Promise.all([
    api("report", { params: { from, to } }),
    api("spese", { params: { from, to } }),
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
      await api("motivazioni", { method:"POST", body:{ motivazione } });
      await loadMotivazioni();
    } catch (_) {}
  }

  await api("spese", { method:"POST", body:{ dataSpesa, categoria, motivazione, importoLordo, note: "" } });

  toast("Salvato");
  resetInserisci();

  // aggiorna dati
  try { await loadData(); } catch(_) {}
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

    el.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm("Eliminare questa spesa?")) return;
      await api("spese", { method:"DELETE", params:{ id: s.id } });
      toast("Eliminata");
      await loadData();
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

      try { await loadData(); } catch (e) { toast(e.message); }
    }, 220);
  };

  fromEl.addEventListener("change", schedule);
  toEl.addEventListener("change", schedule);
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
  }

  roomsWrap?.addEventListener("click", (e) => {
    const b = e.target.closest(".room-dot");
    if (!b) return;
    const n = parseInt(b.getAttribute("data-room"), 10);
    if (state.guestRooms.has(n)) state.guestRooms.delete(n);
    else state.guestRooms.add(n);
    renderRooms();
  });

  const seg = document.getElementById("depositType");
  seg?.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    const t = btn.getAttribute("data-type");
    state.guestDepositType = t;
    seg.querySelectorAll(".seg-btn").forEach(b=>{
      const active = b.getAttribute("data-type") === t;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
  });

  const btnCreate = document.getElementById("createGuestCard");
  btnCreate?.addEventListener("click", () => {
    const name = (document.getElementById("guestName")?.value || "").trim();
    const adults = parseInt(document.getElementById("guestAdults")?.value || "0", 10) || 0;
    const kidsU10 = parseInt(document.getElementById("guestKidsU10")?.value || "0", 10) || 0;
    const checkIn = document.getElementById("guestCheckIn")?.value || "";
    const checkOut = document.getElementById("guestCheckOut")?.value || "";
    const total = parseFloat(document.getElementById("guestTotal")?.value || "0") || 0;
    const booking = parseFloat(document.getElementById("guestBooking")?.value || "0") || 0;
    const deposit = parseFloat(document.getElementById("guestDeposit")?.value || "0") || 0;
    const rooms = Array.from(state.guestRooms).sort((a,b)=>a-b);
    const depositType = state.guestDepositType || "contante";

    // UI only validation (soft)
    if (!name){
      toast("Inserisci il nome");
      return;
    }

    const item = {
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      name, adults, kidsU10, checkIn, checkOut,
      rooms,
      total, booking, deposit,
      depositType
    };
    state.guests.unshift(item);
    renderGuestCards();
    toast("Scheda creata (demo)");

    // reset fields (keep dates if user wants; we'll keep check-in today if empty)
    document.getElementById("guestName").value = "";
    document.getElementById("guestAdults").value = "";
    document.getElementById("guestKidsU10").value = "";
    document.getElementById("guestTotal").value = "";
    document.getElementById("guestBooking").value = "";
    document.getElementById("guestDeposit").value = "";
    state.guestRooms.clear();
    renderRooms();
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
  wrap.innerHTML = "";
  state.guests.forEach(item => {
    const rooms = (item.rooms || []).join("/") || "—";
    const badgeClass = item.depositType === "elettronico" ? "blue" : "orange";
    const badgeLabel = item.depositType === "elettronico" ? "Elettronico" : "Contante";

    const card = document.createElement("div");
    card.className = "guest-card";
    card.dataset.id = item.id;

    card.innerHTML = `
      <div class="top">
        <div>
          <div class="name">${escapeHtml(item.name)}</div>
          <div class="meta">
            <span>Check-in: <b>${escapeHtml(item.checkIn || "—")}</b></span>
            <span>Check-out: <b>${escapeHtml(item.checkOut || "—")}</b></span>
            <span>Stanze: <b>${escapeHtml(rooms)}</b></span>
            <span>Adulti: <b>${escapeHtml(item.adults ?? 0)}</b></span>
            <span>Bambini<10: <b>${escapeHtml(item.kidsU10 ?? 0)}</b></span>
          </div>
        </div>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>

      <div class="actions">
        <button class="btn ghost" type="button" data-open="1">Apri</button>
        <button class="btn danger" type="button" data-del="1">Elimina</button>
      </div>

      <details>
        <summary>Dettagli</summary>
        <div class="detail-grid">
          <div><div class="k">Prenotazione</div><div>${euro(item.total)}</div></div>
          <div><div class="k">Booking</div><div>${euro(item.booking)}</div></div>
          <div><div class="k">Acconto</div><div>${euro(item.deposit)}</div></div>
          <div><div class="k">Adulti</div><div>${escapeHtml(item.adults ?? 0)}</div></div>
          <div><div class="k">Bambini<10</div><div>${escapeHtml(item.kidsU10 ?? 0)}</div></div>
          <div><div class="k">Tipo</div><div>${badgeLabel}</div></div>
        </div>
      </details>
    `;

    // buttons
    card.querySelector('[data-open="1"]')?.addEventListener("click", () => {
      const d = card.querySelector("details");
      if (d) d.open = !d.open;
    });
    card.querySelector('[data-del="1"]')?.addEventListener("click", () => {
      state.guests = state.guests.filter(x => x.id !== item.id);
      renderGuestCards();
      toast("Eliminata");
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
  setPresetValue(state.periodPreset || "this_month");

  // Periodo automatico (niente tasto Applica)
  bindPeriodAuto("#fromDate", "#toDate");
  bindPeriodAuto("#fromDate2", "#toDate2");
  bindPeriodAuto("#fromDate3", "#toDate3");

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
    await loadData();
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
    const reg = await navigator.serviceWorker.register(`./service-worker.js?v=${BUILD_VERSION}`);
    // prova subito un update (utile su iOS)
    if (reg && reg.update) reg.update();
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

