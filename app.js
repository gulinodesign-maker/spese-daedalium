/* global API_BASE_URL, API_KEY */

/**
 * Build: incrementa questa stringa alla prossima modifica (es. 1.001)
 */
const BUILD_VERSION = "1.001";

const $ = (sel) => document.querySelector(sel);

const state = {
  motivazioni: [],
  spese: [],
  report: null,
  period: { from: "", to: "" },
  page: "home",
};

const COLORS = {
  CONTANTI: "#2b7cb4",          // azzurro
  TASSA_SOGGIORNO: "#d8bd97",   // beige
  IVA_22: "#c9772b",            // arancio
  IVA_10: "#7ac0db",            // azzurro chiaro
  IVA_4: "#1f2937",             // scuro
};

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
}

/* NAV pages (5 pagine interne: home + 4 funzioni) */
function showPage(page){
  state.page = page;

  document.querySelectorAll(".page").forEach(s => s.hidden = true);
  const el = $(`#page-${page}`);
  if (el) el.hidden = false;

  // Period chip: nascosto in HOME (per rispettare "nessun altro testo" sulla home)
  const chip = $("#periodChip");
  if (chip){
    if (page === "home") {
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
  if (hb) hb.addEventListener("click", () => showPage("home"));
}

function setupHome(){
  // stampa build
  const build = $("#buildText");
  if (build) build.textContent = `Build ${BUILD_VERSION}`;

  // icone -> aprono le pagine
  document.querySelectorAll("#page-home [data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.getAttribute("data-go");
      showPage(page);
    });
  });
}

/* PERIOD SYNC */
function setPeriod(from, to){
  state.period = { from, to };

  // sync inputs (3 copie)
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

  // aggiorna chip solo se non siamo in home
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
  $("#spesaData").value = todayISO(); // lascia oggi
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
  const exists = state.motivazioni.some(m => (m.motivazione || "").toLowerCase() === motivazione.toLowerCase());
  if (!exists) {
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
function setupPeriodButtons(){
  $("#btnApplyPeriodSpese").addEventListener("click", async () => {
    const from = $("#fromDate").value;
    const to = $("#toDate").value;
    if (!from || !to) return toast("Periodo non valido");
    setPeriod(from,to);
    await loadData();
  });

  $("#btnApplyPeriodRiep").addEventListener("click", async () => {
    const from = $("#fromDate2").value;
    const to = $("#toDate2").value;
    if (!from || !to) return toast("Periodo non valido");
    setPeriod(from,to);
    await loadData();
  });

  $("#btnApplyPeriodGraph").addEventListener("click", async () => {
    const from = $("#fromDate3").value;
    const to = $("#toDate3").value;
    if (!from || !to) return toast("Periodo non valido");
    setPeriod(from,to);
    await loadData();
  });
}

async function init(){
  setupHeader();
  setupHome();

  // default period = this month
  const [from,to] = monthRangeISO(new Date());
  setPeriod(from,to);

  $("#spesaData").value = todayISO();

  $("#btnSaveSpesa").addEventListener("click", async () => {
    try { await saveSpesa(); } catch(e){ toast(e.message); }
  });

  setupPeriodButtons();

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
