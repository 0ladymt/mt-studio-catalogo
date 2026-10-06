/* Decorative placement only. Each art group belongs to a named content boundary,
   never to a percentage or interval of page height. Artwork/assets stay intact. */
(() => {
  const art = document.querySelector('.mt-background-art');
  const content = document.getElementById('content');
  const footer = document.querySelector('.mt-footer');
  if (!art || !content || !footer) return;
  const anchors = {
    home: {
      opening: { selector: '.mt-home-hero', edge: 'top', align: 'start' },
      development: { selector: '.mt-section:has(#mtHomeProjects)', edge: 'bottom', align: 'center' },
      closing: { selector: '.mt-cta', edge: 'bottom', align: 'end' },
    },
    loja: {
      opening: { selector: '.mt-shop > .mt-page-head', edge: 'top', align: 'start' },
      closing: { selector: '.mt-shop-preview', edge: 'bottom', align: 'end' },
    },
    catalogo: {
      opening: { selector: '.hero', edge: 'top', align: 'start' },
      closing: { selector: '.catalog-results', edge: 'bottom', align: 'end' },
    },
    sobre: {
      opening: { selector: '.mt-about', edge: 'top', align: 'start' },
      development: { selector: '.mt-about-grid', edge: 'bottom', align: 'center' },
      closing: { selector: '.mt-about-mission', edge: 'bottom', align: 'end' },
    },
    redes: {
      opening: { selector: '.center-title', edge: 'top', align: 'start' },
      development: { selector: '.social-row:nth-child(4)', edge: 'top', align: 'center' },
      closing: { selector: '.social-list', edge: 'bottom', align: 'end' },
    },
    projetos: {
      opening: { selector: '.center-title', edge: 'top', align: 'start' },
      development: { selector: '#projectsGrid .project-card:nth-child(4)', edge: 'bottom', align: 'center' },
      closing: { selector: '#projectsGrid .project-card:last-child', edge: 'bottom', align: 'end' },
    },
  };
  let frame = 0;
  function place() {
    frame = 0;
    const page = content.querySelector('.page.active');
    const name = page?.id.replace('page-', '');
    const groupSet = art.querySelector(`[data-page="${name}"]`);
    if (!groupSet || innerWidth <= 1000) return;
    const end = footer.getBoundingClientRect().top + scrollY;
    const headerEnd = document.querySelector('.topbar').getBoundingClientRect().height + 16;
    art.style.height = `${end}px`;
    const placements = [];
    for (const group of groupSet.children) {
      group.hidden = false;
      const role = group.dataset.region;
      const plan = anchors[name]?.[role];
      const anchor = plan && page.querySelector(plan.selector);
      if (!anchor) { group.hidden = true; continue; }
      const bounds = anchor.getBoundingClientRect();
      const height = group.getBoundingClientRect().height;
      const boundary = bounds[plan.edge] + scrollY;
      let top = boundary - 32;
      if (plan.align === 'center') top = boundary - height / 2;
      if (plan.align === 'end') top = Math.min(boundary + 12, end - 24) - height;
      top = Math.max(headerEnd, top);
      group.style.setProperty('--art-top', `${top}px`);
      group.dataset.anchor = plan.selector;
      placements.push({ group, role, top, bottom: top + height });
    }
    const opening = placements.find(p => p.role === 'opening');
    const closing = placements.find(p => p.role === 'closing');
    // Short/filter-reduced pages need fewer marks, not stacked compositions.
    if (opening && closing && closing.top < opening.bottom + 32) closing.group.hidden = true;
    for (const p of placements.filter(p => p.role === 'development')) {
      p.group.hidden = Boolean((opening && p.top < opening.bottom + 56) ||
        (closing && !closing.group.hidden && p.bottom > closing.top - 56));
    }
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
