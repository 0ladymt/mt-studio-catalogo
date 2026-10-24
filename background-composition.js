/* Global MT surface: a few large, approved compositions tied to meaningful
   content boundaries. Artwork never participates in layout or hit testing. */
(() => {
  const art = document.querySelector('.mt-background-art');
  const content = document.getElementById('content');
  const footer = document.querySelector('.mt-footer');
  if (!art || !content || !footer) return;

  const composition = (selector, edge, offset, asset, side, size, opacity, role) =>
    ({ selector, edge, offset, asset, side, size, opacity, role });
  const plans = {
    home: [
      composition('.mt-home-hero', 'top', 36, 'home-hero', 'left', 390, .56, 'opening'),
      composition('.mt-editorial--carousel', 'top', -90, 'home-closing', 'right', 360, .28, 'transition'),
      composition('.mt-cta', 'bottom', -510, 'home-butterflies', 'right', 390, .48, 'closing'),
    ],
    loja: [
      composition('.mt-shop > .mt-page-head', 'top', -70, 'loja-hero', 'left', 390, .52, 'opening'),
      composition('.mt-shop-preview', 'bottom', -520, 'loja-collection', 'right', 390, .40, 'closing'),
    ],
    catalogo: [
      composition('.hero', 'top', -54, 'catalogo-hero', 'left', 380, .48, 'opening'),
      composition('.catalog-results', 'middle', 0, 'catalogo-hero', 'right', 330, .22, 'transition'),
      composition('.catalog-results', 'bottom', -390, 'catalogo-closing', 'left', 390, .42, 'closing'),
    ],
    sobre: [
      composition('.mt-about', 'top', -42, 'sobre-hero', 'left', 390, .52, 'opening'),
      composition('.mt-about-mission', 'top', -270, 'sobre-butterfly', 'right', 340, .26, 'transition'),
      composition('.mt-about-mission', 'bottom', -500, 'sobre-closing', 'right', 390, .42, 'closing'),
    ],
    redes: [
      composition('.center-title', 'top', -70, 'redes-hero', 'left', 390, .48, 'opening'),
      composition('.social-list', 'bottom', -560, 'redes-closing', 'right', 390, .40, 'closing'),
    ],
    projetos: [
      composition('.center-title', 'top', -56, 'projetos-hero', 'left', 430, .52, 'opening'),
      composition('#projectsGrid .project-card:nth-child(4)', 'top', -170, 'projetos-signature', 'right', 330, .25, 'transition'),
      composition('#projectsGrid', 'bottom', -330, 'projetos-closing', 'left', 420, .40, 'closing'),
    ],
  };
  let frame = 0;
  let entries = [];
  let activeName = '';
  function boundary(anchor, edge) {
    const bounds = anchor.getBoundingClientRect();
    if (edge === 'middle') return bounds.top + scrollY + anchor.scrollHeight * .48;
    return bounds[edge] + scrollY;
  }
  function rebuild(page, name) {
    const layer = document.createElement('div');
    layer.className = 'mt-background-page';
    layer.dataset.page = name;
    entries = (plans[name] || []).flatMap(spec => {
      const anchor = page.querySelector(spec.selector);
      if (!anchor) return [];
      const element = document.createElement('div');
      element.className = `mt-background-composition mt-background-composition--${spec.side}`;
      element.dataset.role = spec.role;
      const image = document.createElement('img');
      image.src = `assets/backgrounds/groups/${spec.asset}.png`;
      image.alt = '';
      image.decoding = 'async';
      image.addEventListener('load', schedule, { once: true });
      element.append(image);
      layer.append(element);
      return [{ ...spec, anchor, element, image }];
    });
    art.replaceChildren(layer);
    activeName = name;
  }
  function place() {
    frame = 0;
    const page = content.querySelector('.page.active');
    const name = page?.id.replace('page-', '');
    if (!plans[name]) {
      art.replaceChildren();
      entries = [];
      activeName = '';
      return;
    }
    if (activeName !== name) rebuild(page, name);
    const compact = innerWidth <= 760;
    const tablet = innerWidth <= 1100;
    const pageEnd = footer.getBoundingClientRect().top + scrollY;
    const pageStart = document.querySelector('.topbar')?.getBoundingClientRect().height || 0;
    art.style.height = `${pageEnd}px`;
    entries.forEach(entry => {
      const responsiveScale = compact ? .56 : tablet ? .74 : Math.min(1.22, Math.max(.94, innerWidth / 1600));
      const width = entry.size * responsiveScale;
      const ratio = entry.image.naturalHeight / entry.image.naturalWidth || 1;
      const height = width * ratio;
      const rawTop = boundary(entry.anchor, entry.edge) + entry.offset * responsiveScale;
      const top = Math.max(pageStart + 8, Math.min(rawTop, pageEnd - height - 20));
      const opacity = entry.opacity * (compact ? .58 : tablet ? .72 : 1);
      entry.element.style.cssText = `--art-top:${top}px;--art-width:${width}px;--art-height:${height}px;--art-opacity:${opacity}`;
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(place); }
  window.addEventListener('mt:page', () => { activeName = ''; schedule(); });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule, { once: true });
  const resize = new ResizeObserver(schedule);
  resize.observe(content);
  resize.observe(footer);
  const grid = document.getElementById('grid');
  if (grid) new MutationObserver(schedule).observe(grid, { childList: true });
  document.fonts?.ready.then(schedule);
  schedule();
})();
