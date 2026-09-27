/* MT Studio — grafite desenhado por tinta e retrato integrado ao fundo dark. */
(() => {
  const art = document.querySelector('#mtIntro .mt-intro__art');
  if (art) {
    // A borboleta é formada pelos próprios traços de spray. Não há PNG revelado.
    art.innerHTML = `<svg class="mt-intro__wall" viewBox="0 0 760 530" role="img" aria-label="Pichação de borboleta em tinta roxa, preta e branca sendo desenhada sobre uma parede">
      <defs>
        <filter id="mtConcrete" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="3" seed="16" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope=".22" intercept=".22"/><feFuncG type="linear" slope=".22" intercept=".21"/><feFuncB type="linear" slope=".22" intercept=".24"/></feComponentTransfer></filter>
        <filter id="mtPaintRough" x="-12%" y="-12%" width="124%" height="124%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="11" result="rough"/><feDisplacementMap in="SourceGraphic" in2="rough" scale="9"/></filter>
        <linearGradient id="mtPaint" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#edb9ff"/><stop offset=".42" stop-color="#b837ed"/><stop offset="1" stop-color="#73299d"/></linearGradient>
      </defs>
      <rect x="5" y="5" width="750" height="520" rx="2" fill="#28252b" opacity=".45"/>
      <rect x="5" y="5" width="750" height="520" rx="2" filter="url(#mtConcrete)" opacity=".6"/>
      <g fill="none" stroke-linejoin="round" stroke-linecap="round" filter="url(#mtPaintRough)">
        <path class="mt-intro__wing-ink" d="M376 258 C301 167 210 119 95 78 Q159 125 180 160 L82 146 174 191 109 224 233 208 348 301" stroke="#141116" stroke-width="53"/>
        <path class="mt-intro__wing-ink" d="M389 260 C473 166 568 120 676 79 L584 158 690 148 591 194 652 225 525 209 406 302" stroke="#151017" stroke-width="56"/>
        <path class="mt-intro__wing-ink" d="M355 302 C263 258 166 265 70 312 L156 319 87 362 174 352 130 431 239 374 354 338" stroke="#151017" stroke-width="55"/>
        <path class="mt-intro__wing-ink" d="M410 301 C502 263 591 269 687 310 L603 320 670 365 587 351 632 430 517 376 406 338" stroke="#141116" stroke-width="54"/>
        <path class="mt-intro__wing-ink" d="M378 260 C308 166 213 116 96 80 L175 166 82 149 224 217 355 303 M386 261 C472 166 568 120 673 82 L585 163 682 147 537 215 405 303 M355 307 C269 269 171 267 73 315 L157 320 91 364 177 354 133 430 236 373 354 339 M409 307 C498 267 587 267 680 315 L603 325 667 365 584 355 627 429 514 376 408 339" stroke="url(#mtPaint)" stroke-width="26"/>
        <path class="mt-intro__wing-ink" d="M376 249 Q376 303 378 370 M375 249 L351 212 M383 245 L413 206" stroke="#f9e8ff" stroke-width="13"/>
      </g>
      <g class="mt-intro__wall-splat" fill="#a63bd8">
        <circle cx="104" cy="93" r="5"/><circle cx="78" cy="205" r="3"/><circle cx="132" cy="400" r="7"/><circle cx="205" cy="460" r="3"/><circle cx="649" cy="96" r="5"/><circle cx="678" cy="250" r="4"/><circle cx="599" cy="460" r="7"/><circle cx="510" cy="435" r="3"/>
        <path d="M171 361v83q0 17 10 16t8-17v-80M228 376v58q0 15 8 14t6-13v-53M554 365v84q0 21 11 21t9-19v-87M609 358v58q0 17 10 15t7-16v-58"/>
      </g>
      <g class="mt-intro__wall-splat" fill="none" stroke="#f4e4ff" stroke-width="5" opacity=".85"><path d="M99 83L77 64 M670 84l26-21 M78 314L48 311 M682 316l28-5"/></g>
    </svg>`;
  }

  /* Elimina apenas o fundo CLARO conectado à borda da ilustração.
     O branco interno do pelo do Joy fica protegido pela barreira de contorno. */
  function darkenPortrait(img) {
    if (!img || img.dataset.mtPortraitReady) return;
    const render = () => {
      if (img.dataset.mtPortraitReady || !img.naturalWidth) return;
      const w = Math.min(1000, img.naturalWidth);
      const h = Math.round(w * img.naturalHeight / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.className = 'mt-portrait-canvas';
      canvas.width = w; canvas.height = h;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', img.alt || 'Rafa e Joy');
      const context = canvas.getContext('2d', {willReadFrequently:true});
      if (!context) return;
      try {
        context.drawImage(img,0,0,w,h);
        const data=context.getImageData(0,0,w,h),pixels=data.data;
        const marked=new Uint8Array(w*h),queue=new Int32Array(w*h);
        let head=0,tail=0;
        const light = index => {
          const p=index*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2];
          return (r>215&&g>203&&b>207) || (r>189&&g>174&&b>190&&Math.max(r,g,b)-Math.min(r,g,b)<63);
        };
        const add=index=>{if(!marked[index]&&light(index)){marked[index]=1;queue[tail++]=index;}};
        for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
        for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
        while(head<tail){
          const n=queue[head++],x=n%w,y=(n/w)|0;
          if(x>0)add(n-1);if(x<w-1)add(n+1);
          if(y>0)add(n-w);if(y<h-1)add(n+w);
        }
        // Suaviza um pixel do limite, sem apagar regiões claras isoladas do rosto ou pelo.
        for(let n=0;n<marked.length;n++)if(marked[n])pixels[n*4+3]=0;
        context.putImageData(data,0,0);
        img.after(canvas);
        img.classList.add('mt-portrait-processed');
        img.dataset.mtPortraitReady='1';
      } catch(error) {
        console.warn('A foto original permanece visível; processamento não disponível:',error);
        canvas.remove();
      }
    };
    if(img.complete && img.naturalWidth) render();
    else img.addEventListener('load',render,{once:true});
  }
  darkenPortrait(document.getElementById('mtRafaJoy'));
  darkenPortrait(document.getElementById('mtAboutRafaJoy'));
})();