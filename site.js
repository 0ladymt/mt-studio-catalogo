/* Layout, navigation and brand assets. Independent of WebGL availability. */
(() => {
  const pages = new Set([
    "home",
    "loja",
    "catalogo",
    "sobre",
    "redes",
    "projetos",
    "admin",
  ]);
  const titles = {
    home: "Início",
    loja: "Loja",
    catalogo: "Catálogo 3D",
    sobre: "Sobre",
    redes: "Redes sociais",
    projetos: "Projetos",
    admin: "Painel de rascunhos",
  };
  const menu = document.querySelector(".menu-toggle");
  function showPage(name, focus = false) {
    const page = pages.has(name) ? name : "home";
    document
      .querySelectorAll(".page")
      .forEach((el) => el.classList.toggle("active", el.id === `page-${page}`));
    document.querySelectorAll(".nav-tab").forEach((el) => {
      el.classList.toggle("active", el.dataset.page === page);
      if (el.dataset.page === page) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    document.title = `${titles[page]} — MT Studio Criativo`;
    document.querySelector(".topbar").classList.remove("menu-open");
    menu.setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
    if (focus)
      document.getElementById("content").focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent("mt:page", { detail: page }));
  }
  window.mtOpenPage = (name) => {
    if (!pages.has(name)) name = "home";
    if (location.hash === `#${name}`) showPage(name, true);
    else location.hash = name;
  };
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-page-link],[data-page]");
    if (!link) return;
    event.preventDefault();
    window.mtOpenPage(link.dataset.pageLink || link.dataset.page);
    if(link.dataset.catalogCategory){for(const id of ["search","gender"]){const input=document.getElementById(id);if(input)input.value="";}const category=document.getElementById("category");category.value=link.dataset.catalogCategory;category.dispatchEvent(new Event("change",{bubbles:true}));}
  });
  window.addEventListener("hashchange", () =>
    showPage(location.hash.slice(1), true),
  );
  menu.addEventListener("click", () => {
    const open = document
      .querySelector(".topbar")
      .classList.toggle("menu-open");
    menu.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelector(".topbar").classList.remove("menu-open");
      menu.setAttribute("aria-expanded", "false");
    }
  });
  showPage(location.hash.slice(1));
  const links = {
    socialDiscord: "https://discord.gg/MAPubH3vRw",
    socialInstagram: "https://www.instagram.com/mt_studiocriativo/",
    socialTikTok: "https://www.tiktok.com/@mt_studiocriativo",
  };
  for (const [id, url] of Object.entries(links))
    document.getElementById(id).href = url;
  const projects = window.PROJETOS_MT || [];
  const source = (p) =>
    (p?.capa || p?.fotos?.[0] || "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");
  const imageSource = (path = "") =>
    path.split("/").map(encodeURIComponent).join("/");
  const chosen = (name) =>
    projects.find((p) => p.titulo.toLowerCase().includes(name)) || projects[0];
  for (const [id, name] of [
    ["mtHeroPhoto", "kings"],
    ["mtReadyPhoto", "shadows"],
    ["mtCustomPhoto", "shelby"],
  ]) {
    const img = document.getElementById(id);
    img.src = source(chosen(name));
  }
  const selected = ["polícia lisboa", "alemanha", "shelby", "montenegro"];
  selected.forEach((name) => {
    const project = chosen(name),
      a = document.createElement("a");
    a.className = "mt-project";
    a.href = "#projetos";
    const frame = document.createElement("div");
    frame.className = "mt-project__image";
    const img = new Image();
    img.src = source(project);
    img.alt = project.titulo;
    img.loading = "lazy";
    frame.append(img);
    const photos = [...new Set([project.capa, ...(project.fotos || [])].filter(Boolean))];
    let currentPhoto = Math.max(0, photos.indexOf(project.capa));
    let changingPhoto = false;
    let suppressProjectClick = false;
    let touchStart = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (photos.length > 1) {
      frame.classList.add("mt-project__gallery");
      frame.setAttribute("aria-label", `${project.titulo}: galeria com ${photos.length} imagens`);
      img.classList.add("mt-project__gallery-layer", "is-active");
      const standby = new Image();
      standby.className = "mt-project__gallery-layer";
      standby.alt = "";
      standby.setAttribute("aria-hidden", "true");
      frame.append(standby);
      let activeLayer = img;
      let standbyLayer = standby;
      const counter = document.createElement("span");
      counter.className = "mt-project__counter";
      const updateCounter = () => {
        counter.textContent = `${String(currentPhoto + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
      };
      updateCounter();
      frame.append(counter);

      const photoCache = new Map();
      const preloadPhoto = (index) => {
        if (index < 0 || index >= photos.length) return Promise.resolve("");
        if (photoCache.has(index)) return photoCache.get(index);
        const src = imageSource(photos[index]);
        const ready = new Promise((resolve, reject) => {
          const loader = new Image();
          loader.onload = async () => {
            try { await loader.decode?.(); } catch (_) { /* The loaded bitmap is still usable. */ }
            resolve(src);
          };
          loader.onerror = reject;
          loader.src = src;
        });
        photoCache.set(index, ready);
        return ready;
      };
      const preloadAround = () => {
        [currentPhoto - 1, currentPhoto + 1].forEach((index) => {
          preloadPhoto(index).catch(() => photoCache.delete(index));
        });
      };
      const showPhoto = async (nextIndex, direction) => {
        if (changingPhoto || nextIndex < 0 || nextIndex >= photos.length) return;
        changingPhoto = true;
        let src;
        try {
          src = await preloadPhoto(nextIndex);
        } catch (_) {
          photoCache.delete(nextIndex);
          changingPhoto = false;
          return;
        }
        standbyLayer.src = src;
        standbyLayer.alt = `${project.titulo}, imagem ${nextIndex + 1} de ${photos.length}`;
        standbyLayer.removeAttribute("aria-hidden");
        try { await standbyLayer.decode?.(); } catch (_) { /* Already preloaded. */ }

        currentPhoto = nextIndex;
        updateCounter();
        const enteringClass = direction > 0 ? "is-entering-forward" : "is-entering-back";
        standbyLayer.classList.add(enteringClass);

        let finished = false;
        let finishTimer = 0;
        const finish = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(finishTimer);
          activeLayer.classList.remove("is-active");
          activeLayer.setAttribute("aria-hidden", "true");
          standbyLayer.classList.remove(enteringClass);
          const previousLayer = activeLayer;
          activeLayer = standbyLayer;
          standbyLayer = previousLayer;
          changingPhoto = false;
          preloadAround();
        };

        if (reducedMotion.matches) {
          standbyLayer.classList.add("is-active");
          finish();
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
          standbyLayer.classList.add("is-active");
          standbyLayer.addEventListener("transitionend", finish, { once: true });
          finishTimer = window.setTimeout(finish, 380);
        }));
      };

      frame.addEventListener("wheel", (event) => {
        if (!event.deltaY) return;
        const direction = event.deltaY > 0 ? 1 : -1;
        const nextIndex = currentPhoto + direction;
        if (nextIndex < 0 || nextIndex >= photos.length) return;
        event.preventDefault();
        showPhoto(nextIndex, direction);
      }, { passive: false });

      frame.addEventListener("touchstart", (event) => {
        const touch = event.changedTouches[0];
        touchStart = { x: touch.clientX, y: touch.clientY };
      }, { passive: true });
      frame.addEventListener("touchend", (event) => {
        if (!touchStart) return;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
        const direction = deltaX < 0 ? 1 : -1;
        const nextIndex = currentPhoto + direction;
        if (nextIndex < 0 || nextIndex >= photos.length) return;
        event.preventDefault();
        suppressProjectClick = true;
        window.setTimeout(() => { suppressProjectClick = false; }, 500);
        showPhoto(nextIndex, direction);
      }, { passive: false });
      preloadAround();
    }
    const meta = document.createElement("div");
    meta.className = "mt-project__meta";
    const title = document.createElement("h3");
    title.textContent = project.titulo;
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    meta.append(title, arrow);
    a.append(frame, meta);
    a.addEventListener("click", (e) => {
      if (suppressProjectClick) {
        e.preventDefault();
        suppressProjectClick = false;
        return;
      }
      if (window.mtOpenProject) {
        e.preventDefault();
        window.mtOpenProject(projects.indexOf(project));
      }
    });
    document.getElementById("mtHomeProjects").append(a);
  });

  // Progressive editorial reveals. Classes are attached at runtime so the
  // content remains fully visible when JavaScript is unavailable.
  const home = document.getElementById("page-home");
  const store = document.getElementById("page-loja");
  const revealItems = [];
  const markReveal = (elements, options = {}) => {
    if (!elements) return [];
    const nodes = elements instanceof Element ? [elements] : [...elements];
    const marked = nodes.filter(Boolean);
    marked.forEach((element, index) => {
      element.classList.add("mt-reveal");
      if (options.from) element.classList.add(`mt-reveal--${options.from}`);
      element.style.setProperty(
        "--mt-reveal-delay",
        `${(options.delay || 0) + index * (options.stagger || 0)}ms`,
      );
      revealItems.push(element);
    });
    return marked;
  };

  if (home) {
    markReveal(home.querySelector(".mt-hero-work"), { from: "left", delay: 40 });
    markReveal(home.querySelectorAll(".mt-home-hero__copy > *"), {
      delay: 90,
      stagger: 85,
    });

    const choiceSection = home.querySelector(".mt-section:has(.mt-split)");
    markReveal(choiceSection?.querySelectorAll(".mt-page-head .mt-overline, .mt-page-head h2"), {
      stagger: 75,
    });
    markReveal(choiceSection?.querySelectorAll(".mt-feature"), {
      delay: 90,
      stagger: 140,
    });

    const projectsGrid = document.getElementById("mtHomeProjects");
    const projectsSection = projectsGrid?.closest(".mt-section");
    markReveal(projectsSection?.querySelectorAll(".mt-page-head .mt-overline, .mt-page-head h2, .mt-page-head > .mt-button"), {
      stagger: 75,
    });
    markReveal(projectsGrid?.querySelectorAll(".mt-project"), {
      delay: 70,
      stagger: 110,
    });

    const editorial = home.querySelector(".mt-editorial--carousel");
    markReveal(editorial?.querySelector(".mt-editorial__visual"), { from: "left" });
    markReveal(editorial?.querySelectorAll(".mt-editorial__copy > *"), {
      delay: 80,
      stagger: 85,
    });

    const human = document.getElementById("mtHuman");
    markReveal(human?.querySelector(".mt-human__photo"), { from: "left" });
    markReveal(human?.querySelectorAll(".mt-human__copy > *"), {
      delay: 80,
      stagger: 90,
    });

    markReveal(home.querySelectorAll(".mt-cta > *"), { stagger: 90 });
  }

  let storeProductsRevealed = false;
  const storeGrid = store?.querySelector("#mtShopDrafts");
  if (store) {
    markReveal(store.querySelector(".shop-release"));
    markReveal(store.querySelectorAll(".mt-shop > .mt-page-head .mt-overline, .mt-shop > .mt-page-head h2, .mt-shop > .mt-page-head > p"), {
      delay: 40,
      stagger: 75,
    });
    markReveal(store.querySelector(".shop-mode"), { delay: 40 });
    markReveal(store.querySelectorAll(".shop-collections > a"), {
      delay: 40,
      stagger: 90,
    });
    markReveal(store.querySelectorAll(".mt-shop-preview > .mt-page-head .mt-overline, .mt-shop-preview > .mt-page-head h3, .mt-shop-preview > .mt-page-head > p"), {
      stagger: 75,
    });
    markReveal(store.querySelector(".shop-toolbar > div:first-child"));
    markReveal(store.querySelector("#shopCategoryFilters"), { delay: 80 });
    markReveal(store.querySelector("#shopEmptyCollection"));
    markReveal(store.querySelector("#shopNoResults"));
    markReveal(store.querySelector("#shopLoadError"));
    markReveal(store.querySelector("#localDraftNotice"));
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const revealObserver = !reduceMotion.matches && "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-revealed");
            if (entry.target.matches("#page-loja .mt-shop-draft"))
              storeProductsRevealed = true;
            observer.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -10%", threshold: 0.08 },
      )
    : null;

  [home, store].filter(Boolean).forEach((page) => page.classList.add("mt-reveal-ready"));
  if (revealObserver) revealItems.forEach((item) => revealObserver.observe(item));
  else revealItems.forEach((item) => item.classList.add("is-revealed"));

  [home, store].filter(Boolean).forEach((page) => {
    page.addEventListener("focusin", (event) => {
      const item = event.target.closest(".mt-reveal");
      if (!item) return;
      item.classList.add("is-revealed");
      revealObserver?.unobserve(item);
    });
  });

  if (storeGrid) {
    const registerStoreCards = (cards) => {
      const fresh = [...cards].filter((card) => !card.classList.contains("mt-reveal"));
      if (!fresh.length) return;
      markReveal(fresh, { delay: 40, stagger: 90 });
      if (storeProductsRevealed || !revealObserver) {
        fresh.forEach((card) => card.classList.add("is-revealed"));
      } else {
        fresh.forEach((card) => revealObserver.observe(card));
      }
    };
    registerStoreCards(storeGrid.querySelectorAll(".mt-shop-draft"));
    new MutationObserver(() =>
      registerStoreCards(storeGrid.querySelectorAll(".mt-shop-draft")),
    ).observe(storeGrid, { childList: true });
  }
  // Shared keyboard handling for existing gallery and model dialogs.
  let previousFocus = null;
  const dialogs = [
    document.getElementById("modal"),
    document.getElementById("projectModal"),
  ];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const dialog = record.target;
      if (dialog.classList.contains("open")) {
        previousFocus = document.activeElement;
        dialog.querySelector("button")?.focus();
        document.getElementById("content").inert = true;
        document.querySelector(".topbar").inert = true;
      } else {
        document.getElementById("content").inert = false;
        document.querySelector(".topbar").inert = false;
        previousFocus?.focus?.();
      }
    }
  });
  dialogs.forEach((d) =>
    observer.observe(d, { attributes: true, attributeFilter: ["class"] }),
  );
  document.addEventListener("keydown", (e) => {
    const dialog = dialogs.find((d) => d.classList.contains("open"));
    if (!dialog) return;
    if (e.key === "Escape") {
      dialog.querySelector(".close,.project-close").click();
      return;
    }
    if (e.key !== "Tab") return;
    const els = [
      ...dialog.querySelectorAll("button,a[href],input,select,textarea"),
    ].filter((el) => !el.disabled && el.getClientRects().length);
    if (!els.length) return;
    const first = els[0],
      last = els.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
})();
