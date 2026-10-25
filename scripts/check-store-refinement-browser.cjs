/* Group 7C browser QA: scoped store refinement and approved-card preservation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer((req,res)=>{
    const file=path.join(root,decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return;}
    try {res.setHeader('Content-Type',({html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',jpg:'image/jpeg',png:'image/png'})[file.split('.').pop()]||'application/octet-stream');res.end(fs.readFileSync(file));}
    catch {res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const page=await browser.newPage({reducedMotion:'reduce'});
    await page.route('https://**/*',r=>r.abort()); // Exercise font fallback without external services.
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>sessionStorage.setItem('mtIntroSeen','1'));
    const url=`http://127.0.0.1:${server.address().port}/`;


    const baseline=require('node:child_process').execFileSync('git',['show','0efdb12ef0c8cc166e0f0cc8c14cf7e7dd1bcdc7:style.css'],{cwd:root,encoding:'utf8'});
    await page.addInitScript(()=>localStorage.setItem('mt-studio-product-drafts-v1',JSON.stringify([
      {id:'qa-roupas',name:'QA Roupas',price:49.9,category:'Roupas',description:'Prévia de teste.',image:'assets/rafa-joy-foto.jpg',kind:'ready',status:'preview',availability:'available'},
      {id:'qa-props',name:'QA Props',price:59.9,category:'Props',description:'Prévia de teste.',image:'assets/rafa-joy-foto.jpg',kind:'ready',status:'preview',availability:'available'}
    ])));
    const snapshot=()=>page.locator('#page-loja .shop-collections a').evaluateAll(els=>els.map(el=>({
      html:el.outerHTML,
      nodes:[el,...el.querySelectorAll('*')].map(node=>{
        const css=getComputedStyle(node),box=node.getBoundingClientRect();
        return {w:box.width,h:box.height,css:['font-family','font-size','font-weight','line-height','letter-spacing','padding','margin','border','border-radius','background','color'].map(p=>css.getPropertyValue(p))};
      }),
      mark:['width','height','right','bottom','opacity','background','transform'].map(p=>getComputedStyle(el,'::after').getPropertyValue(p))
    })));
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      const route=r=>r.fulfill({status:200,contentType:'text/css',body:baseline});
      await page.route('**/style.css?*',route);await page.goto(url+'#loja');
      const skip=page.locator('.mt-intro__skip');if(await skip.isVisible())await skip.click();
      const before=await snapshot();assert.equal(before.length,3);
      await page.unroute('**/style.css?*',route);await page.reload();
      assert.deepEqual(await snapshot(),before,`approved cards changed at ${width}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.locator('#page-loja img').evaluateAll(async els=>{for(const el of els){el.loading='eager';await el.decode();}});
      assert.equal(await page.locator('#mtShopDrafts .mt-shop-draft').count(),2);
      await page.locator('[data-shop-category="Roupas"]').click();assert.equal(await page.locator('#mtShopDrafts .mt-shop-draft').count(),1);
      assert.equal(await page.locator('[data-shop-category="Roupas"]').getAttribute('aria-pressed'),'true');
      await page.locator('[data-shop-category="Uniformes"]').click();assert.equal(await page.locator('#shopNoResults').isVisible(),true);
      await page.locator('[data-shop-category=""]').click();assert.equal(await page.locator('#mtShopDrafts .mt-shop-draft').count(),2);
      const discord=await page.locator('#page-loja a[href^="https:"]').evaluateAll(els=>els.map(el=>el.href));assert(discord.every(href=>href==='https://discord.gg/MAPubH3vRw'));
      await page.evaluate(()=>document.activeElement?.blur());
      await page.locator('.topbar').evaluate(el=>el.style.visibility='hidden');
      await page.locator('#page-loja').screenshot({path:`/tmp/mt-7c-store-${width}.png`});
      await page.locator('.topbar').evaluate(el=>el.style.visibility='');
      for(let i=0;i<3;i++) {
        await page.locator('#page-loja .shop-collections a').nth(i).click();
        await page.waitForFunction(()=>document.querySelector('#page-catalogo').classList.contains('active'));
        assert.equal(await page.locator('#category').inputValue(),['JBIB','LOWR','ACCS'][i]);
        if(await page.locator('.menu-toggle').isVisible())await page.locator('.menu-toggle').click();
        await page.locator('.nav-tab[data-page=loja]').click();await page.waitForFunction(()=>document.querySelector('#page-loja').classList.contains('active'));
      }
      console.log(`PASS ${width}: approved cards identical, filters, links, navigation, images, no overflow`);
    }
    const empty=await browser.newPage({viewport:{width:320,height:900},reducedMotion:'reduce'});
    await empty.route('https://**/*',r=>r.abort());empty.on('pageerror',e=>errors.push(e.message));
    await empty.addInitScript(()=>sessionStorage.setItem('mtIntroSeen','1'));
    await empty.goto(url+'#loja');const skipEmpty=empty.locator('.mt-intro__skip');if(await skipEmpty.isVisible())await skipEmpty.click();
    assert.equal(await empty.locator('#shopEmpty').isVisible(),true);
    assert.equal(await empty.locator('#mtShopDrafts .mt-shop-draft').count(),0);
    await empty.locator('#mtShopPhoto').evaluate(el=>el.decode());
    assert.equal(await empty.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await empty.locator('#page-loja').screenshot({path:'/tmp/mt-7c-store-empty-320.png'});
    await empty.close();console.log('PASS empty store: approved image, zero products, no overflow');
    assert.deepEqual(errors,[],'JavaScript errors');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
