
const API_KEY = "daedalium2026";
const API_URL = CONFIG.API_URL;

async function api(action) {
  const res = await fetch(`${API_URL}?action=${action}&apiKey=${API_KEY}`);
  return res.json();
}

function euro(n){
  return Number(n||0).toFixed(2).replace('.',',');
}

async function caricaSpese(){
  const r = await api("spese");
  if(!r.ok) return;

  const list = document.getElementById("listaSpese");
  if(!list) return;
  list.innerHTML = "";

  r.data
    .filter(s => s.isDeleted !== true && s.isDeleted !== "TRUE")
    .forEach(s => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div><strong>${s.motivazione}</strong></div>
        <div>${s.dataSpesa} · ${s.categoria}</div>
        <div>€ ${euro(s.importoLordo)}</div>
      `;
      list.appendChild(li);
    });
}

document.addEventListener("DOMContentLoaded", caricaSpese);


// === HOME ICONS NAVIGATION FIX ===
document.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-go]");
  if(!btn) return;
  const target = btn.getAttribute("data-go");
  document.querySelectorAll("section").forEach(s=>s.hidden=true);
  const page = document.getElementById(target);
  if(page) page.hidden=false;
});
// === END FIX ===


// === ROBUST NAVIGATION RESTORE ===
function showPage(id){
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

document.addEventListener("click", (e)=>{
  const t = e.target.closest("[data-go], [id^='go']");
  if(!t) return;

  let target = t.getAttribute("data-go");
  if(!target && t.id && t.id.startsWith("go")){
    target = t.id.replace(/^go/, "").toLowerCase();
  }
  if(!target) return;

  showPage(target);
});
// Ensure home visible on load
document.addEventListener("DOMContentLoaded", ()=>{
  if(document.getElementById("home")) showPage("home");
});
// === END NAVIGATION ===
