/* Group 7D browser QA: catalog previews, filters and real WebGL loading invariants. */
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
  const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({reducedMotion:'reduce'});
    await page.route('https://**/*',r=>r.abort()); // Exercise font fallback without external services.
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>sessionStorage.setItem('mtIntroSeen','1'));
    const url=`http://127.0.0.1:${server.address().port}/`;


    const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('const catalogViewer = new CatalogViewer();','const catalogViewer = new CatalogViewer(); window.__qaViewer = catalogViewer;');
    await page.route('**/app.js?*',r=>r.fulfill({status:200,contentType:'text/javascript',body:source}));
    await page.addInitScript(()=>navigator.clipboard.writeText=async text=>window.__qaCopied=text);
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});await page.goto(url+'#catalogo');
      const skip=page.locator('.mt-intro__skip');if(await skip.isVisible())await skip.click();
      await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===360);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.locator('#search').fill('accs_000_u.ydd');assert.equal(await page.locator('#grid .card').count(),3);
      await page.locator('#gender').selectOption('FEMININO');assert.equal(await page.locator('#grid .card').count(),2);
      await page.locator('#category').selectOption('ACCS');assert.equal(await page.locator('#grid .card').count(),2);
      await page.locator('.btn-copy').first().click();assert((await page.evaluate(()=>window.__qaCopied)).includes('accs_000_u.ydd'));
      const image=page.locator('#grid .thumb').first();await image.evaluate(el=>el.decode());assert.equal(await image.evaluate(el=>el.naturalWidth),1024);
      assert((await image.getAttribute('src')).includes('assets/catalog-previews/'));
      await page.locator('#search').fill('');await page.locator('#gender').selectOption('');await page.locator('#category').selectOption('');
      await page.locator('.topbar').evaluate(el=>el.style.visibility='hidden');
      await page.locator('#page-catalogo .hero').screenshot({path:`/tmp/mt-7d-hero-${width}.png`});
      await page.locator('#grid .card').first().screenshot({path:`/tmp/mt-7d-card-${width}.png`});
      await page.locator('.topbar').evaluate(el=>el.style.visibility='');
      await page.locator('.btn-3d').first().click();
      await page.waitForFunction(()=>window.__qaViewer.current&&window.__qaViewer.renderer);
      assert.equal(await page.locator('.catalog-viewer-canvas').isVisible(),true,'real WebGL required');
      const fit=await page.evaluate(()=>{const v=window.__qaViewer;return {radius:v.radius,distance:v.camera.position.length(),aspect:v.camera.aspect};});assert(fit.distance>fit.radius);
      assert.equal(await page.evaluate(()=>document.querySelector('#modal .modal-box').scrollWidth>document.querySelector('#modal .modal-box').clientWidth),false);
      await page.locator('#modal .viewer-wrap').screenshot({path:`/tmp/mt-7d-viewer-${width}.png`});
      await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').getAttribute('aria-hidden'),'true');
      console.log(`PASS ${width}: filters, search, copy, high-resolution preview, real WebGL, fit and no overflow`);
    }
    await page.setViewportSize({width:1440,height:900});await page.goto(url+'#catalogo');
    await page.locator('.btn-3d').first().click();await page.waitForFunction(()=>window.__qaViewer.current&&window.__qaViewer.renderer);
    await page.evaluate(()=>{window.__qaOld=window.__qaViewer.object;window.__qaCanvas=window.__qaViewer.renderer.domElement;});
    let release,requested;const requestedPromise=new Promise(r=>requested=r);const hold=new Promise(r=>release=r);
    await page.route('**/assets/models/feminino_accs_02.obj',async r=>{requested();await hold;await r.continue().catch(()=>{});});
    await page.locator('.catalog-viewer-navigation button').nth(1).click();await requestedPromise;
    assert.equal(await page.evaluate(()=>window.__qaViewer.object===window.__qaOld&&window.__qaViewer.renderer.domElement===window.__qaCanvas),true);
    assert.equal(await page.locator('.catalog-viewer-canvas').isVisible(),true);
    const rasterBefore=await page.locator('.catalog-viewer-canvas').screenshot();await page.waitForTimeout(200);
    assert.deepEqual(await page.locator('.catalog-viewer-canvas').screenshot(),rasterBefore,'canvas changed during slow load');
    release();await page.waitForFunction(()=>window.__qaViewer.current?.id==='feminino_accs_02');
    await page.unroute('**/assets/models/feminino_accs_02.obj');
    await page.evaluate(()=>window.__qaOld=window.__qaViewer.object);
    await page.route('**/assets/models/feminino_accs_03.obj',r=>r.fulfill({status:503,body:'QA failure'}));
    await page.locator('.catalog-viewer-navigation button').nth(1).click();await page.waitForFunction(()=>document.querySelector('#viewerLoading').textContent.includes('mantido'));
    assert.equal(await page.evaluate(()=>window.__qaViewer.object===window.__qaOld),true);assert.equal(await page.locator('.catalog-viewer-canvas').isVisible(),true);
    await page.unroute('**/assets/models/feminino_accs_03.obj');
    let lateRelease,lateRequested;const latePromise=new Promise(r=>lateRequested=r);const lateHold=new Promise(r=>lateRelease=r);
    await page.route('**/assets/models/feminino_accs_03.obj',async r=>{lateRequested();await lateHold;await r.continue().catch(()=>{});});
    await page.locator('.catalog-viewer-navigation button').nth(1).click();await latePromise;await page.locator('#closeModal').click();lateRelease();await page.waitForTimeout(400);
    assert.equal(await page.locator('#modal').getAttribute('aria-hidden'),'true');assert.equal(await page.evaluate(()=>window.__qaViewer.active),false);
    assert.equal(await page.locator('.catalog-viewer-canvas').count(),0);
    assert.deepEqual(errors,[],'JavaScript errors');
    console.log('PASS real WebGL: slow load raster retained, ready-only swap, file failure retention, close during load and late response protection');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
