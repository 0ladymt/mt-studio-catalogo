import {CatalogViewer} from "./catalog-viewer.js";
const catalogViewer = new CatalogViewer();
import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {setupStudio,studioMaterial,smoothStudioNormals} from "./studio3d.js?v=20260928-2";

const LINKS_MT = {
  discord: "https://discord.gg/MAPubH3vRw",
  instagram: "https://www.instagram.com/mt_studiocriativo/",
  tiktok: "https://www.tiktok.com/@mt_studiocriativo",
};

const DEFAULT_VIEWER = { color: 0xd4d4d6, brightness: 1 };

const COLORS = [
  ["Branco", 0xd4d4d6],
  ["Preto", 0x111111],
  ["Cinza", 0x777777],
  ["Roxo", 0x6f35d6],
  ["Azul", 0x336dff],
  ["Verde", 0x2dbd63],
  ["Vermelho", 0xe53935],
  ["Marrom", 0x9a5a24],
  ["Amarelo", 0xffb832],
  ["Dourado", 0x9a6425],
  ["Lilás", 0xb13cff],
  ["Branco gelo", 0xf2f2f2],
];

const catalogo = Array.isArray(window.CATALOGO_MT) ? window.CATALOGO_MT : [];
const projetos = Array.isArray(window.PROJETOS_MT) ? window.PROJETOS_MT : [];

const $ = (id) => document.getElementById(id);

const IMAGE_FALLBACK_BASE =
  "https://raw.githubusercontent.com/0ladymt/mt-studio-catalogo/desenvolvimento-loja-mt/";
function recoverImage(image, localPath) {
  if (!image || !localPath || image.dataset.mtFallbackBound === "1") return;
  image.dataset.mtFallbackBound = "1";
  image.addEventListener("error", () => {
    if (image.dataset.remoteFallback === "1") {
      image.classList.add("mt-image-missing");
      image.removeAttribute("src");
      return;
    }
    const current = image.getAttribute("src") || "";
    image.dataset.remoteFallback = "1";
    image.src = IMAGE_FALLBACK_BASE + current.replace(/^\/+/, "");
  });
}

const grid = $("grid");
const empty = $("empty");
const search = $("search");
const gender = $("gender");
const category = $("category");

function fixPath(path) {
  return String(path || "")
    .replaceAll("\\", "/")
    .replace(/^\.?\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

function setupLinks() {
  $("discordTop").href = LINKS_MT.discord;
  $("aboutDiscord").href = LINKS_MT.discord;
  $("footerDiscord").href = LINKS_MT.discord;
  $("socialDiscord").href = LINKS_MT.discord;
  $("socialInstagram").href = LINKS_MT.instagram;
  $("socialTikTok").href = LINKS_MT.tiktok;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function fillFilters() {
  unique(catalogo.map((i) => i.genero)).forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    gender.appendChild(opt);
  });
  unique(catalogo.map((i) => i.categoria)).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    category.appendChild(opt);
  });
}

function updateStats() {
  $("statTotal").textContent = catalogo.length;
  $("statCategorias").textContent = unique(
    catalogo.map((i) => i.categoria),
  ).length;
  $("statFeminino").textContent = catalogo.filter(
    (i) => i.genero === "FEMININO",
  ).length;
  $("statMasculino").textContent = catalogo.filter(
    (i) => i.genero === "MASCULINO",
  ).length;
}

