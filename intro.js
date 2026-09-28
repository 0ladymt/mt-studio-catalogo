/* Pigment deposition from the supplied artwork, not an SVG substitute or
   a full-image clipping reveal. Every dab samples the approved reference.
   Stroke coordinates follow its four wings, body, antennae and drips. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const reference = new Image();
  reference.src = "assets/brand/graffiti.svg?v=20260928-2";
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
      '<canvas aria-label="Pichação progressiva da borboleta original"></canvas><span class="mt-intro__caption">UM TRAÇO. UMA IDENTIDADE.</span><div class="mt-intro__signature"><img src="assets/brand/signature.svg?v=20260928-2" alt="MT Studio"></div><button class="mt-intro__skip" type="button">Pular abertura ↗</button>';
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
    pigment.width = pigment.height = 900;
    const pc = pigment.getContext("2d");
    const sample = document.createElement("canvas");
    sample.width = sample.height = 900;
    const sc = sample.getContext("2d", { willReadFrequently: true });
    sc.drawImage(reference, 0, 0, 900, 900);
    const rgba = sc.getImageData(0, 0, 900, 900).data,
      dabs = [];
    let seed=28;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let y=0;y<900;y+=2)for(let x=0;x<900;x+=2){
      const k=(y*900+x)*4,r=rgba[k],g=rgba[k+1],b=rgba[k+2],alpha=rgba[k+3];
      if(alpha<80||random()<.024)continue;
      const phase=b<60?0:g>110?2:1,grain=.82+random()*.18;
      dabs.push({x,y,color:`rgba(${r*grain},${g*grain},${b*grain},${alpha/255})`,time:(phase+pathTime(x/900,y/900)*.92)/3});
    }
    for(const dab of [...dabs])if(dab.time>.33&&dab.time<.68&&random()<.006)for(let i=0;i<9;i++){const angle=random()*Math.PI*2,distance=random()**2*28;dabs.push({x:dab.x+Math.cos(angle)*distance,y:dab.y+Math.sin(angle)*distance,color:`rgba(163,32,255,${.07+random()*.15})`,time:dab.time});}
    dabs.sort((a,b)=>a.time-b.time);
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
      side = Math.min(width * 0.86, height * 0.74, 760);
      left = (width - side) / 2;
      top = (height - side) / 2 - height*.045;
      draw();
    }
    function draw() {
      ctx.clearRect(0,0,width,height);
      ctx.drawImage(pigment, left, top, side, side);
    }
    window.addEventListener("resize", resize);
    resize();
    function frame(now) {
      if (finished) return;
      const progress = Math.min(1, (now - start) / 5400);
      while (index < dabs.length && dabs[index].time <= progress) {
        const d = dabs[index++];
        pc.fillStyle = d.color;
        pc.beginPath();pc.arc(d.x,d.y,1.52,0,Math.PI*2);pc.fill();
      }
      draw();
      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        root.classList.add("is-signed");
        timeout = setTimeout(finish, 1400);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  document.querySelector(".replay-intro").addEventListener("click", () => play());
  const isHome = !location.hash || location.hash === "#home";
  let seen = false;
  try {
    seen = sessionStorage.getItem("mt-intro-20260928") === "1";
    if (isHome) sessionStorage.setItem("mt-intro-20260928", "1");
  } catch {}
  if (isHome && !seen) play();
})();
