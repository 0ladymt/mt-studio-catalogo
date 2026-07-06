import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const LINKS_MT = {
  discord: 'https://discord.gg/eUtDc9KStc',
  instagram: 'https://instagram.com/mtstudio_',
  tiktok: 'https://www.tiktok.com/@mt_studiocriativo?_r=1&_t=ZS-95TIQCHu8N5'
};

const PROJETOS_MT = [
  {
    titulo: 'Projeto MT Studio',
    categoria: 'Personalizado',
    imagem: 'assets/projetos/projeto-01.png',
    descricao: 'Adicione suas imagens em assets/projetos e edite esta lista no app.js.'
  }
];

const DEFAULT_VIEWER = {
  color: 0xd4d4d6,
  brightness: 1
};

const COLORS = [
  ['Branco', 0xd4d4d6],
  ['Preto', 0x111111],
  ['Cinza', 0x777777],
  ['Marrom', 0x9a5a24],
  ['Roxo', 0x6f35d6],
  ['Azul', 0x336dff],
  ['Verde', 0x2dbd63],
  ['Vermelho', 0xe53935],
  ['Rosa', 0xff4aa2],
  ['Lilás', 0xb13cff],
  ['Amarelo', 0xffb832],
  ['Dourado', 0x9a6425]
];

const catalogo = Array.isArray(window.CATALOGO_MT) ? window.CATALOGO_MT : [];

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const empty = $('empty');
const search = $('search');
const gender = $('gender');
const category = $('category');

let currentItems = [...catalogo];

function setupLinks(){
  $('discordTop').href = LINKS_MT.discord;
  $('socialDiscord').href = LINKS_MT.discord;
  $('socialInstagram').href = LINKS_MT.instagram;
  $('socialTikTok').href = LINKS_MT.tiktok;
  $('socialWhatsapp').href = LINKS_MT.whatsapp;
}

function setupPages(){
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`page-${btn.dataset.page}`).classList.add('active');
    });
  });
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
  PROJETOS_MT.forEach(p => {
    const card = document.createElement('article');
    card.className = 'project-card';
    card.innerHTML = `
      <img src="${p.imagem}" alt="${p.titulo}" onerror="this.style.display='none'">
      <h3>${p.titulo}</h3>
      <p><strong>${p.categoria}</strong> • ${p.descricao}</p>
    `;
    box.appendChild(card);
  });
}

function itemMatches(item){
  const q = search.value.trim().toLowerCase();
  const g = gender.value;
  const c = category.value;

  const hay = [
    item.id,
    item.nome,
    item.genero,
    item.categoria,
    item.ydd,
    item.ytd,
    item.pasta_original
  ].join(' ').toLowerCase();

  return (!q || hay.includes(q)) && (!g || item.genero === g) && (!c || item.categoria === c);
}

