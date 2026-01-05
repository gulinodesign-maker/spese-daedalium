const BUILD_VERSION = '1.039';

function goHome(){
  show('home');
}
function goPage(p){
  show('page-' + p);
}
function show(id){
  document.querySelectorAll('.page,#home').forEach(e=>e.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

document.getElementById('form-ospite').addEventListener('submit',e=>{
  e.preventDefault();
  alert('Ospite salvato (mock)');
  e.target.reset();
});
