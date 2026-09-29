/* Native spray simulation: hand-plotted nozzle gestures inspired by the supplied
   butterfly mural. No butterfly image, SVG, silhouette mask or pixel sampling. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let closeActive = null;
  // Hand-plotted spray gestures following the supplied mural's asymmetric wings.
  // Each cubic is a nozzle trajectory, not a silhouette, bitmap or reveal mask.
  const gestures = [
    ["#100e14",58,[490,510,370,265,165,135,75,130]],
    ["#100e14",48,[75,130,30,205,160,360,475,520]],
    ["#100e14",65,[515,510,655,270,885,145,934,60]],
    ["#100e14",51,[934,60,970,245,852,420,530,525]],
    ["#100e14",48,[485,540,220,405,135,470,161,677]],
    ["#100e14",57,[161,677,230,940,346,785,491,553]],
    ["#100e14",56,[523,543,745,394,900,430,830,654]],
    ["#100e14",50,[830,654,815,927,665,826,516,556]],
    ["#8734b9",38,[481,504,295,308,174,195,116,188]],
    ["#a64ce0",52,[116,188,128,326,305,351,476,515]],
    ["#8734b9",34,[523,498,690,284,841,191,899,126]],
    ["#ac53df",57,[899,126,908,290,743,355,535,514]],
    ["#a64ce0",48,[475,536,282,443,172,497,211,624]],
    ["#9140c2",42,[211,624,257,816,356,741,483,552]],
    ["#a64ce0",52,[536,533,735,430,843,451,793,608]],
    ["#9140c2",40,[793,608,792,836,658,744,525,551]],
    ["#121016",29,[471,508,355,352,230,274,214,280]],
    ["#121016",31,[214,280,168,327,387,452,480,521]],
    ["#121016",33,[533,510,700,316,826,271,836,296]],
    ["#121016",27,[836,296,843,338,676,452,534,527]],
    ["#17111c",28,[478,549,285,526,306,685,266,706]],
    ["#17111c",32,[530,546,763,521,680,692,759,741]],
    ["#decfe4",12,[463,488,295,322,84,155,80,171]],
    ["#decfe4",16,[80,171,91,264,315,372,465,502]],
    ["#e0d3e6",14,[542,490,713,286,902,147,907,161]],
    ["#e0d3e6",13,[907,161,928,257,729,375,543,509]],
    ["#d4bddb",12,[464,544,233,500,220,551,239,596]],
    ["#d4bddb",11,[239,596,258,749,385,648,471,557]],
    ["#d4bddb",14,[548,543,805,463,832,505,784,551]],
    ["#d4bddb",10,[784,551,791,698,653,620,543,554]],
    ["#0c0b10",29,[506,444,471,512,524,609,503,699]],
    ["#522164",44,[473,507,346,355,275,386,364,463]],
    ["#b864df",25,[464,510,343,432,326,392,345,393]],
    ["#130e19",22,[466,524,323,461,200,408,134,316]],
    ["#b864df",27,[539,510,694,407,721,358,682,376]],
    ["#130e19",24,[546,522,769,452,813,394,839,351]],
    ["#522164",49,[477,555,383,629,406,699,307,800]],
    ["#b864df",30,[469,562,315,597,326,688,352,656]],
    ["#130e19",23,[460,579,303,715,216,845,148,916]],
    ["#522164",52,[541,556,644,620,618,717,786,822]],
    ["#b864df",31,[548,567,727,592,701,673,674,637]],
    ["#130e19",26,[556,585,664,715,742,790,804,856]],
    ["#d4bddb",7,[460,541,358,485,295,494,325,525]],
    ["#d4bddb",7,[554,537,719,454,756,474,717,508]],
    ["#d4bddb",8,[506,475,490,524,512,563,501,600]],
    ["#100e14",7,[495,450,463,350,397,214,382,242]],
    ["#100e14",7,[516,451,562,343,620,213,634,240]],
  ];
  const paintDuration = 7100, settleDuration = 650;
  function preparePaint() {
    let seed=290926;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const dabs=[],drips=[];
    gestures.forEach(([color,width,p],g)=>{
      const count=240;
      for(let n=0;n<=count;n++){
        const t=n/count,u=1-t;
        const x=u*u*u*p[0]+3*u*u*t*p[2]+3*u*t*t*p[4]+t*t*t*p[6];
        const y=u*u*u*p[1]+3*u*u*t*p[3]+3*u*t*t*p[5]+t*t*t*p[7];
        const pressure=(.2+.8*Math.pow(Math.sin(Math.PI*t),.6))*(.86+.14*Math.sin(n*.13+g));
        const radius=width*pressure*(g<8?2.25:g<16?1.7:1);
        const time=(g+t)/gestures.length;
        for(let j=0;j<30;j++){
          const angle=random()*Math.PI*2,dist=Math.sqrt(random())*radius*.52;
          const px=x+Math.cos(angle)*dist,py=y+Math.sin(angle)*dist;
          // Stationary wall pores break coverage, even on overlapping passes.
          const pore=Math.sin(Math.floor(px)*127.1+Math.floor(py)*311.7)*43758.5453;
          if(pore-Math.floor(pore)>.91||random()<.07)continue;
          dabs.push({x:px,y:py,r:.35+random()*1.65,color,alpha:.28+random()*.46,time});
        }
        for(let j=0;j<4;j++){
          const angle=random()*Math.PI*2,dist=radius*(.4+random()*.55);
          dabs.push({x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,r:.25+random()*.7,color,alpha:.04+random()*.14,time});
        }
        if(n===80&&g<16&&g%3===0){
          drips.push({x,y:y+radius*.3,color,start:time,length:35+random()*100,width:1+random()*2,lean:random()*5-2.5});
          for(let j=0;j<18;j++){
            const angle=random()*Math.PI*2,dist=radius*(.6+random()*1.2);
            dabs.push({x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,r:.6+random()**3*3,color,alpha:.25+random()*.5,time});
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
    pigment.width = pigment.height = 1000;
    const pc = pigment.getContext("2d");
    const {dabs,drips}=preparePaint();
    // Full-viewport plaster, generated independently from the butterfly.
    const wall=document.createElement("canvas");wall.width=wall.height=384;
    const wc=wall.getContext("2d"),noise=wc.createImageData(384,384);
    let wallSeed=41;
    for(let i=0;i<noise.data.length;i+=4){
      wallSeed=(Math.imul(wallSeed,1664525)+1013904223)>>>0;
      const grain=(wallSeed/4294967296-.5)*13;
      noise.data[i]=38+grain;noise.data[i+1]=37+grain;noise.data[i+2]=41+grain;noise.data[i+3]=255;
    }
    wc.putImageData(noise,0,0);
    const wallPattern=ctx.createPattern(wall,"repeat");
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
      ctx.fillStyle=wallPattern;ctx.fillRect(0,0,width,height);
      ctx.drawImage(pigment, left, top, side, side);
      const elapsed=(performance.now()-start)/paintDuration;
      ctx.save();ctx.translate(left,top);ctx.scale(side/1000,side/1000);
      for(const d of drips){
        const age=Math.max(0,Math.min(1,(elapsed-d.start)/.26));if(!age)continue;
        const length=d.length*(1-Math.pow(1-age,2));
        ctx.strokeStyle=d.color;ctx.lineWidth=d.width;ctx.globalAlpha=.75;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.quadraticCurveTo(d.x+d.lean,d.y+length*.6,d.x+d.lean*.7,d.y+length);ctx.stroke();
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
        pc.beginPath();pc.arc(d.x,d.y,d.r,0,Math.PI*2);pc.fill();
      }
      draw();
      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        timeout = setTimeout(()=>{
          if(finished)return;
          root.classList.add("is-signed");
          timeout=setTimeout(finish,1500);
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