function renderProjects() {
  const box = $("projectsGrid");
  box.innerHTML = "";

  if (!projetos.length) {
    box.innerHTML = `<article class="project-card"><div><h3>Nenhum projeto cadastrado ainda</h3><p>Crie pastas dentro de assets/projetos e rode python gerar_projetos.py.</p></div></article>`;
    return;
  }

  projetos.forEach((p, index) => {
    const fotos = Array.isArray(p.fotos) ? p.fotos : p.imagem ? [p.imagem] : [];
    const capa = fixPath(p.capa || fotos[0] || "");
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <img src="${capa}" alt="${p.titulo || "Projeto"}" loading="lazy">
      <div>
        <h3>${p.titulo || "Projeto MT Studio"}</h3>
        <p>${fotos.length} foto${fotos.length === 1 ? "" : "s"} • projeto produzido pela MT Studio.</p>
      </div>
    `;
    recoverImage(card.querySelector("img"), capa);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Abrir " + p.titulo);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openProject(index);
      }
    });
    card.addEventListener("click", () => openProject(index));
    box.appendChild(card);
  });
}

function setProjectImage(src) {
  const img = $("projectMainImage");
  const loading = $("projectImageLoading");
  if (loading) {
    loading.textContent = "Carregando imagem...";
    loading.classList.remove("hidden");
  }
  img.onload = () => loading?.classList.add("hidden");
  img.onerror = () => {
    if (loading) loading.textContent = "Não foi possível carregar esta imagem.";
  };
  recoverImage(img, src);
  delete img.dataset.remoteFallback;
  img.src = src;
}

function openProject(index) {
  const p = projetos[index];
  const fotos = (
    Array.isArray(p.fotos) ? p.fotos : p.imagem ? [p.imagem] : []
  ).map(fixPath);
  if (!fotos.length) return;
  $("projectTitle").textContent = p.titulo || "Projeto MT Studio";
  $("projectDescription").textContent =
    p.descricao || "Projeto produzido pela MT Studio.";
  setProjectImage(fotos[0]);

  const thumbs = $("projectThumbs");
  thumbs.innerHTML = "";
  fotos.forEach((foto, i) => {
    const btn = document.createElement("button");
    btn.className = "project-thumb" + (i === 0 ? " active" : "");
    btn.type = "button";
    btn.setAttribute("aria-label", "Ver foto " + (i + 1));
    btn.innerHTML = `<img src="${foto}" alt="">`;
    recoverImage(btn.querySelector("img"), foto);
    btn.addEventListener("click", () => {
      setProjectImage(foto);
      document
        .querySelectorAll(".project-thumb")
        .forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
    });
    thumbs.appendChild(btn);
  });

  $("projectModal").classList.add("open");
  $("projectModal").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeProject() {
  $("projectModal").classList.remove("open");
  $("projectModal").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  $("projectMainImage").src = "";
}

$("closeProjectModal").addEventListener("click", closeProject);
$("projectModal").addEventListener("click", (e) => {
  if (e.target.id === "projectModal") closeProject();
});

function itemMatches(item) {
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
    item.pasta_original,
  ]
    .join(" ")
    .toLowerCase();
  return (
    (!q || hay.includes(q)) &&
    (!g || item.genero === g) &&
    (!c || item.categoria === c)
  );
}

function renderGrid() {
  const items = catalogo.filter(itemMatches);
  grid.innerHTML = "";
  empty.style.display = items.length ? "none" : "block";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <img class="thumb" src="${fixPath(item.preview)}?v=20260928-2" alt="${item.nome}" loading="lazy">
      <div class="card-body">
        <div class="tags"><span class="tag">${item.genero || "-"}</span><span class="tag">${item.categoria || "-"}</span></div>
        <h3>${item.nome || item.id}</h3>
        <details class="meta"><summary>Referência da peça</summary><div>YDD: ${item.ydd || "-"}</div><div>YTD: ${item.ytd || "-"}</div></details>
        <div class="actions"><button class="btn-3d" type="button">Ver 3D</button><button class="btn-copy" type="button">Copiar código</button></div>
      </div>
    `;
    card
      .querySelector(".btn-3d")
      .addEventListener("click", () => openViewer(item));
    card.querySelector(".btn-copy").addEventListener("click", async () => {
      const code = `${item.nome} | ${item.genero} | ${item.categoria} | ${item.ydd}`;
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        window.prompt("Copie a referência da peça:", code);
        return;
      }
      card.querySelector(".btn-copy").textContent = "Copiado!";
      setTimeout(
        () => (card.querySelector(".btn-copy").textContent = "Copiar código"),
        1200,
      );
    });
    grid.appendChild(card);
  });
}

search.addEventListener("input", renderGrid);
gender.addEventListener("change", renderGrid);
category.addEventListener("change", renderGrid);

let scene, camera, renderer, controls, currentMaterial;
let animationId;
let keyLight, fillLight, topLight, rimLight;
let viewerRequest = 0,
  viewerSphere = null,
  viewerObserver = null;

function disposeViewer() {
  ++viewerRequest;
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  viewerObserver?.disconnect();
  viewerObserver = null;
  controls?.dispose();
  scene?.traverse((n) => {
    if (n.isMesh) {
      n.geometry?.dispose();
      if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
      else n.material?.dispose();
    }
  });
  currentMaterial?.dispose();
  renderer?.dispose();
  scene = camera = renderer = controls = currentMaterial = null;
  viewerSphere = null;
}

