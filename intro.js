/* Native spray simulation: hand-plotted nozzle gestures inspired by the supplied
   butterfly mural. No butterfly image, SVG, silhouette mask or pixel sampling. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let closeActive = null;
  // Hand-plotted spray gestures following the supplied mural's asymmetric wings.
  // Each cubic is a nozzle trajectory, not a silhouette, bitmap or reveal mask.
  // Sweeping nozzle passes: broad pigment masses, hooked black cuts and
  // fractured white slashes measured against the supplied mural (1000 units).
  const gestures = [
    // Upper left: wide outward fan with a torn, hooked leading edge.
    ["#09080c",90,[478,498,350,294,100,106,68,126]],
    ["#09080c",100,[68,126,56,285,150,413,465,504]],
    ["#7130a1",85,[470,486,329,302,130,165,110,178]],
    ["#a45cd0",76,[110,178,110,300,289,387,470,493]],
    ["#d4c7dc",30,[466,479,250,267,118,131,70,137]],
    ["#d4c7dc",34,[70,137,66,250,158,334,239,365]],
    ["#0b090e",58,[475,494,314,322,125,248,149,230]],
    ["#0b090e",48,[149,230,187,166,290,227,353,302]],
    ["#0b090e",60,[465,501,321,401,221,380,184,397]],
    ["#b880db",49,[470,494,371,409,315,362,294,378]],
    ["#0b090e",28,[294,378,306,312,359,368,409,425]],
    ["#eee5ee",18,[460,495,319,423,175,363,101,323]],
    ["#0b090e",40,[101,323,63,305,93,363,147,395]],
    ["#8950b4",28,[172,269,133,212,119,158,89,158]],
    // Upper right: taller wing, open fan, asymmetric black hooks.
    ["#09080c",108,[527,493,659,272,879,107,943,52]],
    ["#09080c",100,[943,52,960,255,867,378,537,500]],
    ["#7933aa",92,[536,483,682,288,878,138,918,112]],
    ["#ab63d2",78,[918,112,929,278,735,394,540,492]],
    ["#d8ccdf",29,[542,476,706,285,895,154,940,114]],
    ["#d8ccdf",38,[940,114,950,191,889,268,813,328]],
    ["#0b090e",65,[535,497,750,300,892,170,912,199]],
    ["#0b090e",48,[912,199,917,257,837,295,850,356]],
    ["#0b090e",66,[541,501,755,408,883,364,931,318]],
    ["#bf8cdd",43,[546,495,668,398,734,347,709,336]],
    ["#0b090e",27,[709,336,770,288,749,367,690,410]],
    ["#eee5ee",18,[550,498,722,410,845,356,943,365]],
    ["#0b090e",41,[943,365,913,381,925,428,941,459]],
    // Lower left: broad scalloped lobe, several deep calligraphic cuts.
    ["#09080c",112,[470,524,235,470,112,432,99,470]],
    ["#09080c",109,[99,470,70,706,217,832,114,912]],
    ["#7934a8",94,[459,534,267,510,166,467,156,513]],
    ["#ae65d3",90,[156,513,126,665,243,791,198,857]],
    ["#7d3aaa",79,[450,555,339,640,261,838,161,931]],
    ["#dacfe0",32,[448,543,308,565,164,536,138,479]],
    ["#dacfe0",32,[138,479,147,641,188,701,195,738]],
    ["#0c090e",63,[451,546,315,565,218,604,232,671]],
    ["#0c090e",65,[232,671,236,722,335,686,386,616]],
    ["#bd8bd9",57,[452,553,373,606,300,650,297,697]],
    ["#0b090e",51,[459,557,403,722,340,821,298,786]],
    ["#0b090e",44,[298,786,263,735,286,805,237,832]],
    ["#ded3e2",22,[450,551,349,664,238,777,255,810]],
    ["#0b090e",42,[255,810,234,862,147,940,94,969]],
    ["#8b44b8",35,[227,737,206,815,206,865,171,889]],
    // Lower right: full rounded mass with a sharp folded bottom edge.
    ["#09080c",106,[540,523,753,442,898,416,929,464]],
    ["#09080c",111,[929,464,895,652,787,797,829,923]],
    ["#7932a7",95,[547,535,719,475,851,463,868,490]],
    ["#b16bd8",96,[868,490,902,664,754,806,784,876]],
    ["#7a37a3",79,[556,559,648,654,733,820,831,940]],
    ["#ddd1e3",32,[555,541,735,548,840,467,865,483]],
    ["#ddd1e3",29,[865,483,915,511,847,596,841,648]],
    ["#0c090e",70,[552,549,726,536,833,552,798,611]],
    ["#0c090e",66,[798,611,766,651,697,634,638,588]],
    ["#be89de",61,[554,555,659,608,716,677,728,722]],
    ["#0b090e",56,[553,561,590,741,683,858,724,822]],
    ["#0b090e",49,[724,822,769,775,756,860,809,887]],
    ["#ddd0e2",25,[558,557,655,701,765,785,753,819]],
    ["#0b090e",38,[753,819,830,821,813,895,865,959]],
    ["#8b45b5",31,[832,657,773,739,798,839,827,878]],
    // Broad lateral lobes and angular folds join the fans into a mural.
    ["#09080c",74,[461,499,274,367,87,290,91,378]],
    ["#a268c9",66,[453,507,261,412,141,337,145,404]],
    ["#d6c8dd",24,[442,505,292,428,160,399,100,365]],
    ["#09080c",54,[100,365,147,445,283,430,402,489]],
    ["#09080c",85,[455,555,284,611,112,618,158,745]],
    ["#9b56c5",78,[449,565,302,626,196,643,229,726]],
    ["#d6c8dd",24,[435,567,274,661,180,658,189,729]],
    ["#09080c",53,[189,729,276,824,348,677,428,591]],
    ["#09080c",78,[553,500,772,364,919,283,918,365]],
    ["#a369cc",67,[560,508,760,414,876,334,873,402]],
    ["#d6c8dd",23,[566,503,752,433,860,395,932,349]],
    ["#09080c",55,[932,349,867,451,751,432,607,488]],
    ["#09080c",86,[557,555,718,608,884,633,823,772]],
    ["#9c58c7",75,[564,566,721,636,809,667,786,740]],
    ["#d6c8dd",24,[575,570,729,671,845,675,824,745]],
    ["#09080c",53,[824,745,735,850,655,686,585,593]],
    // Body and antennae are painted last, with heavy black and worn highlights.
    ["#09080c",48,[501,409,488,486,526,608,508,743]],
    ["#ddd4df",20,[502,439,496,481,509,525,503,570]],
    ["#b290c5",10,[503,572,498,616,509,654,507,687]],
    ["#09080c",13,[493,408,459,280,412,199,393,221]],
    ["#09080c",13,[516,410,564,274,612,196,632,214]],
  ];
  const paintDuration = 4400, settleDuration = 180;
  let cachedPaint = null, cachedTag = null;
  const tagDuration = 900;
  const paintOrder = gestures.map((_, index) => index);
  function preparePaint() {
    if (cachedPaint) return cachedPaint;
    let seed=290926;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const dabs=[],drips=[];
    paintOrder.forEach((gestureIndex,pass)=>{
      const g=gestureIndex,[color,width,p]=gestures[g];
      const count=120;
      for(let n=0;n<=count;n++){
        const t=n/count,u=1-t;
        const x=u*u*u*p[0]+3*u*u*t*p[2]+3*u*t*t*p[4]+t*t*t*p[6];
        const y=u*u*u*p[1]+3*u*u*t*p[3]+3*u*t*t*p[5]+t*t*t*p[7];
        const pressure=(.2+.8*Math.pow(Math.sin(Math.PI*t),.6))*(.86+.14*Math.sin(n*.13+g));
        // Broad colour passes and broken fine highlights share the same nozzle path.
        const coverage=.72+.28*Math.sin(n*.097+g*1.8)**2;
        const radius=width*pressure*.72;
        const wobbleX=Math.sin(n*.113+g)*2.8+Math.sin(n*.043)*3.2;
        const wobbleY=Math.cos(n*.087+g)*3.3;
        const highlight=color.startsWith("#d")||color.startsWith("#e");
        const breakup=Math.sin(Math.floor(n/6)*127.1+g*311.7)*43758.5453;
        const skipHighlight=highlight&&breakup-Math.floor(breakup)>.82;
        const time=(pass+Math.pow(t,.88))/paintOrder.length;
        // Dense wet pigment, deposited at the moving nozzle rather than revealed.
        // Overlapping elliptical droplets build substantial, irregular paint.
        for(let j=0;j<6;j++){
          const angle=random()*Math.PI*2,dist=Math.sqrt(random())*radius*.38;
          const px=x+wobbleX+Math.cos(angle)*dist,py=y+wobbleY+Math.sin(angle)*dist;
          if(skipHighlight&&j>5)continue;
          dabs.push({x:px,y:py,r:radius*(.24+random()*.28),color,alpha:.42+random()*.4,aspect:.55+random()*.6,rotation:random()*Math.PI,time});
        }
        for(let j=0;j<5;j++){
          const angle=random()*Math.PI*2,dist=random()**.72*radius*.52;
          const px=x+wobbleX+Math.cos(angle)*dist,py=y+wobbleY+Math.sin(angle)*dist;
          // Stationary wall pores break coverage, even on overlapping passes.
          const pore=Math.sin(Math.floor(px)*127.1+Math.floor(py)*311.7)*43758.5453;
          if(pore-Math.floor(pore)>.84||random()<.12||skipHighlight)continue;
          dabs.push({x:px,y:py,r:.35+random()**2*3.6,color,
            alpha:(.24+random()*.59)*coverage*(highlight ? .72 : 1),aspect:.6+random()*.65,rotation:random()*Math.PI,time});
        }
        for(let j=0;j<4;j++){
          const angle=random()*Math.PI*2,dist=radius*(.4+random()*.55);
          dabs.push({x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,r:.25+random()*.7,color,alpha:.10+random()*.22,time});
        }
        if((n===35||n===87)&&width>25&&g%4===0){
          drips.push({x,y:y+radius*.3,color,start:time,length:55+random()*175,width:1.7+random()*5.5,lean:random()*7-3.5});
          for(let j=0;j<24;j++){
            const angle=random()*Math.PI*2,dist=radius*(.6+random()*1.2);
            dabs.push({x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,r:1.2+random()**3*9,color,alpha:.3+random()*.5,time});
          }
        }
      }
    });
    // Surface wear is applied to deposited paint only, never a butterfly mask.
    for(let n=0;n<10000;n++){
      dabs.push({x:random()*1000,y:random()*1000,r:.25+random()**3*1.9,color:"#000",alpha:.3+random()*.6,time:random(),erase:true});
    }
    dabs.sort((a,b)=>a.time-b.time);
    return cachedPaint = {dabs,drips};
  }
  function prepareTag() {
    if (cachedTag) return cachedTag;
    // Handwritten MT / STUDIO: individual moving nozzle passes, not an image
    // reveal. Coordinates are local to the tag, with a slight rising baseline.
    const strokes = [
      ["#ddd1e3",7,[22,93,29,61,35,29,40,17]],
      ["#ddd1e3",7,[40,17,47,34,48,45,53,57]],
      ["#ddd1e3",7,[53,57,66,35,79,20,89,9]],
      ["#ddd1e3",7,[89,9,85,34,84,63,83,83]],
      ["#ddd1e3",8,[98,20,137,10,174,8,199,4]],
      ["#ddd1e3",8,[150,12,144,39,135,65,130,82]],
      ["#a45cd0",4,[18,99,70,96,139,88,195,78]],
      // S
      ["#b880db",4,[39,121,6,106,4,132,24,135]],
      ["#b880db",4,[24,135,46,139,25,165,8,150]],
      // T
      ["#b880db",4,[41,116,50,113,63,112,73,110]],
      ["#b880db",4,[58,113,57,130,51,149,49,154]],
      // U
      ["#b880db",4,[82,110,67,161,100,157,108,106]],
      // D
      ["#b880db",4,[119,105,114,120,110,142,108,149]],
      ["#b880db",4,[119,105,151,94,151,139,108,149]],
      // I
      ["#b880db",4,[158,99,154,114,150,132,147,141]],
      // O
      ["#b880db",4,[183,95,151,102,155,151,181,133]],
      ["#b880db",4,[181,133,202,116,201,88,183,95]],
      ["#a45cd0",5,[9,173,55,161,141,153,207,147]],
      ["#a45cd0",2,[177,157,179,163,179,173,181,181]],
    ];
    let seed=4917; const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const marks=[];
    strokes.forEach(([color,width,p],pass)=>{
      for(let n=0;n<=75;n++){
        const t=n/75,u=1-t;
        const x=u*u*u*p[0]+3*u*u*t*p[2]+3*u*t*t*p[4]+t*t*t*p[6];
        const y=u*u*u*p[1]+3*u*u*t*p[3]+3*u*t*t*p[5]+t*t*t*p[7];
        const time=(pass+t)/strokes.length;
        for(let k=0;k<5;k++){
          const a=random()*Math.PI*2,r=random()*width*.45;
          marks.push({x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,r:width*(.16+random()*.24),alpha:.3+random()*.5,color,time});
        }
        for(let k=0;k<2;k++){
          const a=random()*Math.PI*2,r=width*(.4+random());
          marks.push({x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,r:.15+random()*.4,alpha:.12+random()*.2,color,time});
        }
      }
    });
    return cachedTag=marks;
  }
  async function play() {
    if (reduced.matches) return;
    closeActive?.();
    const previous = document.activeElement,
      root = document.createElement("div");
    root.className = "mt-intro";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Borboleta da MT Studio sendo pintada");
    root.innerHTML =
      '<canvas aria-label="Borboleta pintada por traços de spray"></canvas><span class="mt-intro__caption">UM TRAÇO. UMA IDENTIDADE.</span><span class="mt-intro__signature" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">MT STUDIO — assinatura pintada na parede</span><button class="mt-intro__skip" type="button">Pular abertura ↗</button>';
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
      setTimeout(() => root.remove(), 350);
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
    const pigmentMargin = 64;
    pigment.width = pigment.height = 1000 + pigmentMargin * 2;
    const pc = pigment.getContext("2d");
    pc.translate(pigmentMargin, pigmentMargin);
    const {dabs,drips}=preparePaint();
    const tag=document.createElement("canvas"); tag.width=230;tag.height=200;
    const tc=tag.getContext("2d"),tagMarks=prepareTag();
    let tagIndex=0,tagStart=null;
    // Native-resolution, non-tiled concrete. Smooth multiscale relief and fine
    // aggregate are generated for this viewport; no stretched texture image.
    const wall=document.createElement("canvas"),wc=wall.getContext("2d");
    const hash=(x,y)=>{let n=Math.imul(x+71,374761393)^Math.imul(y+139,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
    const relief=(x,y,cell)=>{
      const a=Math.floor(x/cell),b=Math.floor(y/cell);
      let u=x/cell-a,v=y/cell-b;u=u*u*(3-2*u);v=v*v*(3-2*v);
      return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;
    };
    function buildWall(w,h){
      wall.width=w;wall.height=h;
      const noise=wc.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4,fine=hash(x*3,y*5);
        const grain=(fine-.5)*5+(relief(x,y,170)-.5)*7+(relief(x,y,39)-.5)*3;
        const light=7*Math.max(0,1-Math.hypot((x-w*.47)/w,(y-h*.39)/h)*1.4);
        const pore=fine>.975?-9:0;
        noise.data[i]=27+grain+light+pore;noise.data[i+1]=26+grain+light+pore;noise.data[i+2]=30+grain+light+pore;noise.data[i+3]=255;
      }
      wc.putImageData(noise,0,0);
      // Sparse plaster fractures at native resolution, never a tiled pattern.
      for(let n=0;n<14;n++){
        const x=hash(n,71)*w,y=hash(n,93)*h,length=40+hash(n,12)*140;
        wc.beginPath();wc.moveTo(x,y);
        for(let k=1;k<=7;k++)wc.lineTo(x+(hash(n,k)-.5)*18+k*2,y+k*length/7);
        wc.lineWidth=.6+hash(n,41);wc.strokeStyle="rgba(4,3,6,.16)";wc.stroke();
      }
    }
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
      buildWall(Math.ceil(width*.65),Math.ceil(height*.65));
      side = Math.min(width * 0.90, height * 0.76, 880);
      left = (width - side) / 2;
      top = (height - side) / 2 - height*.045;
      draw();
    }
    function draw() {
      ctx.drawImage(wall,0,0,width,height);
      ctx.drawImage(pigment, left-side*pigmentMargin/1000, top-side*pigmentMargin/1000, side*pigment.width/1000, side*pigment.height/1000);
      const elapsed=(performance.now()-start)/paintDuration;
      ctx.save();ctx.translate(left,top);ctx.scale(side/1000,side/1000);
      for(const d of drips){
        const age=Math.max(0,Math.min(1,(elapsed-d.start)/.26));if(!age)continue;
        const length=d.length*(1-Math.pow(1-age,2));
        ctx.strokeStyle=d.color;ctx.lineWidth=d.width;ctx.globalAlpha=.75;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.quadraticCurveTo(d.x+d.lean,d.y+length*.6,d.x+d.lean*.7,d.y+length);ctx.stroke();
        ctx.lineWidth=d.width*.4;ctx.globalAlpha=.38;
        ctx.beginPath();ctx.moveTo(d.x+d.width*.3,d.y);ctx.lineTo(d.x+d.lean*.7+d.width*.3,d.y+length*.9);ctx.stroke();
        ctx.globalAlpha=.8;
        ctx.beginPath();ctx.ellipse(d.x+d.lean*.7,d.y+length,d.width*.65,d.width,0,0,Math.PI*2);ctx.fillStyle=d.color;ctx.fill();
      }
      ctx.restore();
      // Same wall canvas and coordinate system: the tag sits by the right wing.
      ctx.drawImage(tag,left+side*.70,top+side*.76,side*.29,side*.252);
    }
    window.addEventListener("resize", resize);
    resize();
    function signatureFrame(now) {
      if(finished)return;
      if(tagStart===null)tagStart=now;
      const progress=Math.min(1,(now-tagStart)/tagDuration);
      const deadline=performance.now()+4;
      while(tagIndex<tagMarks.length && tagMarks[tagIndex].time<=progress && performance.now()<deadline){
        const d=tagMarks[tagIndex++];tc.fillStyle=d.color;tc.globalAlpha=d.alpha;
        tc.beginPath();tc.arc(d.x,d.y,d.r,0,Math.PI*2);tc.fill();
      }
      draw();
      if(progress<1 || tagIndex<tagMarks.length)raf=requestAnimationFrame(signatureFrame);
      else timeout=setTimeout(finish,650);
    }
    function frame(now) {
      if (finished) return;
      const progress = Math.min(1, (now - start) / paintDuration);
      // Bound a frame's pigment work; delayed frames catch up without a burst.
      const deadline = performance.now() + 5;
      let painted = 0;
      while (index < dabs.length && dabs[index].time <= progress && painted < 1400 && performance.now() < deadline) {
        painted++;
        const d = dabs[index++];
        pc.globalCompositeOperation=d.erase?"destination-out":"source-over";
        pc.fillStyle = d.color;pc.globalAlpha=d.alpha;
        pc.beginPath();pc.ellipse(d.x,d.y,d.r,d.r*(d.aspect||1),d.rotation||0,0,Math.PI*2);pc.fill();
      }
      draw();
      if (progress < 1 || index < dabs.length) {
        raf = requestAnimationFrame(frame);
      } else {
        timeout = setTimeout(()=>{
          if(finished)return;
          root.classList.add("is-signed");
          raf=requestAnimationFrame(signatureFrame);
        },settleDuration);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  document.querySelector(".replay-intro")?.addEventListener("click", () => play());
  const isHome = !location.hash || location.hash === "#home";
  let seen = false;
  try {
    seen = sessionStorage.getItem("mt-intro-20260928") === "1";
    if (isHome) sessionStorage.setItem("mt-intro-20260928", "1");
  } catch {}
  if (isHome && !seen) play();
})();
