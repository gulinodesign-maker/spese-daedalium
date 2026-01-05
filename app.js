
const API_KEY = "daedalium2026";
const API_URL = CONFIG.API_URL;
const BUILD_VERSION = "1.055";

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




function hideAll(){
  document.querySelectorAll("section").forEach(s=>{
    s.style.display="none";
    s.hidden=true;
  });
}
function show(id){
  hideAll();
  const el=document.getElementById(id);
  if(el){
    el.style.display="block";
    el.hidden=false;
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  show("home");

});


// ===== SINGLE NAVIGATION SYSTEM =====
function showPage(id){
  document.querySelectorAll("section").forEach(s=>{
    s.style.display="none";
    s.hidden=true;
  });
  const el=document.getElementById(id);
  if(el){
    el.style.display="block";
    el.hidden=false;
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  showPage("page-home");
});

document.addEventListener("click",(e)=>{
  const btn=e.target.closest("[data-page]");
  if(!btn) return;
  showPage(btn.getAttribute("data-page"));
});
// ===== END NAV =====
