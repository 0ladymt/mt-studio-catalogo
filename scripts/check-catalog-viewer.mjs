// Deterministic DOM/renderer adapters: tests transitions, not browser rasterization.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const threeURL = pathToFileURL(resolve('assets/vendor/three/three.module.js')).href;
const actualThree = await import(threeURL);
async function localModule(file) {
  const source = readFileSync(file,'utf8').replace(/from ['"]three['"]/g,`from '${threeURL}'`);
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const {OBJLoader} = await localModule('assets/vendor/three/addons/loaders/OBJLoader.js');
const studio = await localModule('studio3d.js');
class Element {
  constructor() {
    this.children = []; this.attributes = {}; this.events = {};
    this.hidden = false; this.disabled = false; this.clientWidth = 700; this.clientHeight = 450;
    const classes = new Set();
    this.classList = {add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);}};
  }
  append(child) { this.children.push(child); child.parentElement = this; }
  prepend(child) { this.children.unshift(child); child.parentElement = this; }
  remove() { if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this); }
  setAttribute(name,value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name,handler) { this.events[name] = handler; }
  focus() { document.activeElement = this; }
  click() { this.events.click?.({target:this}); }
  getClientRects() { return this.hidden ? [] : [{}]; }
  querySelector(selector) {
    if(selector==='.viewer-note')return note;
    if(selector==='.viewer-panel')return panel;
    if(selector==='.viewer-fallback')return null;
    if(selector==='button'||selector==='.close,.project-close')return elements.closeModal;
    return null;
  }
  querySelectorAll(selector) {
    if(selector==='.color-dot')return dots;
    if(selector==='.color-dot,#brightnessRange,#resetViewer')return [...dots,elements.brightnessRange,elements.resetViewer];
    return [...dots,elements.closeModal,elements.brightnessRange,elements.resetViewer,...(viewer?.buttons||[])];
  }
}
const elements = Object.fromEntries(['modal','viewer3d','viewerLoading','modalTitle','modalSubtitle','brightnessRange','resetViewer','closeModal'].map(id=>[id,new Element()]));
const wrap = new Element(), note = new Element(), panel = new Element(), opener = new Element();
wrap.append(elements.viewer3d); note.textContent = 'Original note';
const dots = Array.from({length:12},()=>new Element());
const handlers = {};
const document = {getElementById:id=>elements[id],createElement:()=>new Element(),activeElement:opener,body:{style:{}},addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:(name,fn)=>{if(handlers[name]===fn)delete handlers[name];}};
let failGPU = false, imageFailure = false, fetchMode = 'ok';
const pending = [];
const frames = [];
class Renderer {
  constructor({canvas}) { if(failGPU)throw Error('No WebGL');this.domElement=canvas; }
  setPixelRatio() {} setSize(w,h) { this.width=w;this.height=h; }
  setClearColor() {} compile() {}
  render(scene,camera) { frames.push({scene,camera}); }
  dispose() { this.disposed=true; }
}
class Controls {
  constructor(camera) {this.camera=camera;this.target=new actualThree.Vector3();}
  update() {this.camera.lookAt(this.target);this.camera.updateMatrixWorld(true);}
  dispose() {this.disposed=true;}
}
const objSource = readFileSync('assets/models/masculino_teef_01.obj','utf8');
const source = readFileSync('catalog-viewer.js','utf8').replace(/^import .*\n/gm,'').replaceAll('export ', '');
const context = {THREE:{...actualThree,WebGLRenderer:Renderer},OBJLoader,OrbitControls:Controls,...studio,document,
 Image:class extends Element {decode(){return imageFailure?Promise.reject(Error('Image')):Promise.resolve();}},
 ResizeObserver:class {observe(){}disconnect(){this.disconnected=true;}},devicePixelRatio:1,
 requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},setTimeout,clearTimeout,AbortController,
 fetch:async()=>{
  if(fetchMode==='fail')return {ok:false};
  if(fetchMode==='slow')return new Promise(resolve=>pending.push(resolve));
  return {ok:true,text:async()=>objSource};
 }};
