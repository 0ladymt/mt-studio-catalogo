import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const threeURL=pathToFileURL(resolve('assets/vendor/three/three.module.js')).href;
const THREE=await import(threeURL);
async function localModule(file){const source=readFileSync(file,'utf8').replace(/from\s*['"]three['"]/g,`from '${threeURL}'`);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
const {smoothStudioNormals}=await localModule('studio3d.js');
const {OBJLoader}=await localModule('assets/vendor/three/addons/loaders/OBJLoader.js');
const cube=smoothStudioNormals(new THREE.BoxGeometry().toNonIndexed());
for(let i=0;i<cube.attributes.normal.count;i++){const n=new THREE.Vector3().fromBufferAttribute(cube.attributes.normal,i);assert.equal([n.x,n.y,n.z].filter(v=>Math.abs(v)>1e-6).length,1,'Hard edges must remain hard');}
const catalog=JSON.parse(readFileSync('catalogo.json','utf8')),loader=new OBJLoader();let meshes=0;
for(const item of catalog){const object=loader.parse(readFileSync(item.obj,'utf8'));object.traverse(n=>{if(!n.isMesh)return;const positions=n.geometry.attributes.position.array.slice(),uv=n.geometry.attributes.uv?.array.slice();const result=smoothStudioNormals(n.geometry);assert.deepEqual(result.attributes.position.array,positions,item.id+' positions');if(uv)assert.deepEqual(result.attributes.uv.array,uv,item.id+' UVs');assert(result.attributes.normal.array.every(Number.isFinite),item.id+' normals');result.dispose();meshes++;});}
console.log(`PASSOU: ${catalog.length} modelos, ${meshes} malhas; posições e UVs intactos, normais finitas, arestas preservadas.`);
