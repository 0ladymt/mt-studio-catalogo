/* Only approved, already-extracted ink. Positions follow actual sections and
   rendered catalogue rows, never a fraction of total document height. */
(() => {
  const art = document.querySelector('.mt-background-art');
  const content = document.getElementById('content');
  const footer = document.querySelector('.mt-footer');
  if (!art || !content || !footer) return;
  // selector, boundary, offset, asset, side, native width, intensity, inset, angle
  const ink = (selector, edge, offset, asset, side, width, opacity, inset = -10, angle = 0) =>
    ({ selector, edge, offset, asset, side, width, opacity, inset, angle });
  const plans = {
    home: [
      ink('.mt-home-hero','top',22,'home-brush','left',170,.78,-46),
      ink('.mt-home-hero','top',82,'home-crown','left',68,.88,3,-9),
      ink('.mt-home-hero','bottom',-220,'home-butterfly-purple','right',120,.78,-32),
      ink('.mt-strip','bottom',24,'home-heart','left',31,.5,12),
      ink('.mt-split','top',110,'home-brush','right',105,.38,-28),
      ink('.mt-split','bottom',-68,'home-butterfly-white','left',66,.52,-15),
      ink('.mt-section:has(#mtHomeProjects)','top',55,'home-brush','left',130,.48,-50),
      ink('#mtHomeProjects','bottom',-220,'home-heart','right',32,.45,9),
      ink('.mt-editorial--carousel','top',65,'home-brush','right',115,.48,-34),
      ink('.mt-editorial--carousel','bottom',-60,'home-crown','left',48,.45,-8,-12),
      ink('#mtHuman','top',108,'home-butterfly-white','right',68,.58,-8),
      ink('#mtHuman','bottom',-110,'home-brush','left',135,.48,-45),
      ink('.mt-cta','top',25,'home-heart','left',34,.5,10),
      ink('.mt-cta','bottom',-330,'home-brush','right',170,.66,-44),
      ink('.mt-cta','bottom',-220,'home-butterfly-purple','right',110,.85,-26),
      ink('.mt-cta','bottom',-100,'home-butterfly-white','left',78,.7,-15),
    ],
    loja: [
      ink('.mt-page-head','top',18,'loja-crown','left',65,.78,1,-7),
      ink('.mt-page-head','bottom',-55,'loja-stroke','right',110,.45,-35),
      ink('.shop-collections','bottom',-45,'loja-heart','left',31,.45,12),
      ink('.mt-shop-preview','top',95,'loja-stroke','left',94,.35,-30),
      ink('.mt-shop-preview','bottom',-280,'loja-heart','right',34,.42,10),
      ink('.mt-shop-preview','bottom',-140,'loja-stroke','right',145,.55,-50),
    ],
    sobre: [
      ink('.mt-about','top',22,'sobre-brush','left',162,.75,-55),
      ink('.mt-about','top',150,'sobre-butterfly','left',80,.78,-18),
      ink('.mt-about','bottom',-110,'sobre-heart','right',35,.48,12),
      ink('.mt-about-grid','top',75,'sobre-brush','right',110,.4,-35),
      ink('.mt-about-grid','bottom',25,'sobre-butterfly','left',58,.48,-15),
      ink('.mt-about-steps','bottom',-90,'sobre-heart','right',30,.42,8),
      ink('.mt-about-mission','top',-25,'sobre-brush','left',142,.62,-55),
      ink('.mt-about-mission','bottom',-60,'sobre-butterfly','right',75,.65,-14),
    ],
    redes: [
      ink('.center-title','top',15,'redes-heart','left',64,.78,-10),
      ink('.center-title','bottom',-50,'redes-spark','right',46,.65,10),
      ink('.social-row:nth-child(4)','top',28,'redes-spark','left',36,.38,6),
      ink('.social-list','bottom',-140,'redes-butterfly','right',80,.76,-18),
      ink('.social-list','bottom',-40,'redes-heart','left',48,.6,-8),
    ],
    projetos: [
      ink('.center-title','top',10,'projetos-brush','left',164,.7,-55),
      ink('.center-title','top',85,'projetos-crown','left',84,.83,-20,-8),
      ink('#projectsGrid .project-card:first-child','bottom',-175,'projetos-butterfly','right',92,.68,-20),
      ink('#projectsGrid .project-card:nth-child(2)','top',55,'projetos-heart','left',34,.5,9),
      ink('#projectsGrid .project-card:nth-child(4)','top',30,'projetos-brush','right',132,.45,-45),
      ink('#projectsGrid .project-card:nth-child(6)','top',25,'projetos-heart','left',32,.45,11),
      ink('#projectsGrid .project-card:last-child','bottom',-185,'projetos-brush','left',170,.66,-52),
      ink('#projectsGrid .project-card:last-child','bottom',-95,'projetos-crown','right',85,.72,-20,7),
    ],
    catalogo: [
      ink('.hero','top',25,'catalogo-brush','left',140,.62,-45),
      ink('.hero','bottom',-80,'catalogo-drip','right',45,.5,9),
      ink('.catalog-results','bottom',-220,'catalogo-brush','right',148,.6,-45),
      ink('.catalog-results','bottom',-100,'catalogo-drip','left',52,.6,5),
    ],
  };
  let frame = 0, dirty = true, entries = [];
  const source = asset => `assets/backgrounds/elements/${asset}.png`;
  function catalogueAnchors(page) {
    const cards = [...page.querySelectorAll('#grid > .card')];
    const rows = [];
    let previous = '';
    cards.forEach(card => {
      const key = [...card.querySelectorAll('.tag')].map(e => e.textContent).join('/');
      const top = card.offsetTop;
      let row = rows.find(r => r.top === top);
      if (!row) { row = { top, card, categoryStart: false }; rows.push(row); }
      if (key !== previous) row.categoryStart = true;
      previous = key;
    });
    // Category changes provide the main beats. Long categories receive quieter
    // support at real card-row boundaries with irregular breathing intervals.
    const selected = [];
    let next = 3, sequence = 0;
    const breathing = [5,3,6,4];
    rows.forEach((row, i) => {
      if (i < 2 || i >= rows.length - 2) return;
      if (row.categoryStart || i >= next) {
        const n = selected.length;
        selected.push({ ...ink('', 'top', n % 3 === 0 ? 70 : 20,
          n % 3 === 1 ? 'catalogo-drip' : 'catalogo-brush',
          n % 2 ? 'right' : 'left', n % 3 === 1 ? 38 : 92,
          row.categoryStart ? .48 : .3, n % 3 === 1 ? 10 : -30), anchor: row.card });
        next = i + breathing[sequence++ % breathing.length];
      }
    });
    return selected;
  }
  function rebuild(page, name) {
    const layer = document.createElement('div');
    layer.className = 'mt-background-page'; layer.dataset.page = name;
    const specs = [...(plans[name] || []), ...(name === 'catalogo' ? catalogueAnchors(page) : [])];
    entries = specs.flatMap(spec => {
      const anchor = spec.anchor || page.querySelector(spec.selector);
      if (!anchor) return [];
      const element = document.createElement('div');
      element.className = `mt-background-fragment mt-background-fragment--${spec.side}`;
      element.dataset.anchor = spec.selector || 'catalogue-row';
      const image = document.createElement('img'); image.src = source(spec.asset); image.alt = '';
      image.addEventListener('load', schedule, { once: true });
      element.append(image); layer.append(element);
      return [{ ...spec, anchor, element, image }];
    });
    art.replaceChildren(layer); dirty = false;
  }
  function place() {
    frame = 0;
    const page = content.querySelector('.page.active');
    const name = page?.id.replace('page-', '');
    if (!plans[name] || innerWidth <= 1300) { art.replaceChildren(); dirty = true; return; }
    if (dirty || art.firstElementChild?.dataset.page !== name) rebuild(page, name);
    const end = footer.getBoundingClientRect().top + scrollY;
    const start = document.querySelector('.topbar').getBoundingClientRect().height + 12;
    art.style.height = `${end}px`;
    for (const entry of entries) {
      const { anchor, element, image } = entry;
      const width = entry.width * Math.min(1.65, Math.max(1, (innerWidth - 1280) / 700));
      const height = width * (image.naturalHeight / image.naturalWidth || 1);
      const boundary = anchor.getBoundingClientRect()[entry.edge] + scrollY;
      const top = Math.max(start, Math.min(boundary + entry.offset, end - height - 18));
      element.style.cssText = `--ink-top:${top}px;--ink-width:${width}px;--ink-height:${height}px;--ink-opacity:${entry.opacity};--ink-inset:${entry.inset}px;--ink-angle:${entry.angle}deg`;
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(place); }
  window.addEventListener('mt:page', () => { dirty = true; schedule(); });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule, { once: true });
  const resize = new ResizeObserver(schedule); resize.observe(content); resize.observe(footer);
  const grid = document.getElementById('grid');
  if (grid) new MutationObserver(() => { dirty = true; schedule(); }).observe(grid, { childList: true });
  document.fonts?.ready.then(schedule);
  schedule();
})();