function renderGrid(){
  currentItems = catalogo.filter(itemMatches);
  grid.innerHTML = '';
  empty.style.display = currentItems.length ? 'none' : 'block';

  currentItems.forEach(item => {
    const card = document.createElement('article');
    card.className = 'card';

    card.innerHTML = `
      <img class="thumb" src="${item.preview || ''}" alt="${item.nome}" loading="lazy">
      <div class="card-body">
        <div class="tags">
          <span class="tag">${item.genero || '-'}</span>
          <span class="tag">${item.categoria || '-'}</span>
        </div>
        <h3>${item.nome || item.id}</h3>
        <div class="meta">
          <div>YDD: ${item.ydd || '-'}</div>
          <div>YTD: ${item.ytd || '-'}</div>
        </div>
        <div class="actions">
          <button class="btn-3d" type="button">Ver 3D</button>
          <button class="btn-copy" type="button">Copiar código</button>
        </div>
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

let scene, camera, renderer, controls, modelGroup, currentMaterial, currentItem;
let animationId;
let keyLight, fillLight, topLight, rimLight;

function disposeViewer(){
  if(animationId) cancelAnimationFrame(animationId);
  animationId = null;

  if(renderer){
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  const canvas = $('viewer3d');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();

  scene = camera = renderer = controls = modelGroup = currentMaterial = null;
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
  if(keyLight) keyLight.intensity = 2.3 * b;
  if(fillLight) fillLight.intensity = 1.15 * b;
  if(topLight) topLight.intensity = 1.05 * b;
  if(rimLight) rimLight.intensity = 0.75 * b;
}

function resetViewerSettings(){
  $('brightnessRange').value = DEFAULT_VIEWER.brightness;
  setModelColor(DEFAULT_VIEWER.color);
  setBrightness(DEFAULT_VIEWER.brightness);

  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  document.querySelector('.color-dot')?.classList.add('active');
}

function openViewer(item){
  currentItem = item;
  $('modalTitle').textContent = `${item.nome || item.id}`;
  $('modalSubtitle').textContent = `${item.genero || ''}, ${item.categoria || ''}`;
  $('modal').classList.add('open');
  $('modal').setAttribute('aria-hidden', 'false');

  setupPalette();
  initViewer(item);
}

$('closeModal').addEventListener('click', closeViewer);
$('modal').addEventListener('click', (e) => {
  if(e.target.id === 'modal') closeViewer();
});
$('brightnessRange').addEventListener('input', (e) => setBrightness(e.target.value));
$('resetViewer').addEventListener('click', resetViewerSettings);

function closeViewer(){
  $('modal').classList.remove('open');
  $('modal').setAttribute('aria-hidden', 'true');
  disposeViewer();
}

function initViewer(item){
  disposeViewer();

  const canvas = $('viewer3d');
  const wrap = canvas.parentElement;
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x22002f);

  camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 1000);
  camera.position.set(0, 1.1, 4.2);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.82;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.45;
  controls.enablePan = true;
  controls.minDistance = 0.7;
  controls.maxDistance = 8;

  keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
  keyLight.position.set(2.5, 3.5, 4);
  scene.add(keyLight);

  fillLight = new THREE.DirectionalLight(0xffffff, 1.15);
  fillLight.position.set(-3, 1.7, 2.4);
  scene.add(fillLight);

  topLight = new THREE.DirectionalLight(0xffffff, 1.05);
  topLight.position.set(0, 5, 1.5);
  scene.add(topLight);

  rimLight = new THREE.DirectionalLight(0xffffff, 0.75);
  rimLight.position.set(0, 2.2, -4);
  scene.add(rimLight);

  scene.add(new THREE.AmbientLight(0xffffff, 1.35));

  modelGroup = new THREE.Group();
  scene.add(modelGroup);

  currentMaterial = new THREE.MeshStandardMaterial({
    color: DEFAULT_VIEWER.color,
    roughness: 0.72,
    metalness: 0.02
  });

  const loader = new OBJLoader();
  loader.load(
    item.obj,
    (obj) => {
      obj.traverse(child => {
        if(child.isMesh){
          child.material = currentMaterial;
          child.geometry.computeVertexNormals();
        }
      });

      centerAndFit(obj);
      modelGroup.add(obj);
      resetViewerSettings();
    },
    undefined,
    (err) => {
      console.error('Erro ao carregar OBJ:', err);
    }
  );

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
  const scale = 2.45 / maxDim;
  obj.scale.setScalar(scale);

  const box2 = new THREE.Box3().setFromObject(obj);
  const center2 = new THREE.Vector3();
  box2.getCenter(center2);
  controls.target.copy(center2);
  camera.position.set(0, Math.max(size.y * scale * 0.15, .2), 4.2);
  camera.lookAt(center2);
  controls.update();
}

function resizeViewer(){
  if(!renderer || !camera) return;
  const canvas = $('viewer3d');
  const wrap = canvas.parentElement;
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

setupLinks();
setupPages();
fillFilters();
updateStats();
renderProjects();
renderGrid();
