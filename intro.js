/* Native spray simulation: hand-plotted nozzle gestures inspired by the supplied
   butterfly mural. No butterfly image, SVG, silhouette mask or pixel sampling. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let closeActive = null;
  // Hand-plotted spray gestures following the supplied mural's asymmetric wings.
  // Each cubic is a nozzle trajectory, not a silhouette, bitmap or reveal mask.
  const gestures = [
    ["#100e14",58,[490,510,370,265,165,135,75,130]],
    ["#100e14",48,[75,130,28,306,205,478,475,520]],
    ["#100e14",65,[515,510,655,270,885,145,934,60]],
    ["#100e14",51,[934,60,979,318,813,482,530,525]],
    ["#100e14",48,[485,540,220,405,135,470,161,677]],
    ["#100e14",57,[161,677,230,940,346,785,491,553]],
    ["#100e14",56,[523,543,745,394,900,430,830,654]],
    ["#100e14",50,[830,654,815,927,665,826,516,556]],
    ["#70209c",38,[481,504,295,308,174,195,116,188]],
    ["#a320ff",52,[116,188,108,378,304,444,476,515]],
    ["#70209c",34,[523,498,690,284,841,191,899,126]],
    ["#a320ff",57,[899,126,925,361,744,437,535,514]],
    ["#a320ff",48,[475,536,282,443,172,497,211,624]],
    ["#8022b5",42,[211,624,257,816,356,741,483,552]],
    ["#a320ff",52,[536,533,735,430,843,451,793,608]],
    ["#8022b5",40,[793,608,792,836,658,744,525,551]],
    ["#121016",29,[471,508,355,352,230,274,214,280]],
    ["#121016",31,[214,280,168,327,387,452,480,521]],
    ["#121016",33,[533,510,700,316,826,271,836,296]],
    ["#121016",27,[836,296,843,338,676,452,534,527]],
    ["#17111c",28,[478,549,285,526,306,685,266,706]],
    ["#17111c",32,[530,546,763,521,680,692,759,741]],
    ["#eee7f2",12,[463,488,295,322,84,155,80,171]],
    ["#eee7f2",16,[80,171,91,264,315,372,465,502]],
    ["#eee7f2",14,[542,490,713,286,902,147,907,161]],
    ["#eee7f2",13,[907,161,928,257,729,375,543,509]],
    ["#e7d9ed",12,[464,544,233,500,220,551,239,596]],
    ["#e7d9ed",11,[239,596,258,749,385,648,471,557]],
    ["#e7d9ed",14,[548,543,805,463,832,505,784,551]],
    ["#e7d9ed",10,[784,551,791,698,653,620,543,554]],
    ["#0c0b10",29,[506,444,471,512,524,609,503,699]],
    ["#522164",44,[473,507,346,355,275,386,364,463]],
    ["#d88bff",25,[464,510,343,432,326,392,345,393]],
    ["#130e19",22,[466,524,323,461,200,408,134,316]],
    ["#d88bff",27,[539,510,694,407,721,358,682,376]],
    ["#130e19",24,[546,522,769,452,813,394,839,351]],
    ["#522164",49,[477,555,383,629,406,699,307,800]],
    ["#d88bff",30,[469,562,315,597,326,688,352,656]],
    ["#130e19",23,[460,579,303,715,216,845,148,916]],
    ["#522164",52,[541,556,644,620,618,717,786,822]],
    ["#d88bff",31,[548,567,727,592,701,673,674,637]],
    ["#130e19",26,[556,585,664,715,742,790,804,856]],
    ["#e7d9ed",7,[460,541,358,485,295,494,325,525]],
    ["#e7d9ed",7,[554,537,719,454,756,474,717,508]],
    ["#e7d9ed",8,[506,475,490,524,512,563,501,600]],
    ["#100e14",7,[495,450,463,350,397,214,382,242]],
    ["#100e14",7,[516,451,562,343,620,213,634,240]],
  ];
  const paintDuration = 3500, settleDuration = 180;
  // Finish each wing with layered paint before moving the nozzle to the next.
  const paintOrder = [0,1,8,9,16,17,22,23,31,32,33,2,3,10,11,18,19,24,25,34,35,4,5,12,13,20,26,27,36,37,38,6,7,14,15,21,28,29,39,40,41,42,43,30,44,45,46];
  function preparePaint() {
    let seed=290926;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const dabs=[],drips=[];
    paintOrder.forEach((gestureIndex,pass)=>{
      const g=gestureIndex,[color,width,p]=gestures[g];
      const count=240;
      for(let n=0;n<=count;n++){
        const t=n/count,u=1-t;
        const x=u*u*u*p[0]+3*u*u*t*p[2]+3*u*t*t*p[4]+t*t*t*p[6];
        const y=u*u*u*p[1]+3*u*u*t*p[3]+3*u*t*t*p[5]+t*t*t*p[7];
        const pressure=(.2+.8*Math.pow(Math.sin(Math.PI*t),.6))*(.86+.14*Math.sin(n*.13+g));
        // Broad colour passes and broken fine highlights share the same nozzle path.
        const coverage=.72+.28*Math.sin(n*.097+g*1.8)**2;
        const radius=width*pressure*(g<8?2.6:g<16?2.45:1.15);
        const wobbleX=Math.sin(n*.113+g)*2.8+Math.sin(n*.043)*3.2;
        const wobbleY=Math.cos(n*.087+g)*3.3;
        const highlight=g>=22&&g<=29;
        const breakup=Math.sin(Math.floor(n/6)*127.1+g*311.7)*43758.5453;
        const skipHighlight=highlight&&breakup-Math.floor(breakup)>.82;
        const time=(pass+Math.pow(t,.88))/paintOrder.length;
        for(let j=0;j<30;j++){
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
          dabs.push({x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,r:.25+random()*.7,color,alpha:.04+random()*.14,time});
        }
        if((n===80||n===185)&&g<16&&g%3===0){
          drips.push({x,y:y+radius*.3,color,start:time,length:40+random()*125,width:1.2+random()*2.7,lean:random()*7-3.5});
          for(let j=0;j<24;j++){
            const angle=random()*Math.PI*2,dist=radius*(.6+random()*1.2);
            dabs.push({x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,r:.7+random()**3*4.5,color,alpha:.3+random()*.5,time});
          }
        }
      }
    });
    return {dabs,drips};
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
      '<canvas aria-label="Borboleta pintada por traços de spray"></canvas><span class="mt-intro__caption">UM TRAÇO. UMA IDENTIDADE.</span><div class="mt-intro__signature"><img src="assets/brand/signature.svg?v=20260928-2" alt="MT Studio"></div><button class="mt-intro__skip" type="button">Pular abertura ↗</button>';
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
        const pore=fine>.987?-7:0;
        noise.data[i]=23+grain+light+pore;noise.data[i+1]=22+grain+light+pore;noise.data[i+2]=26+grain+light+pore;noise.data[i+3]=255;
      }
      wc.putImageData(noise,0,0);
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
      buildWall(width,height);
      side = Math.min(width * 0.86, height * 0.74, 760);
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
    }
    window.addEventListener("resize", resize);
    resize();
    function frame(now) {
      if (finished) return;
      const progress = Math.min(1, (now - start) / paintDuration);
      while (index < dabs.length && dabs[index].time <= progress) {
        const d = dabs[index++];
        pc.fillStyle = d.color;pc.globalAlpha=d.alpha;
        pc.beginPath();pc.ellipse(d.x,d.y,d.r,d.r*(d.aspect||1),d.rotation||0,0,Math.PI*2);pc.fill();
      }
      draw();
      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        timeout = setTimeout(()=>{
          if(finished)return;
          root.classList.add("is-signed");
          timeout=setTimeout(finish,850);
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
