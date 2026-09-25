import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const LINKS_MT = {
  discord: 'https://discord.gg/MAPubH3vRw',
  instagram: 'https://www.instagram.com/mt_studiocriativo/',
  tiktok: 'https://www.tiktok.com/@mt_studiocriativo?_r=1&_t=ZS-95TIQCHu8N5'
};

const DEFAULT_VIEWER = { color: 0xd4d4d6, brightness: 1 };

const COLORS = [
  ['Branco', 0xd4d4d6], ['Preto', 0x111111], ['Cinza', 0x777777],
  ['Roxo', 0x6f35d6], ['Azul', 0x336dff], ['Verde', 0x2dbd63],
  ['Vermelho', 0xe53935], ['Marrom', 0x9a5a24], ['Amarelo', 0xffb832],
  ['Dourado', 0x9a6425], ['Lilás', 0xb13cff], ['Branco gelo', 0xf2f2f2]
];

const catalogo = Array.isArray(window.CATALOGO_MT) ? window.CATALOGO_MT : [];
const projetos = Array.isArray(window.PROJETOS_MT) ? window.PROJETOS_MT : [];

const $ = (id) => document.getElementById(id);

const IMAGE_FALLBACK_BASE = 'https://raw.githubusercontent.com/0ladymt/mt-studio-catalogo/desenvolvimento-loja-mt/';
function recoverImage(image, localPath){
  if(!image || !localPath || image.dataset.mtFallbackBound === '1') return;
  image.dataset.mtFallbackBound = '1';
  image.addEventListener('error', () => {
    if(image.dataset.remoteFallback === '1'){
      image.classList.add('mt-image-missing');
      image.removeAttribute('src');
      return;
    }
    const current = image.getAttribute('src') || '';
    image.dataset.remoteFallback = '1';
    image.src = IMAGE_FALLBACK_BASE + current.replace(/^\/+/, '');
  });
}

const grid = $('grid');
const empty = $('empty');
const search = $('search');
const gender = $('gender');
const category = $('category');

function fixPath(path){
  return String(path || '').replaceAll('\\', '/').replace(/^\.?\//, '').split('/').map(encodeURIComponent).join('/');
}

function setupLinks(){
  $('discordTop').href = LINKS_MT.discord;
  $('aboutDiscord').href = LINKS_MT.discord;
  $('footerDiscord').href = LINKS_MT.discord;
  $('socialDiscord').href = LINKS_MT.discord;
  $('socialInstagram').href = LINKS_MT.instagram;
  $('socialTikTok').href = LINKS_MT.tiktok;
}

function setupPages(){
  document.querySelectorAll('.nav-tab').forEach(btn => btn.addEventListener('click', () => openPage(btn.dataset.page)));
  document.querySelectorAll('[data-page-link]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      openPage(link.dataset.pageLink);
    });
  });
}

function openPage(page){
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(`page-${page}`)?.classList.add('active');
  history.replaceState(null, '', `#${page}`);
  window.scrollTo({top:0,behavior:'instant'});
}

function unique(arr){
  return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

function fillFilters(){
  unique(catalogo.map(i => i.genero)).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    gender.appendChild(opt);
  });
  unique(catalogo.map(i => i.categoria)).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    category.appendChild(opt);
  });
}

function updateStats(){
  $('statTotal').textContent = catalogo.length;
  $('statCategorias').textContent = unique(catalogo.map(i => i.categoria)).length;
  $('statFeminino').textContent = catalogo.filter(i => i.genero === 'FEMININO').length;
  $('statMasculino').textContent = catalogo.filter(i => i.genero === 'MASCULINO').length;
}

