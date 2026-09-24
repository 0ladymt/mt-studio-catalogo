import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const failures=[];
for (const file of ['app.js','mt-v5.js','catalogo-data.js','projetos-data.js']) {
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0) failures.push(file+': erro de sintaxe\n'+result.stderr);
}
const html=readFileSync('index.html','utf8');
for (const id of ['page-home','page-loja','page-catalogo','page-projetos','page-sobre','page-redes','mtHomeProjects','mtHeroPhoto']) {
  if(!html.includes('id="'+id+'"')) failures.push('Elemento ausente: '+id);
}
for (const file of ['style.css','mt-v5.css','mt-v5.js','assets/logo-borboleta.png','assets/mt-borboleta-street.svg','assets/mt-coroa.svg','assets/mt-pincelada.svg','assets/mt-doodles.svg']) {
  if(!existsSync(file)) failures.push('Arquivo da marca ausente: '+file);
}
const context={window:{}};
for(const file of ['projetos-data.js','catalogo-data.js']) vm.runInNewContext(readFileSync(file,'utf8'),context,{filename:file,timeout:3000});
const projects=context.window.PROJETOS_MT||[];
const catalog=context.window.CATALOGO_MT||[];
function localAsset(asset){
  const clean=String(asset||'').replaceAll('\\','/').replace(/^\.\//,'');
  if(clean&&!existsSync(clean)) failures.push('Arquivo referenciado e não encontrado: '+clean);
}
for(const project of projects) {
  localAsset(project.capa || project.fotos?.[0] || project.imagem);
  // Garante que a galeria não exiba miniaturas sem arquivo.
  for (const photo of project.fotos||[]) localAsset(photo);
}
for(const item of catalog) localAsset(item.preview);
console.log('Modelos catalogados:', catalog.length, '| Projetos:', projects.length);
if(failures.length){console.error(failures.slice(0,35).join('\n'));console.error('Total de inconsistências:',failures.length);process.exitCode=1}
else console.log('PASSOU: sintaxe, páginas, grafismos e caminhos das imagens.');
