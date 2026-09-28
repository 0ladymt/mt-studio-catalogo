/* Pigment deposition from the supplied artwork, not an SVG substitute or
   a full-image clipping reveal. Every dab samples the approved reference.
   Stroke coordinates follow its four wings, body, antennae and drips. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const reference = new Image();
  reference.src = "assets/brand/graffiti-reference.png";
  let closeActive = null;
  const strokes = [
    [
      [0.49, 0.5],
      [0.38, 0.31],
      [0.19, 0.13],
      [0.06, 0.1],
      [0.08, 0.25],
      [0.2, 0.4],
      [0.45, 0.55],
    ],
    [
      [0.5, 0.5],
      [0.65, 0.3],
      [0.84, 0.1],
      [0.95, 0.06],
      [0.94, 0.27],
      [0.8, 0.4],
      [0.53, 0.55],
    ],
    [
      [0.48, 0.52],
      [0.29, 0.48],
      [0.13, 0.51],
      [0.07, 0.68],
      [0.09, 0.89],
      [0.3, 0.73],
      [0.48, 0.57],
    ],
    [
      [0.53, 0.53],
      [0.76, 0.47],
      [0.92, 0.44],
      [0.88, 0.64],
      [0.8, 0.85],
      [0.65, 0.78],
      [0.52, 0.58],
    ],
    [
      [0.48, 0.46],
      [0.49, 0.6],
      [0.49, 0.82],
    ],
    [
      [0.49, 0.44],
      [0.44, 0.25],
      [0.39, 0.18],
    ],
    [
      [0.51, 0.43],
      [0.59, 0.22],
      [0.65, 0.17],
    ],
    [
      [0.14, 0.18],
      [0.16, 0.4],
      [0.14, 0.65],
      [0.14, 0.92],
    ],
    [
      [0.84, 0.17],
      [0.84, 0.42],
      [0.83, 0.61],
      [0.8, 0.9],
    ],
  ];
  function inside(x, y, points) {
    let yes = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if (
        a[1] > y !== b[1] > y &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
      )
        yes = !yes;
    }
    return yes;
  }
  const silhouette = [
    [0.03, 0.1],
    [0.19, 0.07],
    [0.4, 0.24],
    [0.49, 0.45],
    [0.63, 0.23],
    [0.94, 0.01],
    [0.99, 0.22],
    [0.94, 0.52],
    [0.87, 0.9],
    [0.72, 0.94],
    [0.57, 0.79],
    [0.49, 0.66],
    [0.34, 0.82],
    [0.05, 0.96],
    [0.02, 0.69],
    [0.07, 0.42],
  ];
  function pathTime(x, y) {
    let best = Infinity,
      time = 0;
    strokes.forEach((path, s) => {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i],
          b = path[i + 1],
          dx = b[0] - a[0],
          dy = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy),
          ),
        );
        const dist = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        if (dist < best) {
          best = dist;
          time = (s + (i + t) / (path.length - 1)) / strokes.length;
        }
      }
    });
    return time;
  }
  async function play() {
    if (reduced.matches) return;
    closeActive?.();
    try {
      await reference.decode();
    } catch {
      return;
    }
    const previous = document.activeElement,
      root = document.createElement("div");
    root.className = "mt-intro";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Borboleta da MT Studio sendo pintada");
    root.innerHTML =
      '<canvas aria-label="Pichação progressiva da borboleta original"></canvas><span class="mt-intro__caption">MT STUDIO / IDEIAS QUE VIRAM IDENTIDADE</span><div class="mt-intro__signature"><img src="assets/brand/signature.png" alt="MT Studio"></div><button class="mt-intro__skip" type="button">Pular abertura ↗</button>';
    const siblings = [...document.body.children].filter(
      (el) => !["SCRIPT"].includes(el.tagName),
    );
    const inertBefore = siblings.map((el) => el.inert);
    siblings.forEach((el) => (el.inert = true));
    document.body.append(root);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.querySelector("button").focus();
    let raf = 0,
      timeout = 0,
      finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      root.classList.add("is-gone");
      document.body.style.overflow = oldOverflow;
      siblings.forEach((el, i) => (el.inert = inertBefore[i]));
      previous?.focus?.();
      setTimeout(() => root.remove(), 500);
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", key);
      reduced.removeEventListener("change", finish);
      closeActive = null;
    }
    function key(e) {
      if (e.key === "Escape") finish();
      if (e.key === "Tab") {
        e.preventDefault();
        root.querySelector("button").focus();
      }
    }
    closeActive = finish;
    root.querySelector("button").onclick = finish;
    document.addEventListener("keydown", key);
    reduced.addEventListener("change", finish);
    const output = root.querySelector("canvas"),
      ctx = output.getContext("2d");
    const pigment = document.createElement("canvas");
    pigment.width = pigment.height = 720;
    const pc = pigment.getContext("2d");
    const sample = document.createElement("canvas");
    sample.width = sample.height = 720;
    const sc = sample.getContext("2d", { willReadFrequently: true });
    sc.drawImage(reference, 0, 0, 720, 720);
    const rgba = sc.getImageData(0, 0, 720, 720).data,
      dabs = [];
    // Dabs include the actual irregular pigment contours and photo grain.
    for (let y = 0; y < 720; y += 2)
      for (let x = 0; x < 720; x += 2) {
        const u = x / 720,
          v = y / 720,
          k = (y * 720 + x) * 4,
          r = rgba[k],
          g = rgba[k + 1],
          b = rgba[k + 2];
        const purple = b > g * 1.15 && r > g * 1.06,
          black = Math.max(r, g, b) < 72,
          white = Math.min(r, g, b) > 151;
        const antenna = v > 0.16 && v < 0.48 && u > 0.37 && u < 0.67;
        if (
          (inside(u, v, silhouette) || antenna) &&
          (purple || black || white)
        ) {
          const phase = purple ? 1 : white ? 2 : 0;
          dabs.push({
            x,
            y,
            color: `rgb(${r} ${g} ${b})`,
            time: (phase + pathTime(u, v) * 0.96) / 3,
          });
        }
      }
    dabs.sort((a, b) => a.time - b.time);
    // Wall samples come from the unpainted top-centre area of the supplied photo.
    const wall = document.createElement("canvas");
    wall.width = 480;
    wall.height = 320;
    const wc = wall.getContext("2d");
    wc.drawImage(reference, 470, 15, 260, 160, 0, 0, 480, 320);
    let width,
      height,
      side,
      left,
      top,
      index = 0,
      start = performance.now();
    function resize() {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      width = innerWidth;
      height = innerHeight;
      output.width = width * ratio;
      output.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      side = Math.min(width * 0.92, height * 0.88, 920);
      left = (width - side) / 2;
      top = (height - side) / 2 - 25;
      draw();
    }
    function draw() {
      ctx.fillStyle = ctx.createPattern(wall, "repeat");
      ctx.fillRect(0, 0, width, height);
      const shade = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        20,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7,
      );
      shade.addColorStop(0, "#08060900");
      shade.addColorStop(1, "#080609a0");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(pigment, left, top, side, side);
    }
    window.addEventListener("resize", resize);
    resize();
    function frame(now) {
      if (finished) return;
      const progress = Math.min(1, (now - start) / 7400);
      while (index < dabs.length && dabs[index].time <= progress) {
        const d = dabs[index++];
        pc.fillStyle = d.color;
        pc.fillRect(d.x, d.y, 2.1, 2.1);
      }
      draw();
      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        root.classList.add("is-signed");
        timeout = setTimeout(finish, 1900);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  document.querySelector(".replay-intro").addEventListener("click", play);
  const isHome = !location.hash || location.hash === "#home";
  let seen = false;
  try {
    seen = sessionStorage.getItem("mt-intro-2026") === "1";
    if (isHome) sessionStorage.setItem("mt-intro-2026", "1");
  } catch {}
  if (isHome && !seen) play();
})();
