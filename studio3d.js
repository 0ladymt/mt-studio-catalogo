import * as THREE from 'three';
export const STUDIO_BACKGROUND=0x27272e;
export function smoothStudioNormals(source){
 const geometry=source.index?source.toNonIndexed():source;
 geometry.computeBoundingBox();
 const span=geometry.boundingBox.getSize(new THREE.Vector3());
 const epsilon=Math.max(span.x,span.y,span.z,1e-6)*1e-5,p=geometry.attributes.position,groups=new Map(),faces=[];
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);const raw=b.sub(a).cross(c.sub(a));faces.push({raw:raw.clone(),unit:raw.clone().normalize()});for(let k=0;k<3;k++){const j=i+k,key=[p.getX(j),p.getY(j),p.getZ(j)].map(v=>Math.round(v/epsilon)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(j);}}
 const normals=new Float32Array(p.count*3),limit=Math.cos(65*Math.PI/180);
 for(const corners of groups.values())for(const corner of corners){const base=faces[Math.floor(corner/3)],sum=new THREE.Vector3();for(const other of corners){const f=faces[Math.floor(other/3)];if(base.unit.dot(f.unit)>=limit)sum.add(f.raw);}if(!sum.lengthSq())sum.copy(base.unit);sum.normalize().toArray(normals,corner*3);}
 geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));return geometry;
}
export function studioMaterial(){return new THREE.MeshStandardMaterial({color:0xd4d4d6,side:THREE.DoubleSide,roughness:1,metalness:0});}
export function setupStudio(renderer,scene){renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setClearColor(STUDIO_BACKGROUND,1);scene.background=new THREE.Color(STUDIO_BACKGROUND);scene.add(new THREE.HemisphereLight(0xffffff,0x9d9dab,1.1));return [[1.8,3,4,5],[.8,-3,2,3],[.4,0,5,1],[.65,0,2,-4]].map(([power,x,y,z])=>{const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(x,y,z);scene.add(light);return light;});}
