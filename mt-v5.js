/* MT Studio: home/editorial e intro sem alterar o visualizador 3D. */
(() => {
  const intro = document.createElement('div');
  intro.id = 'mtIntro';
  intro.className = 'mt-intro';
  intro.setAttribute('role','status');
  intro.setAttribute('aria-label','Abertura da MT Studio');
  // A marca surge de traços desenhados na tela; não exibe PNG da borboleta.
  intro.innerHTML = `<div class="mt-intro__center"><div class="mt-intro__art">
    <svg class="mt-intro__street" viewBox="0 0 600 430" role="img" aria-label="Borboleta street sendo pichada em roxo">
      <g class="mt-intro__lines" fill="none" stroke="#c238ee" stroke-linejoin="round" stroke-linecap="round">
        <path d="M295 211 C250 144 209 79 135 54 C145 115 171 159 224 194 C178 159 108 153 70 196 C112 243 181 252 256 225" />
        <path d="M305 211 C350 144 391 79 465 54 C455 115 429 159 376 194 C422 159 492 153 530 196 C488 243 419 252 344 225" />
        <path d="M289 225 C246 227 203 253 164 306 L132 356 C208 362 269 311 295 246" />
        <path d="M311 225 C354 227 397 253 436 306 L468 356 C392 362 331 311 305 246" />
        <path d="M295 195 L295 306 M305 195 L305 306 M295 197 Q277 160 252 143 M305 197 Q323 160 348 143"/>
        <path d="M218 129 L269 208 M382 129 L331 208 M141 196 L249 218 M459 196 L351 218 M180 324 L272 245 M420 324 L328 245"/>
        <path d="M164 306 L153 381 M196 329 L194 367 M440 306 L448 384 M412 330 L413 360 M295 303 L295 391"/>
      </g><g class="mt-intro__splatter" fill="#c238ee"><circle cx="86" cy="124" r="4"/><circle cx="111" cy="286" r="3"/><circle cx="490" cy="121" r="5"/><circle cx="502" cy="278" r="3"/><circle cx="254" cy="366" r="3"/><circle cx="351" cy="390" r="4"/></g>
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