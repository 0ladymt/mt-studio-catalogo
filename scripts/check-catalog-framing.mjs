import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const threeURL = pathToFileURL(resolve('assets/vendor/three/three.module.js')).href;
const THREE = await import(threeURL);
const source = readFileSync('assets/vendor/three/addons/loaders/OBJLoader.js','utf8').replace(/from ['"]three['"]/g, `from '${threeURL}'`);
const {OBJLoader} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const viewer = readFileSync('catalog-viewer.js','utf8');
const context = {THREE};
vm.runInNewContext(viewer.slice(viewer.indexOf('export function frameObject'),viewer.indexOf('function disposeObject')).replaceAll('export ', ''),context);
const catalog = JSON.parse(readFileSync('catalogo.json','utf8'));
assert.equal(catalog.length,360);
const aspects = [.35,.42,.7,1,1.8,2.6];
let maxProjection = 0, smallest = Infinity, largest = 0;
for (const item of catalog) {
  const object = new OBJLoader().parse(readFileSync(item.obj,'utf8'));
  const radius = context.frameObject(object);
  smallest = Math.min(smallest,radius); largest = Math.max(largest,radius);
  const vertex = new THREE.Vector3();
  object.traverse(node => {
    const p = node.geometry?.attributes.position;
    if (!p) return;
    for (let i=0;i<p.count;i++) {
      vertex.fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);
      assert(vertex.length() <= radius*(1+1e-7),`${item.id}: vertex outside framing sphere`);
    }
  });
  for (const aspect of aspects) {
    const distance = context.fitDistance(radius,aspect);
    const projectedSphere = Math.tan(Math.asin(radius/distance)) / Math.min(Math.tan(THREE.MathUtils.degToRad(18)),Math.tan(THREE.MathUtils.degToRad(18))*aspect);
    assert(projectedSphere < .9,`${item.id}: insufficient rotation margin`);
    maxProjection = Math.max(maxProjection,projectedSphere);
    assert(Math.abs(context.fitDistance(radius*1000,aspect)/1000-distance)<distance*1e-10,'Unit-independent fitting');
  }
  object.traverse(node => node.geometry?.dispose());
}
console.log(JSON.stringify({models:catalog.length,aspects,smallest,largest,maxProjection,rotation:'Entire circumsphere: all yaw and pitch angles',pass:true},null,2));