function renderProjects(){
  const box = $('projectsGrid');
  box.innerHTML = '';

  if(!projetos.length){
    box.innerHTML = `<article class="project-card"><div><h3>Nenhum projeto cadastrado ainda</h3><p>Crie pastas dentro de assets/projetos e rode python gerar_projetos.py.</p></div></article>`;
    return;
  }

  projetos.forEach((p, index) => {
    const fotos = Array.isArray(p.fotos) ? p.fotos : (p.imagem ? [p.imagem] : []);
    const capa = fixPath(p.capa || fotos[0] || '');
    const card = document.createElement('article');
    card.className = 'project-card';
    card.innerHTML = `
      <img src="${capa}" alt="${p.titulo || 'Projeto'}" loading="lazy">
      <div>
        <h3>${p.titulo || 'Projeto MT Studio'}</h3>
        <p>${fotos.length} foto${fotos.length === 1 ? '' : 's'} • projeto produzido pela MT Studio.</p>
      </div>
    `;
    recoverImage(card.querySelector('img'), capa);
    card.addEventListener('click', () => openProject(index));
    box.appendChild(card);
  });
}


function setProjectImage(src){
  const img = $('projectMainImage');
  const loading = $('projectImageLoading');
  if(loading){
    loading.textContent = 'Carregando imagem...';
    loading.classList.remove('hidden');
  }
  img.onload = () => loading?.classList.add('hidden');
  img.onerror = () => {
    if(loading) loading.textContent = 'Não foi possível carregar esta imagem.';
  };
  recoverImage(img, src);
  delete img.dataset.remoteFallback;
  img.src = src;
}

