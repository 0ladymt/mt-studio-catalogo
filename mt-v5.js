/* MT Studio: home/editorial e intro sem alterar o visualizador 3D. */
(() => {
  const intro = document.createElement('div');
  intro.id = 'mtIntro';
  intro.className = 'mt-intro';
  intro.setAttribute('role','status');
  intro.setAttribute('aria-label','Abertura da MT Studio');
  intro.innerHTML = '<div class="mt-intro__center"><div class="mt-intro__art"><img class="mt-intro__graffiti" src="assets/mt-borboleta-street.svg" alt="Borboleta graffiti da MT Studio"><span class="mt-intro__spray" aria-hidden="true"></span><span class="mt-intro__spray mt-intro__spray--two" aria-hidden="true"></span></div><div class="mt-intro__logo">MT STUDIO</div><div class="mt-intro__tag">IDEIAS QUE VIRAM IDENTIDADE</div></div><button class="mt-intro__skip" type="button">Pular abertura ↗</button>';
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
  const path = value => String(value || '').replaceAll('\\','/').replace(/^\.?\//,'').split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
  const RAW = 'https://raw.githubusercontent.com/0ladymt/mt-studio-catalogo/desenvolvimento-loja-mt/';
  const cover = p => path(p?.capa || p?.fotos?.[0] || p?.imagem);
  const fallback = img => {
    if (!img) return;
    img.addEventListener('error', () => {
      if (img.dataset.mtLocalFallback === '1') { img.classList.add('mt-image-missing'); return; }
      img.dataset.mtLocalFallback='1';
      const url=img.getAttribute('src')||'';
      if(url.startsWith(RAW)) img.src=url.slice(RAW.length);
      else if(url && !/^https?:/i.test(url)) img.src=RAW+url.replace(/^\//,'');
      else img.classList.add('mt-image-missing');
    });
  };
  const use = (id,src) => { const img=document.getElementById(id); if(img && src) { fallback(img); img.src=RAW+src; } };
  use('mtHeroPhoto',cover(projects.find(p=>/kings/i.test(p.titulo)) || projects[0]));
  use('mtReadyPhoto',cover(projects.find(p=>/shadows/i.test(p.titulo)) || projects[1] || projects[0]));
  use('mtCustomPhoto',cover(projects.find(p=>/shelby/i.test(p.titulo)) || projects[2] || projects[0]));
  const gallery=document.getElementById('mtHomeProjects');
  if(gallery) {
    projects.slice(0,3).forEach((p,i) => {
      const a=document.createElement('a'); a.href='#projetos'; a.className='mt-project'; a.dataset.pageLink='projetos';
      const frame=document.createElement('div'); frame.className='mt-project__image';
      const img=document.createElement('img'); fallback(img); img.src=RAW+cover(p); img.alt=p.titulo || 'Projeto MT Studio'; img.loading='lazy'; frame.append(img);
      const meta=document.createElement('div'); meta.className='mt-project__meta';
      const title=document.createElement('h3'); title.textContent=p.titulo || 'Projeto MT Studio';
      const arrow=document.createElement('span'); arrow.textContent='↗';meta.append(title,arrow);a.append(frame,meta);gallery.append(a);
    });
  }
  document.querySelectorAll('#projectsGrid img').forEach(fallback);
  const photo=document.getElementById('mtRafaJoy');
  const human=document.getElementById('mtHuman');
  if(photo && human){
    photo.addEventListener('load',()=>{human.hidden=false;});
    photo.addEventListener('error',()=>{human.hidden=true;});
    if(photo.complete && photo.naturalWidth) human.hidden=false;
  }
})();