function setupPalette() {
  const palette = $("colorPalette");
  palette.innerHTML = "";
  COLORS.forEach(([name, color]) => {
    const dot = document.createElement("button");
    dot.className = "color-dot";
    dot.type = "button";
    dot.title = name;
    dot.setAttribute("aria-label", name);
    dot.style.background = `#${color.toString(16).padStart(6, "0")}`;
    dot.dataset.color = color;
    dot.addEventListener("click", () => {
      setModelColor(Number(dot.dataset.color));
      document
        .querySelectorAll(".color-dot")
        .forEach((d) => d.classList.remove("active"));
      dot.classList.add("active");
    });
    palette.appendChild(dot);
  });
  palette.querySelector(".color-dot")?.classList.add("active");
}

function setModelColor(color) {
  if (catalogViewer.active) { catalogViewer.setColor(color); return; }
  if (!currentMaterial) return;
  currentMaterial.color.setHex(color);
  currentMaterial.needsUpdate = true;
}

function setBrightness(value) {
  if (catalogViewer.active) { catalogViewer.setBrightness(value); return; }
  const b = Number(value);
  if (keyLight) keyLight.intensity = 1.8 * b;
  if (fillLight) fillLight.intensity = 0.8 * b;
  if (topLight) topLight.intensity = 0.4 * b;
  if (rimLight) rimLight.intensity = 0.65 * b;
}

function resetViewerSettings() {
  if (catalogViewer.active) { catalogViewer.reset(); return; }
  $("brightnessRange").value = DEFAULT_VIEWER.brightness;
  setModelColor(DEFAULT_VIEWER.color);
  setBrightness(DEFAULT_VIEWER.brightness);
  if (camera && controls) {
    camera.position.set(0, 0, 1);
    controls.target.set(0, 0, 0);
    fitViewerCamera();
  }
  document
    .querySelectorAll(".color-dot")
    .forEach((d) => d.classList.remove("active"));
  document.querySelector(".color-dot")?.classList.add("active");
}

function openViewer(item) {
  if (document.getElementById("page-catalogo").classList.contains("active")) {
    setupPalette(); catalogViewer.open(item, catalogo.filter(itemMatches)); return;
  }
  $("modalTitle").textContent = `${item.nome || item.id}`;
  $("modalSubtitle").textContent =
    `${item.genero || ""}, ${item.categoria || ""}`;
  $("modal").classList.add("open");
  $("modal").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  $("viewer3d").parentElement.querySelector(".viewer-fallback")?.remove();
  $("viewer3d").hidden=false;
  setupPalette();
  requestAnimationFrame(() => {
    if ($("modal").classList.contains("open")) {
      try {
        initViewer(item);
      } catch (error) {
        const image=new Image();image.src=fixPath(item.preview)+"?v=20260928-2";image.alt=item.nome;image.className="viewer-fallback";
        $("viewer3d").hidden=true;$("viewer3d").parentElement.append(image);
        $("viewerLoading").textContent =
          "Seu navegador não conseguiu iniciar o 3D. Ative a aceleração gráfica e tente novamente.";
      }
    }
  });
}

$("closeModal").addEventListener("click", closeViewer);
$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeViewer();
});
$("brightnessRange").addEventListener("input", (e) =>
  setBrightness(e.target.value),
);
$("resetViewer").addEventListener("click", resetViewerSettings);

function closeViewer() {
  if (catalogViewer.active) { catalogViewer.close(); return; }
  $("modal").classList.remove("open");
  $("modal").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  disposeViewer();
}

function initViewer(item) {
  disposeViewer();
  const canvas = $("viewer3d");
  const wrap = canvas.parentElement;
  const width = Math.max(wrap.clientWidth, 1);
  const height = Math.max(wrap.clientHeight, 1);
  $("viewerLoading").textContent = "Carregando modelo 3D...";
  $("viewerLoading").classList.remove("hidden");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdedee0);
  camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 1000);
  camera.position.set(0, 0.65, 4.2);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0xdedee0, 1);
  renderer.setSize(width, height, true);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
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

  [keyLight,fillLight,topLight,rimLight]=setupStudio(renderer,scene);
  currentMaterial=studioMaterial();

  const objUrl = fixPath(item.obj);
  if (!objUrl) {
    $("viewerLoading").textContent = "Este item não possui OBJ cadastrado.";
    return;
  }

  const token = viewerRequest;
  const loader = new OBJLoader();
  loader.load(
    objUrl,
    (obj) => {
      if (token !== viewerRequest || !scene) {
        obj.traverse((n) => {
          n.geometry?.dispose();
          n.material?.dispose?.();
        });
        return;
      }
      obj.traverse((child) => {
        if (child.isMesh) {
          const original=child.geometry;
          child.geometry=smoothStudioNormals(original);
          if(original!==child.geometry)original.dispose();
          for(const material of [child.material].flat()) material?.dispose?.();
          child.material = currentMaterial;
          child.frustumCulled = true;
        }
      });
      centerAndFit(obj);
      scene.add(obj);
      resetViewerSettings();
      $("viewerLoading").classList.add("hidden");
    },
    undefined,
    (err) => {
      if (token !== viewerRequest) return;
      console.error("Erro ao carregar OBJ:", err, objUrl);
      $("viewerLoading").textContent = "Não foi possível carregar o modelo 3D.";
    },
  );

  function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  viewerObserver = new ResizeObserver(resizeViewer);
  viewerObserver.observe(wrap);
}

