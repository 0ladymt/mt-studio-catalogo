/* MT Studio: composição única baseada no manual da marca 2026.
   Não modifica os dados de catálogo, o visualizador ou pagamentos. */
(() => {
  const art=document.querySelector('#mtIntro .mt-intro__art');
  if(art){
    // A pintura É uma borboleta formada por passadas de tinta; não há PNG
    // aparecendo pronto, moldura cinza ou ícone revelado depois.
    art.innerHTML=String.raw`<svg class="mt-intro__street" viewBox="0 0 760 510" role="img" aria-label="Borboleta pichada em traços de tinta roxa, preta e branca">
      <defs>
        <filter id="mtSprayRough"><feTurbulence type="fractalNoise" baseFrequency=".028" numOctaves="3" seed="19" result="grain"/><feDisplacementMap in="SourceGraphic" in2="grain" scale="6"/></filter>
        <linearGradient id="mtSprayPurple"><stop stop-color="#d88bff"/><stop offset=".5" stop-color="#a320ff"/><stop offset="1" stop-color="#76239b"/></linearGradient>
      </defs>
      <g fill="none" stroke-linejoin="round" stroke-linecap="round" filter="url(#mtSprayRough)">
        <path class="mt-intro__paint-reveal" stroke="#09070c" stroke-width="64" d="M373 247C309 169 235 102 99 65L157 145 65 132 158 184 96 219 233 218 342 301"/>
        <path class="mt-intro__paint-reveal" stroke="#09070c" stroke-width="64" d="M390 247C476 155 555 100 669 65L603 143 698 133 599 183 661 222 526 219 409 301"/>
        <path class="mt-intro__paint-reveal" stroke="#09070c" stroke-width="60" d="M339 309C253 259 169 268 72 312L154 321 87 369 184 360 137 443 247 383 347 343"/>
        <path class="mt-intro__paint-reveal" stroke="#09070c" stroke-width="60" d="M411 309C494 257 594 270 690 312L599 326 669 373 577 363 622 442 510 384 408 342"/>
        <path class="mt-intro__paint-reveal" stroke="url(#mtSprayPurple)" stroke-width="34" d="M374 245C307 167 235 99 97 65L155 145 68 132 160 185 97 218 234 219 341 301M390 246C478 153 558 98 668 66L603 144 697 132 597 185 661 220 527 218 409 301"/>
        <path class="mt-intro__paint-reveal" stroke="#bc40ed" stroke-width="31" d="M339 308C252 257 167 270 74 310L157 326 89 368 183 361 138 439 248 381 346 344M410 308C497 260 594 271 688 312L599 327 667 370 578 364 618 441 510 383 409 342"/>
        <path class="mt-intro__paint-reveal" stroke="#f3dafa" stroke-width="11" d="M380 193L377 364M373 217L342 173M385 217L418 173M331 322L291 335M421 319L471 334"/>
      </g>
      <g class="mt-intro__spray-specks" fill="#ad31e1"><path d="M159 358v78q0 16 9 16t9-17v-77M220 379v47q0 14 8 14t8-14v-53M532 378v72q0 17 9 17t8-16v-71M589 363v56q0 15 9 15t9-15v-57M370 352v95q0 17 9 17t9-17v-95"/><circle cx="81" cy="85" r="4"/><circle cx="110" cy="451" r="5"/><circle cx="682" cy="102" r="6"/><circle cx="655" cy="457" r="4"/><circle cx="276" cy="466" r="3"/><circle cx="486" cy="466" r="3"/></g>
    </svg>`;
  }
  // A assinatura entra depois da pintura pela linha do tempo do CSS.
  // Substitui somente o branco/lilás exterior conectado às bordas.
  // A região central da mascote é protegida, inclusive o pelo claro do Joy.
  function integratePortrait(img){
    if(!img)return;
    const run=()=>{
      if(!img.naturalWidth||img.dataset.mtDone)return;
      const w=Math.min(950,img.naturalWidth),h=Math.round(w*img.naturalHeight/img.naturalWidth);
      const canvas=document.createElement('canvas');canvas.className='mt-portrait-canvas';canvas.width=w;canvas.height=h;
      canvas.setAttribute('role','img');canvas.setAttribute('aria-label',img.alt||'Rafa e Joy');
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
      try{
        ctx.drawImage(img,0,0,w,h);
        const pixels=ctx.getImageData(0,0,w,h),p=pixels.data,seen=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;
        const bg=n=>{const k=n*4,r=p[k],g=p[k+1],b=p[k+2],min=Math.min(r,g,b),max=Math.max(r,g,b);
          return (r>206&&g>192&&b>203&&max-min<82)||(r>178&&g>153&&b>185&&max-min<62);
        };
        const push=n=>{if(!seen[n]&&bg(n)){seen[n]=1;q[tail++]=n}};
        for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}
        for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
        while(head<tail){const n=q[head++],x=n%w,y=Math.floor(n/w);if(x)push(n-1);if(x<w-1)push(n+1);if(y)push(n-w);if(y<h-1)push(n+w)}
        // Remove apenas o fundo externo e suaviza um contorno mínimo.
        const edge=new Uint8Array(seen);
        for(let n=0;n<seen.length;n++)if(seen[n]){p[n*4+3]=0;const x=n%w,y=Math.floor(n/w);for(const m of [x?n-1:n,x<w-1?n+1:n,y?n-w:n,y<h-1?n+w:n])if(!edge[m])p[m*4+3]=Math.min(p[m*4+3],160)}
        ctx.putImageData(pixels,0,0);
        img.after(canvas);img.classList.add('mt-portrait-processed');img.dataset.mtDone='1';
      }catch(e){canvas.remove();console.warn('Retrato original mantido:',e)}
    };
    if(img.complete&&img.naturalWidth)run();else img.addEventListener('load',run,{once:true});
  }
  integratePortrait(document.getElementById('mtRafaJoy'));
  integratePortrait(document.getElementById('mtAboutRafaJoy'));
  // As imagens do catálogo contêm o fundo roxo gravado nos pixels.
  // Neutralizar esse fundo evita discrepância entre previews processadas e novas.
  const cache=new Map(),grid=document.getElementById('grid');
  function studioPreview(img){
    if(!img||img.dataset.mtStudioPreview)return;
    img.dataset.mtStudioPreview='1';
    const apply=()=>{
      const src=img.currentSrc||img.src;
      if(!img.naturalWidth||!img.isConnected||src.startsWith('data:'))return;
      if(cache.has(src)){img.src=cache.get(src);return}
      try{
        const w=Math.min(540,img.naturalWidth),h=Math.round(w*img.naturalHeight/img.naturalWidth);
        const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);
        const d=x.getImageData(0,0,w,h),p=d.data;
        for(let i=0;i<p.length;i+=4){
          const r=p[i],g=p[i+1],b=p[i+2],v=Math.max(r,g,b),m=Math.min(r,g,b);
          const purple=g<100&&r>g*1.28&&b>g*1.32&&b>r*.73&&r<155;
          const dark=r<37&&g<37&&b<40;
          if(purple||dark){const grain=(r+g+b)%7;p[i]=43+grain;p[i+1]=40+grain;p[i+2]=47+grain;}
        }
        x.putImageData(d,0,0);const url=c.toDataURL('image/webp',.9);cache.set(src,url);img.src=url;
      }catch(e){console.warn('Preview original mantida:',e)}
    };
    if(img.complete&&img.naturalWidth)apply();else img.addEventListener('load',apply,{once:true});
  }
  if(grid){
    const observer=new MutationObserver(()=>grid.querySelectorAll('img.thumb:not([data-mt-studio-preview])').forEach(studioPreview));
    observer.observe(grid,{childList:true,subtree:true});
    grid.querySelectorAll('img.thumb').forEach(studioPreview);
  }
})();