function openProject(index){
  const p = projetos[index];
  const fotos = (Array.isArray(p.fotos) ? p.fotos : (p.imagem ? [p.imagem] : [])).map(fixPath);
  if(!fotos.length) return;
  $('projectTitle').textContent = p.titulo || 'Projeto MT Studio';
  $('projectDescription').textContent = p.descricao || 'Projeto produzido pela MT Studio.';
  setProjectImage(fotos[0]);

  const thumbs = $('projectThumbs');
  thumbs.innerHTML = '';
  fotos.forEach((foto, i) => {
    const btn = document.createElement('button');
    btn.className = 'project-thumb' + (i === 0 ? ' active' : '');
    btn.type = 'button';
    btn.innerHTML = `<img src="${foto}" alt="">`;
    recoverImage(btn.querySelector('img'), foto);
    btn.addEventListener('click', () => {
      setProjectImage(foto);
      document.querySelectorAll('.project-thumb').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
    });
    thumbs.appendChild(btn);
  });

  $('projectModal').classList.add('open');
  $('projectModal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeProject(){
  $('projectModal').classList.remove('open');
  $('projectModal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  $('projectMainImage').src = '';
}

$('closeProjectModal').addEventListener('click', closeProject);
$('projectModal').addEventListener('click', e => {
  if(e.target.id === 'projectModal') closeProject();
});

function itemMatches(item){
  const q = search.value.trim().toLowerCase();
  const g = gender.value;
  const c = category.value;
  const hay = [item.id,item.nome,item.genero,item.categoria,item.ydd,item.ytd,item.pasta_original].join(' ').toLowerCase();
  return (!q || hay.includes(q)) && (!g || item.genero === g) && (!c || item.categoria === c);
}

function renderGrid(){
  const items = catalogo.filter(itemMatches);
  grid.innerHTML = '';
  empty.style.display = items.length ? 'none' : 'block';

  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <img class="thumb" src="${fixPath(item.preview)}" alt="${item.nome}" loading="lazy">
      <div class="card-body">
        <div class="tags"><span class="tag">${item.genero || '-'}</span><span class="tag">${item.categoria || '-'}</span></div>
        <h3>${item.nome || item.id}</h3>
        <div class="meta"><div>YDD: ${item.ydd || '-'}</div><div>YTD: ${item.ytd || '-'}</div></div>
        <div class="actions"><button class="btn-3d" type="button">Ver 3D</button><button class="btn-copy" type="button">Copiar código</button></div>
      </div>
    `;
    card.querySelector('.btn-3d').addEventListener('click', () => openViewer(item));
    card.querySelector('.btn-copy').addEventListener('click', async () => {
      const code = `${item.nome} | ${item.genero} | ${item.categoria} | ${item.ydd}`;
      await navigator.clipboard.writeText(code);
      card.querySelector('.btn-copy').textContent = 'Copiado!';
      setTimeout(() => card.querySelector('.btn-copy').textContent = 'Copiar código', 1200);
    });
    grid.appendChild(card);
  });
}

search.addEventListener('input', renderGrid);
gender.addEventListener('change', renderGrid);
category.addEventListener('change', renderGrid);

let scene, camera, renderer, controls, currentMaterial;
let animationId;
let keyLight, fillLight, topLight, rimLight;

function disposeViewer(){
  if(animationId) cancelAnimationFrame(animationId);
  animationId = null;
  if(renderer) renderer.dispose();
  scene = camera = renderer = controls = currentMaterial = null;
}

function setupPalette(){
  const palette = $('colorPalette');
  palette.innerHTML = '';
  COLORS.forEach(([name, color]) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.type = 'button';
    dot.title = name;
    dot.style.background = `#${color.toString(16).padStart(6,'0')}`;
    dot.dataset.color = color;
    dot.addEventListener('click', () => {
      setModelColor(Number(dot.dataset.color));
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
    palette.appendChild(dot);
  });
  palette.querySelector('.color-dot')?.classList.add('active');
}

function setModelColor(color){
  if(!currentMaterial) return;
  currentMaterial.color.setHex(color);
  currentMaterial.needsUpdate = true;
}

function setBrightness(value){
  const b = Number(value);
  if(keyLight) keyLight.intensity = 2.15 * b;
  if(fillLight) fillLight.intensity = 1.05 * b;
  if(topLight) topLight.intensity = 0.9 * b;
  if(rimLight) rimLight.intensity = 0.7 * b;
}

function resetViewerSettings(){
  $('brightnessRange').value = DEFAULT_VIEWER.brightness;
  setModelColor(DEFAULT_VIEWER.color);
  setBrightness(DEFAULT_VIEWER.brightness);
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  document.querySelector('.color-dot')?.classList.add('active');
}

function openViewer(item){
  $('modalTitle').textContent = `${item.nome || item.id}`;
  $('modalSubtitle').textContent = `${item.genero || ''}, ${item.categoria || ''}`;
  $('modal').classList.add('open');
  $('modal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setupPalette();
  requestAnimationFrame(() => initViewer(item));
}

$('closeModal').addEventListener('click', closeViewer);
$('modal').addEventListener('click', e => {
  if(e.target.id === 'modal') closeViewer();
});
$('brightnessRange').addEventListener('input', e => setBrightness(e.target.value));
$('resetViewer').addEventListener('click', resetViewerSettings);

function closeViewer(){
  $('modal').classList.remove('open');
  $('modal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  disposeViewer();
}

function initViewer(item){
  disposeViewer();
  const canvas = $('viewer3d');
  const wrap = canvas.parentElement;
  const width = Math.max(wrap.clientWidth, 720);
  const height = Math.max(wrap.clientHeight, 560);
  $('viewerLoading').textContent = 'Carregando modelo 3D...';
  $('viewerLoading').classList.remove('hidden');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x21002d);
  camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 1000);
  camera.position.set(0, 0.65, 4.2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
  renderer.setClearColor(0x21002d, 1);
  renderer.setSize(width, height, true);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.dampingFactor = 0.0;
  controls.rotateSpeed = 1.55;
  controls.zoomSpeed = 0.95;
  controls.panSpeed = 0.45;
  controls.enablePan = true;
  controls.minDistance = 0.45;
  controls.maxDistance = 9;

  keyLight = new THREE.DirectionalLight(0xffffff, 2.15);
  keyLight.position.set(2.5, 3.4, 4.2);
  scene.add(keyLight);
  fillLight = new THREE.DirectionalLight(0xffffff, 1.05);
  fillLight.position.set(-3, 1.5, 2.5);
  scene.add(fillLight);
  topLight = new THREE.DirectionalLight(0xffffff, 0.9);
  topLight.position.set(0, 4.8, 1.2);
  scene.add(topLight);
  rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
  rimLight.position.set(0, 2.2, -4);
  scene.add(rimLight);
  scene.add(new THREE.AmbientLight(0xffffff, 1.25));

  currentMaterial = new THREE.MeshStandardMaterial({ color:DEFAULT_VIEWER.color, roughness:0.76, metalness:0.02 });

  const objUrl = fixPath(item.obj);
  if(!objUrl){
    $('viewerLoading').textContent = 'Este item não possui OBJ cadastrado.';
    return;
  }

  const loader = new OBJLoader();
  loader.load(objUrl, obj => {
    obj.traverse(child => {
      if(child.isMesh){
        try {
          child.geometry = BufferGeometryUtils.mergeVertices(child.geometry, 0.001);
          child.geometry.computeVertexNormals();
        } catch(e) {
          child.geometry.computeVertexNormals();
        }
        child.material = currentMaterial;
        child.frustumCulled = true;
      }
    });
    centerAndFit(obj);
    scene.add(obj);
    resetViewerSettings();
    $('viewerLoading').classList.add('hidden');
  }, undefined, err => {
    console.error('Erro ao carregar OBJ:', err, objUrl);
    $('viewerLoading').textContent = 'Não foi possível carregar o modelo 3D.';
  });

  function animate(){
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  window.addEventListener('resize', resizeViewer, { passive:true });
}

function centerAndFit(obj){
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  obj.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  obj.scale.setScalar(2.45 / maxDim);

  const box2 = new THREE.Box3().setFromObject(obj);
  const center2 = new THREE.Vector3();
  box2.getCenter(center2);
  controls.target.copy(center2);
  camera.position.set(0, 0.65, 4.2);
  camera.lookAt(center2);
  controls.update();
}

function resizeViewer(){
  if(!renderer || !camera) return;
  const canvas = $('viewer3d');
  const wrap = canvas.parentElement;
  const width = Math.max(wrap.clientWidth, 320);
  const height = Math.max(wrap.clientHeight, 420);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, true);
}


/* Carrossel 3D: três modelos OBJ reais em rotação; miniaturas apenas como fallback. */
const mtCarousels = [];
function mountModelCarousel(trackId, wrapId, start=0) {
  const track = $(trackId), wrap = $(wrapId);
  if (!track || !wrap || !catalogo.length) return;
  const total = catalogo.length;
  let offset=start, generation=0;
  let instances=[];
  const dispose=()=>{
    for(const inst of instances){
      inst.disposed=true;
      if(inst.renderer){ inst.renderer.dispose(); inst.renderer.forceContextLoss(); }
      if(inst.object) inst.object.traverse(child=>{if(child.isMesh) child.geometry.dispose();});
    }
    instances=[];
  };
  const render=()=>{
    dispose();
    const current=++generation;
    track.replaceChildren();
    for(let n=0;n<3;n++){
      const item=catalogo[(offset+n)%total];
      const card=document.createElement('article');card.className='mt-model-card';
      const stage=document.createElement('div');stage.className='mt-model-stage';
      const thumb=document.createElement('img'); thumb.src=fixPath(item.preview);thumb.alt='Prévia de '+item.nome;thumb.loading='lazy';
      stage.append(thumb);
      const label=document.createElement('div');label.className='mt-model-caption';
      const small=document.createElement('small');small.textContent=item.genero+' / '+item.categoria;
      const strong=document.createElement('strong');strong.textContent=item.nome;
      label.append(small,strong);
      const open=document.createElement('button');open.type='button';open.textContent='Ver modelo ↗';open.addEventListener('click',()=>openViewer(item));
      card.append(stage,label,open);track.append(card);
      const instance={renderer:null,object:null,disposed:false};instances.push(instance);
      if (!window.WebGLRenderingContext) continue;
      try {
        const canvas=document.createElement('canvas');canvas.className='mt-model-canvas';canvas.setAttribute('aria-label',item.nome+' girando em 3D');
        const renderer3=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
        renderer3.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
        const stageRect=stage.getBoundingClientRect();
        const stageWidth=Math.max(160,Math.round(stageRect.width||240));
        const stageHeight=Math.max(200,Math.round(stageRect.height||260));
        renderer3.setSize(stageWidth,stageHeight,false);
        renderer3.outputColorSpace=THREE.SRGBColorSpace;
        instance.renderer=renderer3;
        const scene3=new THREE.Scene();
        const camera3=new THREE.PerspectiveCamera(35,stageWidth/stageHeight,.1,200);camera3.position.set(0,0,5.8);
        scene3.add(new THREE.HemisphereLight(0xffffff,0x504260,2.0));
        const key=new THREE.DirectionalLight(0xffffff,2.2);key.position.set(3,4,5);scene3.add(key);
        const rim=new THREE.DirectionalLight(0xc68aff,1.2);rim.position.set(-3,1,-2);scene3.add(rim);
        new OBJLoader().load(fixPath(item.obj), obj=>{
          if(instance.disposed||generation!==current){obj.traverse(x=>{if(x.isMesh)x.geometry.dispose()});return;}
          obj.traverse(x=>{if(x.isMesh)x.material=new THREE.MeshStandardMaterial({color:0xeae4ef,metalness:.08,roughness:.7,side:THREE.DoubleSide})});
          const bounds=new THREE.Box3().setFromObject(obj);
          const size=bounds.getSize(new THREE.Vector3());
          const center=bounds.getCenter(new THREE.Vector3());
          const fitScale=1.48/(Math.max(size.x,size.y,size.z)||1);
          obj.scale.setScalar(fitScale);
          // OBJ.position não escala junto com a malha: compensar o centro na escala final.
          obj.position.set(-center.x*fitScale,-center.y*fitScale,-center.z*fitScale);
          const fitted=new THREE.Box3().setFromObject(obj);
          const sphere=fitted.getBoundingSphere(new THREE.Sphere());
          const verticalFov=THREE.MathUtils.degToRad(camera3.fov);
          const horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*camera3.aspect);
          const safeFov=Math.min(verticalFov,horizontalFov);
          camera3.position.set(0,0,Math.max(4.5,sphere.radius/Math.sin(safeFov/2)*1.28));
          camera3.lookAt(0,0,0);
          scene3.add(obj);instance.object=obj;stage.append(canvas);thumb.classList.add('mt-thumb-backup');
          instance.draw=()=>{
            const w=Math.max(1,Math.round(stage.clientWidth)),h=Math.max(1,Math.round(stage.clientHeight));
            if(w!==instance.width||h!==instance.height){instance.width=w;instance.height=h;renderer3.setSize(w,h,false);camera3.aspect=w/h;camera3.updateProjectionMatrix();}
            obj.rotation.y+=.006;renderer3.render(scene3,camera3);
          };
        },undefined,()=>{renderer3.dispose();renderer3.forceContextLoss();instance.renderer=null;});
      }catch(err){if(instance.renderer){instance.renderer.dispose();instance.renderer=null;}}
    }
  };
  const prev=wrap.querySelector('.mt-model-prev'),next=wrap.querySelector('.mt-model-next');
  prev?.addEventListener('click',()=>{offset=(offset-1+total)%total;render()});
  next?.addEventListener('click',()=>{offset=(offset+1)%total;render()});
  render();
  mtCarousels.push({wrap,instances:()=>instances});
}
function animateModelCarousels(){
  requestAnimationFrame(animateModelCarousels);
  if(document.hidden)return;
  for(const carousel of mtCarousels){
    if(!carousel.wrap.getBoundingClientRect().width)continue;
    const rect=carousel.wrap.getBoundingClientRect();
    if(rect.bottom<0||rect.top>innerHeight)continue;
    carousel.instances().forEach(inst=>{if(!inst.disposed&&inst.draw)inst.draw()});
  }
}

setupLinks();
setupPages();
fillFilters();
updateStats();
renderProjects();
renderGrid();
mountModelCarousel('homeModelTrack','homeModelCarousel',0);

animateModelCarousels();

const initialHash = location.hash.replace('#','');
if(['home','loja','catalogo','sobre','redes','projetos'].includes(initialHash)) openPage(initialHash); else openPage('home');
