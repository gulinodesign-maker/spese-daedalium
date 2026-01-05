
const API_KEY = "daedalium2026";
const API_URL = CONFIG.API_URL;
const BUILD_VERSION = "1.053";

async function apiGet(action){
  const r = await fetch(`${API_URL}?action=${action}&apiKey=${API_KEY}`);
  return r.json();
}

async function apiPost(action, body){
  const r = await fetch(`${API_URL}?action=${action}&apiKey=${API_KEY}`,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  return r.json();
}

function euro(v){
  return Number(v||0).toFixed(2).replace(".",",");
}

/* ================= SPESE ================= */

async function salvaSpesa(){
  const body = {
    dataSpesa: document.getElementById("spesaData").value,
    categoria: document.getElementById("spesaCategoria").value,
    motivazione: document.getElementById("spesaMotivazione").value,
    importoLordo: Number(document.getElementById("spesaImporto").value),
    aliquotaIva: 0,
    imponibile: Number(document.getElementById("spesaImporto").value),
    iva: 0,
    ivaDetraibile: 0,
    note: ""
  };
  const r = await apiPost("spese", body);
  if(r.ok) caricaSpese();
  else alert("Errore salvataggio spesa");
}

async function caricaSpese(){
  const r = await apiGet("spese");
  if(!r.ok) return;

  const ul = document.getElementById("listaSpese");
  if(!ul) return;
  ul.innerHTML = "";

  r.data
    .filter(s => s.isDeleted !== true && s.isDeleted !== "TRUE")
    .forEach(s=>{
      const li = document.createElement("li");
      li.innerHTML = `
        <div><strong>${s.motivazione}</strong></div>
        <div>${s.dataSpesa} · ${s.categoria}</div>
        <div>€ ${euro(s.importoLordo)}</div>
      `;
      ul.appendChild(li);
    });
}

/* ============== NAV ================= */

function show(id){
  document.querySelectorAll("section").forEach(s=>s.style.display="none");
  const el = document.getElementById(id);
  if(el) el.style.display="block";
}

document.addEventListener("click",e=>{
  const b = e.target.closest("[data-go]");
  if(!b) return;
  show(b.dataset.go);
});

document.addEventListener("DOMContentLoaded",()=>{
  show("home");
  caricaSpese();
});


/* ==== DEFINITIVE NAVIGATION FIX ==== */
const NAV_MAP = {
  home: "home",
  ospiti: "ospiti",
  spese: "spese",
  motivazioni: "motivazioni"
};

function showSection(id){
  document.querySelectorAll("section").forEach(s=>{
    s.hidden = true;
    s.style.display = "none";
  });
  const el = document.getElementById(id);
  if(el){
    el.hidden = false;
    el.style.display = "block";
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  showSection("home");
});

document.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-go]");
  if(!btn) return;
  const key = btn.getAttribute("data-go");
  if(NAV_MAP[key]) showSection(NAV_MAP[key]);
});
/* ==== END NAV ==== */
