import * as THREE from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {setupStudio, studioMaterial, smoothStudioNormals} from './studio3d.js?v=20260928-2';

const $ = id => document.getElementById(id);
const path = value => String(value || '').replaceAll('\\', '/').replace(/^\.?\//, '').split('/').map(encodeURIComponent).join('/');

// The vertex sphere bounds every orientation, regardless of the model's units.
export function frameObject(object) {
  object.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  let radius = 0;
  const vertex = new THREE.Vector3();
  object.traverse(node => {
    const positions = node.geometry?.attributes.position;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      radius = Math.max(radius, vertex.distanceTo(center));
    }
  });
  object.position.sub(center);
  object.updateMatrixWorld(true);
  return Math.max(radius, 1e-6);
}
export function fitDistance(radius, aspect, fov = 36) {
  const vertical = THREE.MathUtils.degToRad(fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return radius / Math.sin(Math.min(vertical, horizontal)) * 1.12;
}
function disposeObject(object) {
  object?.traverse(node => {
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => material?.dispose());
  });
}

export class CatalogViewer {
  constructor() { this.active = false; this.token = 0; }
  open(item, items) {
    if (!this.active) {
      this.active = true;
      this.opener = document.activeElement;
      this.modal = $('modal');
      this.wrap = $('viewer3d').parentElement;
      this.note = this.wrap.querySelector('.viewer-note');
      this.originalNote = this.note.textContent;
      this.note.textContent = 'Arraste para girar · Zoom com margem segura';
      this.modal.classList.add('catalog-viewer');
      $('viewer3d').hidden = true;
      this.wrap.querySelector('.viewer-fallback')?.remove();
      this.navigation = document.createElement('nav');
      this.navigation.className = 'catalog-viewer-navigation';
      this.navigation.setAttribute('aria-label', 'Navegar pelos modelos filtrados');
      this.buttons = [-1, 1].map(direction => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = direction < 0 ? 'Anterior' : 'Próximo modelo';
        button.addEventListener('click', () => this.load(this.items[(this.index + direction + this.items.length) % this.items.length]));
        this.navigation.append(button);
        return button;
      });
      this.modal.querySelector('.viewer-panel').prepend(this.navigation);
      this.statusAttributes = ['role', 'aria-live'].map(name => [name, $('viewerLoading').getAttribute(name)]);
      $('viewerLoading').setAttribute('role', 'status');
      $('viewerLoading').setAttribute('aria-live', 'polite');
      this.keyHandler = event => {
        if (event.key === 'Escape' && this.active) $('closeModal').click();
      };
      document.addEventListener('keydown', this.keyHandler);
    }
    this.items = items.length ? items : [item];
    this.load(item);
  }
  show() {
    this.modal.classList.add('open');
    this.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  status(message) {
    $('viewerLoading').textContent = message;
    $('viewerLoading').classList.toggle('hidden', !message);
  }
  setDisabled(disabled) {
    this.modal.querySelectorAll('.color-dot,#brightnessRange,#resetViewer').forEach(el => { el.disabled = disabled; });
  }
  startRenderer() {
    if (this.renderer || this.fallback) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'catalog-viewer-canvas';
    canvas.hidden = true;
    canvas.setAttribute('aria-label', 'Modelo 3D: arraste para girar. O zoom preserva a peça inteira.');
    try {
      this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 1000);
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enablePan = false;
      this.controls.enableDamping = false;
      this.controls.rotateSpeed = 1.55;
      this.wrap.append(canvas);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.wrap);
      const tick = () => {
        if (!this.active) return;
        this.raf = requestAnimationFrame(tick);
        this.controls.update();
        if (this.scene) this.renderer.render(this.scene, this.camera);
      };
      this.raf = requestAnimationFrame(tick);
    } catch {
      this.renderer?.dispose();
      this.renderer = null;
      this.fallback = true;
      this.setDisabled(true);
    }
  }
  resize(reset = false) {
    if (!this.renderer || !this.radius) return;
    const width = Math.max(this.wrap.clientWidth, 1), height = Math.max(this.wrap.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const fit = fitDistance(this.radius, this.camera.aspect);
    this.camera.near = this.radius / 100;
    this.camera.far = fit * 20;
    this.controls.minDistance = fit;
    this.controls.maxDistance = fit * 3;
    if (reset) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 0, fit);
    } else {
      const offset = this.camera.position.clone().sub(this.controls.target);
      offset.setLength(Math.max(fit, Math.min(offset.length(), fit * 3)));
      this.camera.position.copy(this.controls.target).add(offset);
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  async load(item) {
    const token = ++this.token;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const timer = setTimeout(() => abort.abort(), 20000);
    this.buttons.forEach(button => { button.disabled = true; });
    this.status('Preparando próximo modelo…');
    let object;
    try {
      const preview = new Image();
      preview.className = 'catalog-viewer-preview';
      preview.alt = item.nome || item.id;
      preview.src = path(item.preview) + '?v=20260928-2';
      await Promise.race([preview.decode(), new Promise((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('Interrompido')), {once: true}))]);
      if (!this.active || token !== this.token) return;
      if (!this.current) {
        this.preview?.remove(); this.preview = preview; this.wrap.append(preview);
        this.setLabels(item); this.show();
      }
      this.startRenderer();
      if (this.fallback) {
        if (this.current) { this.preview?.remove(); this.preview = preview; this.wrap.append(preview); }
        this.commitItem(item);
        this.status('Prévia estática: o navegador não disponibilizou WebGL.');
        return;
      }
      const response = await fetch(path(item.obj), {signal: abort.signal});
      if (!response.ok) throw new Error('Falha no arquivo');
      const source = await response.text();
      if (!this.active || token !== this.token) return;
      object = new OBJLoader().parse(source);
      const material = studioMaterial();
      let meshes = 0;
      object.traverse(node => {
        if (!node.isMesh) return;
        meshes++;
        const original = node.geometry;
        node.geometry = smoothStudioNormals(original);
        if (node.geometry !== original) original.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose());
        node.material = material;
      });
      if (!meshes) { material.dispose(); throw new Error('Geometria ausente'); }
      const radius = frameObject(object);
      const scene = new THREE.Scene();
      const lights = setupStudio(this.renderer, scene);
      scene.add(object);
      this.renderer.compile(scene, this.camera);
      if (!this.active || token !== this.token) { disposeObject(object); object = null; return; }
      const old = this.object;
      this.scene = scene;
      this.object = object;
      this.material = material;
      this.lights = lights;
      this.radius = radius;
      this.reset();
      // All preparation and the first render happen in one turn, before paint.
      this.renderer.render(this.scene, this.camera);
      this.renderer.domElement.hidden = false;
      this.preview?.remove(); this.preview = null;
      this.commitItem(item);
      this.status('');
      disposeObject(old);
    } catch {
      if (!this.active || token !== this.token) return;
      if (object && object !== this.object) disposeObject(object);
      this.show();
      this.status(this.current ? 'Não foi possível carregar. O modelo atual foi mantido; tente novamente.' : 'Não foi possível abrir o 3D. Feche e tente novamente.');
    } finally {
      clearTimeout(timer);
      if (this.active && token === this.token) this.buttons.forEach(button => { button.disabled = this.items.length < 2; });
    }
  }
  commitItem(item) {
    this.current = item;
    this.index = this.items.indexOf(item);
    this.setLabels(item);
  }
  setLabels(item) {
    $('modalTitle').textContent = item.nome || item.id;
    $('modalSubtitle').textContent = `${item.genero || ''}, ${item.categoria || ''}`;
  }
  setColor(color) { this.material?.color.setHex(color); }
  setBrightness(value) {
    this.lights?.forEach((light, index) => { light.intensity = [1.8, .8, .4, .65][index] * Number(value); });
  }
  reset() {
    this.setColor(0xd4d4d6); this.setBrightness(1); this.resize(true);
    $('brightnessRange').value = 1;
    this.modal.querySelectorAll('.color-dot').forEach((dot, index) => dot.classList.toggle('active', index === 0));
  }
  close() {
    this.active = false; this.token++; this.abort?.abort();
    cancelAnimationFrame(this.raf); this.observer?.disconnect();
    this.controls?.dispose(); disposeObject(this.object);
    this.renderer?.dispose(); this.renderer?.domElement.remove();
    this.preview?.remove(); this.navigation?.remove();
    this.note.textContent = this.originalNote;
    this.setDisabled(false);
    this.status('');
    this.statusAttributes.forEach(([name, value]) => {
      if (value === null) $('viewerLoading').removeAttribute(name);
      else $('viewerLoading').setAttribute(name, value);
    });
    this.modal.classList.remove('open', 'catalog-viewer');
    this.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    $('viewer3d').hidden = false;
    document.removeEventListener('keydown', this.keyHandler);
    this.opener?.focus();
    this.renderer = this.controls = this.scene = this.object = this.material = this.radius = this.current = this.preview = null;
    this.fallback = false;
  }
}
