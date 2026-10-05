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
      if (window.mtOpenProject) {
        e.preventDefault();
        window.mtOpenProject(projects.indexOf(project));
      }
    });
    document.getElementById("mtHomeProjects").append(a);
  });
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