vm.runInNewContext(source+'\nglobalThis.Viewer = CatalogViewer;',context);
const viewer = new context.Viewer();
elements.closeModal.events.click=()=>viewer.close();
const items = [{id:'a',nome:'Modelo A',genero:'MASCULINO',categoria:'TEEF',preview:'a.png',obj:'a.obj'},{id:'b',nome:'Modelo B',genero:'MASCULINO',categoria:'TEEF',preview:'b.png',obj:'b.obj'}];
const settle = async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
viewer.open(items[0],items);await settle();
assert.equal(viewer.current,items[0]);assert.equal(elements.modalTitle.textContent,'Modelo A');
assert.equal(viewer.renderer.domElement.hidden,false);assert.equal(elements.modal.classList.contains('open'),true);
const oldObject=viewer.object,oldScene=viewer.scene,oldFrame=frames.at(-1);
fetchMode='slow';const load=viewer.load(items[1]);await settle();
assert.equal(viewer.object,oldObject);assert.equal(viewer.scene,oldScene);assert.equal(frames.at(-1),oldFrame);
assert.equal(elements.modalTitle.textContent,'Modelo A');assert.equal(viewer.renderer.domElement.hidden,false);
assert(viewer.buttons.every(b=>b.disabled));
pending.shift()({ok:true,text:async()=>objSource});await load;
assert.equal(viewer.current,items[1]);assert.notEqual(viewer.object,oldObject);
assert.equal(frames.at(-1).scene,viewer.scene);assert.equal(elements.modalTitle.textContent,'Modelo B');assert(!viewer.buttons.some(b=>b.disabled));
fetchMode='fail';const goodObject=viewer.object;await viewer.load(items[0]);
assert.equal(viewer.object,goodObject);assert.equal(viewer.current,items[1]);assert.equal(viewer.renderer.domElement.hidden,false);
assert(elements.viewerLoading.textContent.includes('mantido'));
fetchMode='slow';const stale=viewer.load(items[0]);await settle();
fetchMode='ok';await viewer.load(items[1]);const latestObject=viewer.object;
pending.shift()({ok:true,text:async()=>objSource});await stale;
assert.equal(viewer.object,latestObject);assert.equal(viewer.current,items[1]);
for(const [width,height] of [[1000,560],[688,500],[350,420],[320,390]]) {
 wrap.clientWidth=width;wrap.clientHeight=height;viewer.resize();
 assert.equal(viewer.camera.aspect,width/height);
 assert(viewer.camera.position.length()>=viewer.controls.minDistance*(1-1e-10));
 assert(viewer.controls.maxDistance===3*viewer.controls.minDistance);
 assert(viewer.controls.enablePan===false);
}
viewer.setColor(0x6f35d6);assert.equal(viewer.material.color.getHex(),0x6f35d6);
viewer.setBrightness(2);assert.equal(viewer.lights[0].intensity,3.6);
viewer.reset();assert.equal(viewer.material.color.getHex(),0xd4d4d6);assert.equal(elements.brightnessRange.value,1);
// Exercise the existing shared keyboard trap without changing site.js.
const site = readFileSync('site.js','utf8');
const keyStart = site.indexOf('document.addEventListener("keydown"',site.indexOf('// Shared keyboard'));
const keyEnd = site.indexOf('\n})();',keyStart);
vm.runInNewContext(site.slice(keyStart,keyEnd),{document,dialogs:[elements.modal]});
const focusables=elements.modal.querySelectorAll('button,a[href],input,select,textarea').filter(el=>!el.disabled);
focusables[0].focus();let prevented=false;
handlers.keydown({key:'Tab',shiftKey:true,preventDefault:()=>prevented=true});
assert(prevented);assert.equal(document.activeElement,focusables.at(-1));
prevented=false;handlers.keydown({key:'Tab',shiftKey:false,preventDefault:()=>prevented=true});
assert(prevented);assert.equal(document.activeElement,focusables[0]);
fetchMode='slow';const closing=viewer.load(items[0]);await settle();const renderer=viewer.renderer;
handlers.keydown({key:'Escape'});assert.equal(viewer.active,false);assert.equal(renderer.disposed,true);
assert.equal(elements.modal.classList.contains('open'),false);assert.equal(document.activeElement,opener);
pending.shift()({ok:true,text:async()=>objSource});await closing;
assert.equal(viewer.active,false);assert.equal(elements.modal.classList.contains('open'),false);assert.equal(viewer.object,null);
assert.equal(elements.viewerLoading.getAttribute('role'),null);assert.equal(elements.viewerLoading.getAttribute('aria-live'),null);assert.equal(note.textContent,'Original note');assert.equal(document.body.style.overflow,'');assert.equal(elements.viewer3d.hidden,false);
fetchMode='ok';failGPU=true;viewer.open(items[0],items);await settle();
assert.equal(viewer.current,items[0]);assert(viewer.preview);assert.equal(viewer.fallback,true);assert.equal(elements.brightnessRange.disabled,true);
const initialPreview=viewer.preview;await viewer.load(items[1]);assert.notEqual(viewer.preview,initialPreview);assert.equal(viewer.current,items[1]);viewer.close();
assert.equal(elements.brightnessRange.disabled,false);assert.equal(viewer.preview,null);
failGPU=false;imageFailure=true;viewer.open(items[0],items);await settle();
assert.equal(viewer.current,null);assert.equal(elements.modal.classList.contains('open'),true);viewer.close();
console.log('PASS: first render, slow loading retains scene/canvas/title, atomic swap, failure retention, stale responses, Escape/close during load, focus restoration, resize at four viewport shapes, color/brightness/reset, static WebGL fallback and initial image failure. DOM and renderer adapters; no browser/WebGL rasterization.');

// Execute the unchanged search/filter function against all real catalogue entries.
const app = readFileSync('app.js','utf8');
const matcher = app.slice(app.indexOf('function itemMatches'),app.indexOf('function renderGrid'));
const filters={search:{value:''},gender:{value:''},category:{value:''}};
vm.runInNewContext(matcher+'\nglobalThis.match = itemMatches;',filters);
const catalog=JSON.parse(readFileSync('catalogo.json','utf8'));
for(const item of catalog) {
 for(const value of [item.id,item.nome,item.ydd,item.ytd,item.categoria,item.pasta_original]) {
  filters.search.value=value;assert(filters.match(item),`${item.id}: search ${value}`);
 }
 filters.search.value='';filters.gender.value=item.genero;filters.category.value=item.categoria;assert(filters.match(item));
 filters.gender.value=item.genero==='FEMININO'?'MASCULINO':'FEMININO';assert(!filters.match(item));filters.gender.value='';filters.category.value='';
}
filters.search.value='nonexistent_piece_987654';assert.equal(catalog.filter(filters.match).length,0);
console.log('PASS: name, ID, category, YDD, YTD, original folder, gender/category combinations and empty results for all 360 models.');
