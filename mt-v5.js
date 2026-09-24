/* MT Studio: home/editorial e intro sem alterar o visualizador 3D. */
(() => {
  const intro = document.createElement('div');
  intro.id = 'mtIntro';
  intro.className = 'mt-intro';
  intro.setAttribute('role','status');
  intro.setAttribute('aria-label','Abertura da MT Studio');
  intro.innerHTML = '<div class="mt-intro__center"><svg class="mt-intro__butterfly" viewBox="0 0 520 360" aria-hidden="true"><defs><filter id="mtInk"><feTurbulence baseFrequency=".025" numOctaves="3" seed="8" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="7"/></filter></defs><g filter="url(#mtInk)"><path d="M258 184 C208 118 145 38 91 48 C62 56 83 154 177 189 C102 170 52 202 75 244 C95 279 178 268 255 201"/><path d="M262 184 C312 118 375 38 429 48 C458 56 437 154 343 189 C418 170 468 202 445 244 C425 279 342 268 265 201"/><path d="M255 196 C227 247 205 289 154 303 C159 255 188 223 255 196"/><path d="M265 196 C293 247 315 289 366 303 C361 255 332 223 265 196"/><path d="M258 175 C249 136 221 105 207 98 M264 175 C274 134 300 105 316 98"/><path d="M260 162 Q254 200 260 234"/></g></svg><div class="mt-intro__logo">MT STUDIO</div><div class="mt-intro__tag">IDEIAS QUE VIRAM IDENTIDADE</div></div><button class="mt-intro__skip" type="button">Pular abertura ↗</button>';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isHome = !location.hash || location.hash === '#home';
  if (isHome && !reduced) {
    document.body.prepend(intro);
    document.body.style.overflow = 'hidden';
    let finished = false;
    const finish = () => {
      if(finished) return;
      finished = true;
      intro.classList.add('is-gone');
      document.body.style.overflow = '';
      setTimeout(() => intro.remove(), 550);
    };
    intro.querySelector('button').addEventListener('click', finish);
    setTimeout(finish, 2750);
    window.addEventListener('pagehide', finish, {once:true});
  }
  const projects = Array.isArray(window.PROJETOS_MT) ? window.PROJETOS_MT : [];
  const items = Array.isArray(window.CATALOGO_MT) ? window.CATALOGO_MT : [];
  const path = value => String(value || '').replaceAll('\\','/').replace(/^\.?\//,'').split('/').map(encodeURIComponent).join('/');
  const cover = p => path(p?.capa || p?.fotos?.[0] || p?.imagem);
  const use = (id,src) => { const img=document.getElementById(id); if(img && src) img.src=src; };
  use('mtHeroPhoto',cover(projects.find(p=>/kings/i.test(p.titulo)) || projects[0]));
  use('mtReadyPhoto',cover(projects.find(p=>/shadows/i.test(p.titulo)) || projects[1] || projects[0]));
  use('mtCustomPhoto',cover(projects.find(p=>/shelby/i.test(p.titulo)) || projects[2] || projects[0]));
  use('mtCatalogPhoto',path(items.find(i=>i.preview)?.preview));
  const gallery=document.getElementById('mtHomeProjects');
  if(gallery) {
    projects.slice(0,3).forEach((p,i) => {
      const a=document.createElement('a'); a.href='#projetos'; a.className='mt-project'; a.dataset.pageLink='projetos';
      const frame=document.createElement('div'); frame.className='mt-project__image';
      const img=document.createElement('img'); img.src=cover(p); img.alt=p.titulo || 'Projeto MT Studio'; img.loading='lazy'; frame.append(img);
      const meta=document.createElement('div'); meta.className='mt-project__meta';
      const title=document.createElement('h3'); title.textContent=p.titulo || 'Projeto MT Studio';
      const arrow=document.createElement('span'); arrow.textContent='↗';meta.append(title,arrow);a.append(frame,meta);gallery.append(a);
    });
  }
  const photo=document.getElementById('mtRafaJoy');
  const human=document.getElementById('mtHuman');
  if(photo && human){
    photo.addEventListener('load',()=>{human.hidden=false;});
    photo.addEventListener('error',()=>{human.hidden=true;});
    if(photo.complete && photo.naturalWidth) human.hidden=false;
  }
})();