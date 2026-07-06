
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js';

const items = window.CATALOGO_MT || [];
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const gender = document.getElementById('gender');
const category = document.getElementById('category');
const sort = document.getElementById('sort');

document.getElementById('totalItems').textContent = items.length;
document.getElementById('totalCats').textContent = new Set(items.map(i=>i.categoria)).size;
document.getElementById('totalFem').textContent = items.filter(i=>i.genero==='FEMININO').length;
document.getElementById('totalMasc').textContent = items.filter(i=>i.genero==='MASCULINO').length;

function fillSelect(el, values){ values.sort().forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; el.appendChild(o); }); }
fillSelect(gender, [...new Set(items.map(i=>i.genero).filter(Boolean))]);
fillSelect(category, [...new Set(items.map(i=>i.categoria).filter(Boolean))]);

function copy(text){ navigator.clipboard?.writeText(text); }
function render(){
  const q = search.value.trim().toLowerCase();
  let list = items.filter(i => (!gender.value || i.genero===gender.value) && (!category.value || i.categoria===category.value));
  if(q){ list = list.filter(i => [i.nome,i.genero,i.categoria,i.ydd,i.ytd,i.pasta_original].join(' ').toLowerCase().includes(q)); }
  if(sort.value==='category') list.sort((a,b)=>(a.categoria+a.nome).localeCompare(b.categoria+b.nome));
  else if(sort.value==='gender') list.sort((a,b)=>(a.genero+a.categoria+a.nome).localeCompare(b.genero+b.categoria+b.nome));
  else list.sort((a,b)=>a.nome.localeCompare(b.nome, 'pt-BR', {numeric:true}));
  grid.innerHTML = list.map(i=>`
    <article class="card">
      <div class="thumb"><img loading="lazy" src="${i.preview || ''}" alt="${i.nome}"></div>
      <div class="body">
        <div class="meta"><span class="tag">${i.genero}</span><span class="tag">${i.categoria}</span></div>
        <h3>${i.nome}</h3>
        <div class="file" title="${i.ydd}">YDD: ${i.ydd || '—'}</div>
        <div class="file" title="${i.ytd}">YTD: ${i.ytd || '—'}</div>
        <div class="actions">
          <button class="btn" data-view="${i.obj || ''}" data-title="${i.nome} • ${i.categoria}">Ver 3D</button>
          <button class="btn secondary" data-copy="${i.nome} | ${i.genero} | ${i.categoria} | ${i.ydd}">Copiar código</button>
        </div>
      </div>
    </article>`).join('');
  empty.style.display = list.length ? 'none' : 'block';
}
[search, gender, category, sort].forEach(el => el.addEventListener('input', render));
grid.addEventListener('click', e=>{
  const copyBtn=e.target.closest('[data-copy]'); if(copyBtn){ copy(copyBtn.dataset.copy); copyBtn.textContent='Copiado!'; setTimeout(()=>copyBtn.textContent='Copiar código',900); }
  const viewBtn=e.target.closest('[data-view]'); if(viewBtn){ openViewer(viewBtn.dataset.view, viewBtn.dataset.title); }
});
render();

const modal=document.getElementById('modal'), close=document.getElementById('closeModal');
close.onclick=()=>modal.classList.remove('open'); modal.addEventListener('click',e=>{if(e.target===modal) modal.classList.remove('open')});
let renderer, scene, camera, controls, currentObj;
function initViewer(){
  const canvas=document.getElementById('viewer3d');
  renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(45,1,.01,1000); camera.position.set(0,1.2,4);
  controls=new OrbitControls(camera, canvas); controls.enableDamping=true;
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const light=new THREE.DirectionalLight(0xffffff,1.8); light.position.set(3,4,5); scene.add(light);
  window.addEventListener('resize', resizeViewer);
  animate();
}
function resizeViewer(){
  if(!renderer) return; const box=document.querySelector('.viewer').getBoundingClientRect();
  renderer.setSize(box.width, box.height, false); camera.aspect=box.width/box.height; camera.updateProjectionMatrix();
}
function animate(){ requestAnimationFrame(animate); controls?.update(); renderer?.render(scene,camera); }
function openViewer(path,title){
  document.getElementById('modalTitle').textContent=title || 'Visualização 3D'; modal.classList.add('open');
  if(!renderer) initViewer(); resizeViewer();
  if(currentObj){ scene.remove(currentObj); currentObj=null; }
  if(!path) return;
  const loader=new OBJLoader();
  loader.load(path, obj=>{
    currentObj=obj;
    obj.traverse(c=>{ if(c.isMesh){ c.material=new THREE.MeshStandardMaterial({color:0xf2eef8, roughness:.65, metalness:.05}); }});
    const box=new THREE.Box3().setFromObject(obj); const center=box.getCenter(new THREE.Vector3()); const size=box.getSize(new THREE.Vector3()).length();
    obj.position.sub(center); const scale=size ? 2.4/size : 1; obj.scale.setScalar(scale);
    scene.add(obj);
  }, undefined, err=>{ console.error(err); });
}
