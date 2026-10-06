/* Decorative placement only: anchors follow real sections and dynamic content. */
(() => {
  const art = document.querySelector('.mt-background-art');
  const content = document.getElementById('content');
  const footer = document.querySelector('.mt-footer');
  if (!art || !content || !footer) return;
  const anchors = {
    home: { opening: '.mt-home-hero', development: '#mtHomeProjects' },
    loja: { opening: '.mt-page-head' },
    catalogo: { opening: '.hero' },
    sobre: { opening: '.mt-about', development: '.mt-about-grid' },
    redes: { opening: '.center-title', development: '.social-list' },
    projetos: { opening: '.center-title', development: '#projectsGrid .project-card:nth-child(4)' },
  };
  let frame = 0;
  const documentTop = el => el.getBoundingClientRect().top + window.scrollY;
  function place() {
    frame = 0;
    const page = content.querySelector('.page.active');
    const name = page?.id.replace('page-', '');
    const groupSet = art.querySelector(`[data-page="${name}"]`);
    if (!groupSet || innerWidth <= 1000) return;
    const end = documentTop(footer);
    art.style.height = `${end}px`;
    const opening = groupSet.querySelector('[data-region="opening"]');
    const closing = groupSet.querySelector('[data-region="closing"]');
    for (const group of groupSet.children) group.hidden = false;
    const closingStart = closing ? end - closing.getBoundingClientRect().height - 20 : end;
    let previousEnd = 0;
    for (const group of groupSet.children) {
      const role = group.dataset.region;
      const height = group.getBoundingClientRect().height;
      let top;
      if (role === 'closing') {
        // Finish against the footer boundary, never as a percentage of body height.
        top = end - height - 20;
      } else {
        const anchor = page.querySelector(anchors[name]?.[role] || ':scope');
        if (!anchor) { group.hidden = true; continue; }
        top = documentTop(anchor) + (role === 'opening' ? -48 : 40);
        if (role === 'development' && name === 'redes') top += anchor.offsetHeight * .35;
      }
      // Keep distinct moments even on shorter/filter-reduced pages.
      const start = Math.max(110, top);
      const overlaps = role === 'development' && (start < previousEnd + 56 || start + height > closingStart - 56);
      group.hidden = overlaps;
      if (!overlaps) {
        group.style.setProperty('--art-top', `${start}px`);
        previousEnd = start + height;
      }
    }
    if (opening) opening.hidden = false;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(place); }
  window.addEventListener('mt:page', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule, { once: true });
  const resize = new ResizeObserver(schedule);
  resize.observe(content);
  resize.observe(footer);
  document.fonts?.ready.then(schedule);
  schedule();
})();
