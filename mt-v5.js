/* MT Studio: home/editorial e intro sem alterar o visualizador 3D. */
(() => {
  const intro = document.createElement('div');
  intro.id = 'mtIntro';
  intro.className = 'mt-intro';
  intro.setAttribute('role','status');
  intro.setAttribute('aria-label','Abertura da MT Studio');
  // A borboleta vetorial oficial é revelada por passadas de tinta, não por PNG nem por contorno genérico.
  intro.innerHTML = `<div class="mt-intro__center"><div class="mt-intro__art">
    <svg class="mt-intro__street mt-intro__street--brand" viewBox="0 0 700 590" role="img" aria-label="Marca street da MT Studio sendo pintada">
      <defs>
        <mask id="mtPaintReveal" maskContentUnits="userSpaceOnUse">
          <rect class="mt-intro__paint-pass" x="-15" y="-15" width="0" height="620" fill="white"/>
          <g class="mt-intro__paint-spray" fill="white">
            <circle cx="42" cy="121" r="3"/><circle cx="69" cy="174" r="2"/><circle cx="104" cy="286" r="4"/>
            <circle cx="119" cy="475" r="3"/><circle cx="161" cy="79" r="2"/><circle cx="244" cy="507" r="3"/>
            <circle cx="352" cy="57" r="2"/><circle cx="468" cy="491" r="4"/><circle cx="586" cy="111" r="3"/>
          </g>
        </mask>
      </defs>
      <image class="mt-intro__brand-art" href="assets/mt-borboleta-street.svg" x="0" y="0" width="700" height="590" mask="url(#mtPaintReveal)" preserveAspectRatio="xMidYMid meet"/>
      <g class="mt-intro__spray-cloud" fill="#bb35ed" aria-hidden="true">
        <circle cx="0" cy="90" r="3"/><circle cx="11" cy="160" r="2"/><circle cx="-9" cy="251" r="4"/>
        <circle cx="13" cy="343" r="2"/><circle cx="-13" cy="425" r="3"/><circle cx="20" cy="500" r="2"/>
      </g>
    </svg></div><div class="mt-intro__logo">MT STUDIO</div><div class="mt-intro__tag">IDEIAS QUE VIRAM IDENTIDADE</div></div><button class="mt-intro__skip" type="button">Pular abertura ↗</button>`;
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
  use('mtShopPhoto',cover(projects.find(p=>/shadows/i.test(p.titulo)) || projects.find(p=>/kings/i.test(p.titulo)) || projects[0]));
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
  // A fotografia já existe no acervo. Não esconder a seção por eventos de load ou cache.
  for (const id of ['mtAboutRafaJoy','mtRafaJoy']) {
    const img = document.getElementById(id);
    if (img) {
      img.src = 'assets/rafa-joy-foto.jpg?v=3';
      img.loading = 'eager';
      img.decoding = 'async';
    }
  }
  document.getElementById('mtAboutPortrait')?.removeAttribute('hidden');
  document.getElementById('mtHuman')?.removeAttribute('hidden');
})();