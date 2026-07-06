const items = window.CATALOGO_MT || [];

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const gender = document.getElementById('gender');
const category = document.getElementById('category');
const sort = document.getElementById('sort');

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

setText('countTotal', items.length);
setText('countCategories', new Set(items.map(i => i.categoria).filter(Boolean)).size);
setText('countFeminino', items.filter(i => i.genero === 'FEMININO').length);
setText('countMasculino', items.filter(i => i.genero === 'MASCULINO').length);

function fillSelect(el, values) {
  if (!el) return;

  values
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      el.appendChild(option);
    });
}

fillSelect(gender, [...new Set(items.map(i => i.genero))]);
fillSelect(category, [...new Set(items.map(i => i.categoria))]);

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
  }
}

function safeText(value, fallback = '—') {
  return value || fallback;
}

function render() {
  if (!grid) return;

  const q = (search?.value || '').trim().toLowerCase();

  let list = items.filter(item => {
    const matchGender = !gender?.value || item.genero === gender.value;
    const matchCategory = !category?.value || item.categoria === category.value;
    return matchGender && matchCategory;
  });

  if (q) {
    list = list.filter(item => {
      return [
        item.id,
        item.nome,
        item.genero,
        item.categoria,
        item.ydd,
        item.ytd,
        item.pasta_original
      ].join(' ').toLowerCase().includes(q);
    });
  }

  if (sort?.value === 'category') {
    list.sort((a, b) =>
      `${a.categoria} ${a.nome}`.localeCompare(`${b.categoria} ${b.nome}`, 'pt-BR', { numeric: true })
    );
  } else if (sort?.value === 'gender') {
    list.sort((a, b) =>
      `${a.genero} ${a.categoria} ${a.nome}`.localeCompare(`${b.genero} ${b.categoria} ${b.nome}`, 'pt-BR', { numeric: true })
    );
  } else {
    list.sort((a, b) =>
      `${a.categoria} ${a.nome}`.localeCompare(`${b.categoria} ${b.nome}`, 'pt-BR', { numeric: true })
    );
  }

  grid.innerHTML = list.map(item => {
    const preview = item.preview || '';
    const obj = item.obj || '';
    const code = `${safeText(item.nome)} | ${safeText(item.genero)} | ${safeText(item.categoria)} | ${safeText(item.ydd)}`;

    return `
      <article class="card">
        <div class="thumb">
          ${preview ? `<img loading="lazy" src="${preview}" alt="${safeText(item.nome)}">` : `<div class="no-preview">Sem preview</div>`}
        </div>

        <div class="body">
          <div class="meta">
            <span class="tag">${safeText(item.genero)}</span>
            <span class="tag">${safeText(item.categoria)}</span>
          </div>

          <h3>${safeText(item.nome)}</h3>

          <div class="file" title="${safeText(item.ydd)}">YDD: ${safeText(item.ydd)}</div>
          <div class="file" title="${safeText(item.ytd)}">YTD: ${safeText(item.ytd)}</div>

          <div class="actions">
            <button class="btn" type="button" data-view="${obj}" data-title="${safeText(item.nome)} • ${safeText(item.categoria)}" ${obj ? '' : 'disabled'}>
              Ver 3D
            </button>
            <button class="btn secondary" type="button" data-copy="${code}">
              Copiar código
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  if (empty) {
    empty.style.display = list.length ? 'none' : 'block';
  }
}

[search, gender, category, sort].forEach(el => {
  if (el) el.addEventListener('input', render);
});

if (grid) {
  grid.addEventListener('click', event => {
    const copyBtn = event.target.closest('[data-copy]');
    if (copyBtn) {
      copyToClipboard(copyBtn.dataset.copy);
      copyBtn.textContent = 'Copiado!';
      setTimeout(() => {
        copyBtn.textContent = 'Copiar código';
      }, 900);
      return;
    }

    const viewBtn = event.target.closest('[data-view]');
    if (viewBtn && viewBtn.dataset.view) {
      openViewer(viewBtn.dataset.view, viewBtn.dataset.title);
    }
  });
}

render();

const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');

if (closeModal && modal) {
  closeModal.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', event => {
    if (event.target === modal) modal.classList.remove('open');
  });
}

let THREE = null;
let OrbitControls = null;
let OBJLoader = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let currentObj = null;

async function loadThree() {
  if (THREE && OrbitControls && OBJLoader) return;

  const threeModule = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
  const controlsModule = await import('https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js');
  const loaderModule = await import('https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js');

  THREE = threeModule;
  OrbitControls = controlsModule.OrbitControls;
  OBJLoader = loaderModule.OBJLoader;
}

async function openViewer(path, title) {
  if (!modal) return;

  document.getElementById('modalTitle').textContent = title || 'Visualização 3D';
  modal.classList.add('open');

  try {
    await loadThree();

    if (!renderer) initViewer();
    resizeViewer();

    if (currentObj) {
      scene.remove(currentObj);
      currentObj = null;
    }

    const loader = new OBJLoader();
    loader.load(
      path,
      obj => {
        currentObj = obj;

        obj.traverse(child => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              roughness: 0.38,
              metalness: 0.02,
              side: THREE.DoubleSide
            });

            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();

        obj.position.sub(center);

        const scale = size ? 2.4 / size : 1;
        obj.scale.setScalar(scale);

        scene.add(obj);
      },
      undefined,
      error => {
        console.error('Erro ao carregar OBJ:', error);
        alert('Não consegui carregar o modelo 3D deste item. O card e a imagem continuam funcionando.');
      }
    );
  } catch (error) {
    console.error('Erro ao iniciar visualizador 3D:', error);
    alert('Não consegui iniciar o visualizador 3D agora. O catálogo continua funcionando normalmente.');
  }
}

function initViewer() {
  const canvas = document.getElementById('viewer3d');

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = false;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(0, 1.2, 4);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b4a88, 2.2));
  scene.add(new THREE.AmbientLight(0xffffff, 1.55));

  const frontLight = new THREE.DirectionalLight(0xffffff, 1.9);
  frontLight.position.set(0, 3, 6);
  scene.add(frontLight);

  const backLight = new THREE.DirectionalLight(0xffffff, 1.75);
  backLight.position.set(0, 3, -6);
  scene.add(backLight);

  const leftLight = new THREE.DirectionalLight(0xffffff, 1.15);
  leftLight.position.set(-5, 2.5, 0);
  scene.add(leftLight);

  const rightLight = new THREE.DirectionalLight(0xffffff, 1.15);
  rightLight.position.set(5, 2.5, 0);
  scene.add(rightLight);

  const topLight = new THREE.DirectionalLight(0xffffff, 1.25);
  topLight.position.set(0, 7, 0);
  scene.add(topLight);

  window.addEventListener('resize', resizeViewer);
  animate();
}

function resizeViewer() {
  if (!renderer || !camera) return;

  const viewer = document.querySelector('.viewer');
  if (!viewer) return;

  const box = viewer.getBoundingClientRect();
  renderer.setSize(box.width, box.height, false);

  camera.aspect = box.width / box.height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}