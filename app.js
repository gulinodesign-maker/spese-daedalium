/* global API_BASE_URL, API_KEY */

const $ = (sel) => document.querySelector(sel);

const state = {
  motivazioni: [],
  spese: [],
  report: null,
};

function euro(n){
  const x = Number(n || 0);
  return x.toLocaleString("it-IT", { style:"currency", currency:"EUR" });
}

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function todayISO(){
  const d = new Date();
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
function yearRangeISO(date = new Date()){
  const y = date.getFullYear();
  return [`${y}-01-01`, `${y}-12-31`];
}
function toISO(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

async function api(action, { method="GET", params={}, body=null } = {}){
  if (!API_BASE_URL || API_BASE_URL.includes("INCOLLA_QUI")) {
    throw new Error("Config mancante: imposta API_BASE_URL in frontend/config.js");
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
    headers: { "Content-Type":"application/json" },
    body: body ? JSON.stringify(body) : null
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "API error");
  return json.data;
}

function setupTabs(){
  document.querySelectorAll(".pill").forEach(p => {
    p.addEventListener("click", () => {
      document.querySelectorAll(".pill").forEach(x => x.classList.remove("active"));
      p.classList.add("active");
      const tab = p.dataset.tab;
      document.querySelectorAll("section[id^='tab-']").forEach(s => s.style.display = "none");
      $(`#tab-${tab}`).style.display = "";
    });
  });
}

async function loadMotivazioni(){
  const data = await api("motivazioni");
  state.motivazioni = data;

  const sel = $("#spesaMotivazione");
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Seleziona…";
  sel.appendChild(opt0);

  data.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.motivazione;
    opt.textContent = m.motivazione;
    sel.appendChild(opt);
  });

  renderMotivazioniTable();
}

function renderMotivazioniTable(){
  const tbody = $("#motTable tbody");
  tbody.innerHTML = "";
  state.motivazioni.forEach(m => {
    const tr = document.createElement("tr");

    const td1 = document.createElement("td");
    td1.textContent = m.motivazione;

    const td2 = document.createElement("td");
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn";
    btnEdit.textContent = "Modifica";
    btnEdit.addEventListener("click", async () => {
      const nuovo = prompt("Nuova motivazione:", m.motivazione);
      if (!nuovo) return;
      await api("motivazioni", { method:"PUT", params:{ id: m.id }, body:{ motivazione: nuovo, attiva: true } });
      toast("Motivazione aggiornata");
      await loadMotivazioni();
    });

    const btnDel = document.createElement("button");
    btnDel.className = "btn warn";
    btnDel.style.marginLeft = "8px";
    btnDel.textContent = "Disattiva";
    btnDel.addEventListener("click", async () => {
      if (!confirm("Disattivare questa motivazione?")) return;
      await api("motivazioni", { method:"DELETE", params:{ id: m.id } });
      toast("Motivazione disattivata");
      await loadMotivazioni();
    });

    td2.appendChild(btnEdit);
    td2.appendChild(btnDel);

    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  });
}

async function addMotivazione(){
  const v = $("#newMotivazione").value.trim();
  if (!v) return toast("Inserisci una motivazione");
  await api("motivazioni", { method:"POST", body:{ motivazione: v } });
  $("#newMotivazione").value = "";
  toast("Motivazione aggiunta");
  await loadMotivazioni();
}

function resetSpesaForm(){
  $("#spesaData").value = todayISO();
  $("#spesaCategoria").value = "";
  $("#spesaImporto").value = "";
  $("#spesaMotivazione").value = "";
  $("#spesaNote").value = "";
}

async function saveSpesa(){
  const dataSpesa = $("#spesaData").value;
  const categoria = $("#spesaCategoria").value;
  const importoLordo = Number($("#spesaImporto").value);
  const motivazione = $("#spesaMotivazione").value;
  const note = $("#spesaNote").value;

  if (!dataSpesa) return toast("Data obbligatoria");
  if (!categoria) return toast("Categoria obbligatoria");
  if (!motivazione) return toast("Motivazione obbligatoria");
  if (!isFinite(importoLordo) || importoLordo <= 0) return toast("Importo non valido");

  await api("spese", { method:"POST", body:{ dataSpesa, categoria, motivazione, importoLordo, note } });
  toast("Spesa salvata");
  resetSpesaForm();
  await refreshAll();
}

function badgeCategoria(cat){
  const map = {
    CONTANTI: "Contanti",
    TASSA_SOGGIORNO: "Tassa soggiorno",
    IVA_22: "IVA 22%",
    IVA_10: "IVA 10%",
    IVA_4: "IVA 4%",
  };
  return map[cat] || cat;
}

function renderSpeseTable(){
  const tbody = $("#speseTable tbody");
  tbody.innerHTML = "";

  state.spese.forEach(s => {
    const tr = document.createElement("tr");

    const tdD = document.createElement("td");
    tdD.textContent = s.dataSpesa;

    const tdC = document.createElement("td");
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = badgeCategoria(s.categoria);
    tdC.appendChild(b);

    const tdM = document.createElement("td");
    tdM.textContent = s.motivazione;

    const tdL = document.createElement("td");
    tdL.textContent = euro(s.importoLordo);

    const tdI = document.createElement("td");
    tdI.textContent = euro(s.iva);

    const tdX = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn warn";
    btn.textContent = "Elimina";
    btn.addEventListener("click", async () => {
      if (!confirm("Eliminare questa spesa?")) return;
      await api("spese", { method:"DELETE", params:{ id: s.id } });
      toast("Spesa eliminata");
      await refreshAll();
    });
    tdX.appendChild(btn);

    tr.appendChild(tdD);
    tr.appendChild(tdC);
    tr.appendChild(tdM);
    tr.appendChild(tdL);
    tr.appendChild(tdI);
    tr.appendChild(tdX);

    tbody.appendChild(tr);
  });
}