function centerAndFit(obj) {
  const box = new THREE.Box3().setFromObject(obj),
    center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  viewerSphere = new THREE.Box3()
    .setFromObject(obj)
    .getBoundingSphere(new THREE.Sphere());
  controls.target.set(0, 0, 0);
  fitViewerCamera();
}
function fitViewerCamera() {
  if (!camera || !viewerSphere) return;
  const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const radius = Math.max(viewerSphere.radius, 0.0001);
  const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.15;
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (!direction.lengthSq()) direction.set(0, 0, 1);
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  camera.near = Math.max(0.00001, radius / 1000);
  camera.far = distance + radius * 50;
  controls.minDistance = radius * 1.15;
  controls.maxDistance = distance * 5;
  camera.updateProjectionMatrix();
  controls.update();
}
function resizeViewer() {
  if (!renderer || !camera) return;
  const wrap = $("viewer3d").parentElement,
    w = Math.max(1, wrap.clientWidth),
    h = Math.max(1, wrap.clientHeight);
  camera.aspect = w / h;
  renderer.setSize(w, h, false);
  fitViewerCamera();
}

/* Atomic trio preparation: old layer survives every pending/error state.
   Geometry is centred in a group before rotation. Both sets are drawn at the
   exact stage size before opacity changes; GPU resources live through the fade. */
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const mtCarousels = [];
function disposeObject(obj) {
  obj?.traverse((n) => {
    if (n.isMesh) {
      n.geometry?.dispose();
      const materials = Array.isArray(n.material) ? n.material : [n.material];
      materials.forEach((m) => m?.dispose());
    }
  });
}
function fitModelCamera(camera, radius, w, h) {
  camera.aspect = w / h;
  const halfV = THREE.MathUtils.degToRad(camera.fov) / 2,
    halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  const distance =
    (Math.max(0.001, radius) / Math.sin(Math.min(halfV, halfH))) * 1.14;
  camera.position.set(0, 0, distance);
  camera.near = Math.max(0.00001, radius / 1000);
  camera.far = distance + radius * 10;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
let webglAvailable=true;
function mountModelCarousel(trackId, wrapId, start = 0) {
  const track = $(trackId),
    wrap = $(wrapId);
  if (!track || !wrap || !catalogo.length) return;
  const status = $("carouselStatus"),
    loader = new OBJLoader();
  let offset = start,
    busy = false,
    current = null;
  const live = new Set();
  function dispose(set) {
    live.delete(set);
    set.instances.forEach((i) => {
      disposeObject(i.group);
      i.renderer?.dispose();
      i.renderer?.forceContextLoss();
    });
    set.layer.remove();
  }
  async function advance(delta) {
    if (busy) return;
    busy = true;
    wrap.classList.add("is-preparing");
    wrap.setAttribute("aria-busy", "true");
    const buttons = [...wrap.querySelectorAll(".mt-model-prev,.mt-model-next")];
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = current
      ? "Preparando os próximos modelos…"
      : "Preparando os modelos…";
    const nextOffset = (offset + delta + catalogo.length) % catalogo.length;
    const items = Array.from(
      { length: 3 },
      (_, i) => catalogo[(nextOffset + i) % catalogo.length],
    );
    const results = await Promise.allSettled(
      items.map(async (item) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(fixPath(item.obj), {
            signal: controller.signal,
          });
          if (!response.ok) throw Error("Modelo indisponível");
          return loader.parse(await response.text());
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    let fresh = null;
    try {
      if (results.some((r) => r.status === "rejected")) {
        results.forEach((r) => {
          if (r.status === "fulfilled") disposeObject(r.value);
        });
        throw Error("Modelo indisponível");
      }
      const previews=await Promise.all(items.map(async item=>{const image=new Image();image.src=fixPath(item.preview)+"?v=20260928-2";image.alt=item.nome;await image.decode();return image;}));
      const layer = document.createElement("div");
      layer.className = "mt-model-set";
      layer.inert = true;
      layer.setAttribute("aria-hidden", "true");
      fresh = { layer, instances: [] };
      track.append(layer);
      results.forEach((result, i) => {
        const item = items[i],
          obj = result.value;
        const card = document.createElement("article");
        card.className = "mt-model-card";
        const stage = document.createElement("div");
        stage.className = "mt-model-stage";
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-label", `${item.nome} em 3D`);
        stage.append(canvas);
        const caption = document.createElement("div");
        caption.className = "mt-model-caption";
        const small = document.createElement("small");
        small.textContent = item.genero + " / " + item.categoria;
        const title = document.createElement("strong");
        title.textContent = item.nome;
        caption.append(small, title);
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = "Ver modelo ↗";
        open.onclick = () => openViewer(item);
        card.append(stage, caption, open);
        layer.append(card);
        let renderer3;
        if(webglAvailable)try{renderer3=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"low-power"});}catch{webglAvailable=false;}
        if(!renderer3){canvas.replaceWith(previews[i]);fresh.instances.push({group:obj,draw(){}});return;}
        renderer3.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
        const scene3 = new THREE.Scene();
        setupStudio(renderer3,scene3);
        obj.traverse((n) => {
          if (n.isMesh) {
            n.material?.dispose?.();
            const original=n.geometry;
            n.geometry=smoothStudioNormals(original);
            if(original!==n.geometry)original.dispose();
            n.material=studioMaterial();
          }
        });
        const box = new THREE.Box3().setFromObject(obj),
          center = box.getCenter(new THREE.Vector3());
        obj.position.sub(center);
        const group = new THREE.Group();
        group.add(obj);
        scene3.add(group);
        const radius = new THREE.Box3()
          .setFromObject(group)
          .getBoundingSphere(new THREE.Sphere()).radius;
        const camera3 = new THREE.PerspectiveCamera(35, 1, 0.001, 1000);
        const instance = {
          group,
          renderer: renderer3,
          w: 0,
          h: 0,
          draw(dt = 0) {
            const w = stage.clientWidth,
              h = stage.clientHeight;
            if (!w || !h) return;
            if (w !== this.w || h !== this.h) {
              this.w = w;
              this.h = h;
              renderer3.setSize(w, h, false);
              fitModelCamera(camera3, radius, w, h);
            }
            if (!reducedMotion.matches) group.rotation.y += dt * 0.36;
            renderer3.render(scene3, camera3);
          },
        };
        fresh.instances.push(instance);
        instance.draw();
      });
      live.add(fresh);
      // Ensure GPU work and layout have a full frame before the reveal.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      fresh.instances.forEach((i) => i.draw());
      const old = current;
      current = fresh;
      offset = nextOffset;
      fresh.layer.inert = false;
      fresh.layer.removeAttribute("aria-hidden");
      fresh.layer.classList.add("is-current");
      if (old) {
        old.layer.inert = true;
        old.layer.setAttribute("aria-hidden", "true");
        old.layer.classList.remove("is-current");
        await new Promise((r) =>
          setTimeout(r, reducedMotion.matches ? 0 : 480),
        );
        dispose(old);
      }
      status.textContent = webglAvailable ? "" : "Prévia em imagem. A rotação 3D requer aceleração gráfica.";
    } catch (error) {
      if (fresh) dispose(fresh);
      status.textContent = current
        ? "Não foi possível trocar os modelos. O conjunto atual foi mantido."
        : "O 3D não ficou disponível. Você pode explorar as imagens no catálogo.";
    } finally {
      busy = false;
      wrap.classList.remove("is-preparing");
      wrap.removeAttribute("aria-busy");
      buttons.forEach((b) => (b.disabled = false));
    }
  }
  wrap.querySelector(".mt-model-prev").onclick = () => advance(-3);
  wrap.querySelector(".mt-model-next").onclick = () => advance(3);
  mtCarousels.push({
    wrap,
    draw(dt) {
      live.forEach((set) => set.instances.forEach((i) => i.draw(dt)));
    },
  });
  advance(0);
}
let previousFrame = performance.now();
function animateModelCarousels(now) {
  requestAnimationFrame(animateModelCarousels);
  const dt = Math.min(0.05, (now - previousFrame) / 1000);
  previousFrame = now;
  if (document.hidden) return;
  for (const c of mtCarousels) {
    const rect = c.wrap.getBoundingClientRect();
    if (rect.width && rect.bottom >= 0 && rect.top < innerHeight) c.draw(dt);
  }
}
window.mtOpenProject = openProject;

setupLinks();

fillFilters();
updateStats();
renderProjects();
renderGrid();
mountModelCarousel("homeModelTrack", "homeModelCarousel", 0);

requestAnimationFrame(animateModelCarousels);
