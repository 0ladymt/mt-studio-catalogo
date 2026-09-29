const {createCanvas}=require('@napi-rs/canvas'),vm=require('vm'),fs=require('fs'),assert=require('assert');
const code=fs.readFileSync('intro.js','utf8');
function run(w,h,reduced=false){
 let now=0,id=0,queue=new Map(),root=null,focus=null;
 const classes=()=>({set:new Set(),add(x){this.set.add(x)},contains(x){return this.set.has(x)}});
 const listeners={};const replay={inert:false,tagName:'BUTTON',addEventListener(k,fn){this[k]=fn},focus(){focus=this}};
 const body={children:[replay],style:{overflow:''},append(el){root=el;this.children.push(el)}};
 const media={matches:reduced,addEventListener(k,fn){this.change=fn},removeEventListener(){this.change=null}};
 function createElement(tag){if(tag==='canvas')return createCanvas(1,1);const canvas=createCanvas(1,1),button={focus(){focus=this}};return {classList:classes(),setAttribute(){},querySelector(s){return s==='canvas'?canvas:button},remove(){body.children=body.children.filter(x=>x!==this);this.removed=true},canvas,button};}
 const document={body,activeElement:replay,createElement,querySelector(){return replay},addEventListener(k,f){listeners[k]=f},removeEventListener(k){delete listeners[k]}};
 const context={matchMedia:()=>media,document,innerWidth:w,innerHeight:h,devicePixelRatio:1,location:{hash:''},sessionStorage:{getItem(){return null},setItem(){}},performance:{now:()=>now},requestAnimationFrame(fn){queue.set(++id,{time:now+32,fn:()=>fn(now)});return id},cancelAnimationFrame(i){queue.delete(i)},setTimeout(fn,ms){queue.set(++id,{time:now+ms,fn});return id},clearTimeout(i){queue.delete(i)},window:{addEventListener(){},removeEventListener(){}},console};
 vm.runInNewContext(code,context);
 function advance(t){while(true){const entry=[...queue].filter(([id,e])=>e.time<=t).sort((a,b)=>a[1].time-b[1].time)[0];if(!entry)break;queue.delete(entry[0]);now=entry[1].time;entry[1].fn()}now=t;}
 return {advance,get root(){return root},body,replay,media,listeners,get focus(){return focus}};
}
fs.mkdirSync('/tmp/mt-intro-qa',{recursive:true});
const q=run(1366,768);assert(q.root);assert(q.replay.inert);
for(const t of [1600,3800,7104,7600,8100]){q.advance(t);fs.writeFileSync('/tmp/mt-intro-qa/frame-'+t+'.png',q.root.canvas.toBuffer('image/png'));if(t<7760)assert(!q.root.classList.contains('is-signed'));else assert(q.root.classList.contains('is-signed'));}
q.advance(9800);assert(q.root.removed);assert(!q.replay.inert);assert.equal(q.body.style.overflow,'');assert.equal(q.focus,q.replay);
const mobile=run(390,844);mobile.advance(7600);fs.writeFileSync('/tmp/mt-intro-qa/mobile.png',mobile.root.canvas.toBuffer('image/png'));mobile.root.button.onclick();mobile.advance(8200);assert(mobile.root.removed);
const esc=run(1366,768);esc.advance(1000);esc.listeners.keydown({key:'Escape'});esc.advance(1600);assert(esc.root.removed);
const reduced=run(390,844,true);assert(!reduced.root);reduced.replay.click();assert(!reduced.root);
const change=run(390,844);change.media.matches=true;change.media.change();change.advance(600);assert(change.root.removed);
assert(!/graffiti\.(svg|png)|reference\.decode|clip\(|getImageData/.test(code));
console.log('PASSOU: construção progressiva, intervalo, encerramento, pular, Escape, redução de movimento, foco e inert. Canvas desktop/mobile gerados. Simulação DOM, não navegador.');