function setRange(from, to){
  $("#fromDate").value = from;
  $("#toDate").value = to;
}

async function loadReportAndSpese(){
  const from = $("#fromDate").value;
  const to = $("#toDate").value;

  const [report, spese] = await Promise.all([
    api("report", { params: { from, to } }),
    api("spese", { params: { from, to } }),
  ]);

  state.report = report;
  state.spese = spese;

  renderKPI();
  renderByCat();
  renderSpeseTable();
  updateTopIvaCard();
}

function renderKPI(){
  const r = state.report;
  $("#kpiTotSpese").textContent = euro(r.totals.importoLordo);
  $("#kpiIvaDetraibile").textContent = euro(r.totals.ivaDetraibile);
  $("#kpiImponibile").textContent = euro(r.totals.imponibile);
  $("#kpiCount").textContent = String(r.totals.count);
  updateTopIvaCard();
}

function updateTopIvaCard(){
  const r = state.report;
  if (!r) return;
  const top = document.querySelector("#kpiIvaDetraibileTop");
  if (top) top.textContent = euro(r.totals.ivaDetraibile);

  const periodLabel = document.querySelector("#periodLabel");
  if (periodLabel){
    const f = document.querySelector("#fromDate")?.value || r.from || "";
    const t = document.querySelector("#toDate")?.value || r.to || "";
    periodLabel.textContent = (f && t) ? `${f} → ${t}` : "—";
  }
}

function renderByCat(){
  const container = $("#byCat");
  const by = state.report.byCategoria || {};
  const keys = Object.keys(by);

  if (!keys.length){
    container.innerHTML = `<div style="font-size:13px; opacity:.75;">Nessun dato nel periodo.</div>`;
    return;
  }

  const rows = keys.map(k => {
    const o = by[k];
    return `
      <div class="card" style="margin-bottom:10px;">
        <div class="bd">
          <div class="row" style="justify-content:space-between;">
            <div><span class="badge">${badgeCategoria(k)}</span> <span style="font-size:12px; opacity:.75;">(${o.count} voci)</span></div>
            <div style="font-weight:750;">${euro(o.importoLordo)}</div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:10px; font-size:12px;">
            <div>Imponibile: <b>${euro(o.imponibile)}</b></div>
            <div>IVA: <b>${euro(o.iva)}</b></div>
            <div>IVA detraibile: <b>${euro(o.ivaDetraibile)}</b></div>
            <div></div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = rows;
}

function exportCsv(){
  const cols = ["dataSpesa","categoria","motivazione","importoLordo","aliquotaIva","imponibile","iva","ivaDetraibile","note"];
  const lines = [cols.join(";")];
  for (const s of state.spese){
    const row = cols.map(c => {
      const v = (s[c] !== undefined && s[c] !== null) ? String(s[c]) : "";
      const safe = v.replaceAll('"','""');
      return `"${safe}"`;
    }).join(";");
    lines.push(row);
  }
  const blob = new Blob([lines.join("\n")], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "spese.csv";
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV esportato");
}

async function refreshAll(){
  await loadMotivazioni();
  await loadReportAndSpese();
}

async function init(){
  setupTabs();

  const [from, to] = monthRangeISO(new Date());
  setRange(from, to);

  $("#spesaData").value = todayISO();

  $("#btnRefresh").addEventListener("click", async () => {
    try { await loadReportAndSpese(); toast("Aggiornato"); } catch(e){ toast(e.message); }
  });

  $("#btnThisMonth").addEventListener("click", async () => {
    const [f,t] = monthRangeISO(new Date());
    setRange(f,t);
    try { await loadReportAndSpese(); toast("Periodo: questo mese"); } catch(e){ toast(e.message); }
  });

  $("#btnLastMonth").addEventListener("click", async () => {
    const d = new Date();
    d.setMonth(d.getMonth()-1);
    const [f,t] = monthRangeISO(d);
    setRange(f,t);
    try { await loadReportAndSpese(); toast("Periodo: mese scorso"); } catch(e){ toast(e.message); }
  });

  $("#btnThisYear").addEventListener("click", async () => {
    const [f,t] = yearRangeISO(new Date());
    setRange(f,t);
    try { await loadReportAndSpese(); toast("Periodo: anno corrente"); } catch(e){ toast(e.message); }
  });

  $("#btnExportCsv").addEventListener("click", exportCsv);

  $("#btnAddMotivazione").addEventListener("click", async () => {
    try { await addMotivazione(); } catch(e){ toast(e.message); }
  });

  $("#btnSaveSpesa").addEventListener("click", async () => {
    try { await saveSpesa(); } catch(e){ toast(e.message); }
  });

  $("#btnResetSpesa").addEventListener("click", resetSpesaForm);

  try {
    await refreshAll();
    toast("Pronto");
  } catch (e) {
    toast(e.message);
  }
}

init();
