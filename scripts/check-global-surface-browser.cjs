/* Group 7A browser QA: global surface, existing pages and navigation. */
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

    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      for(const name of ['home','loja','catalogo','sobre','redes','projetos','admin']) {
        await page.goto(url+'#'+name);
        const skip=page.locator('.mt-intro__skip');if(await skip.isVisible())await skip.click();
        await page.waitForTimeout(250);
        const active=page.locator('.page.active');assert.equal(await active.count(),1);assert.equal(await active.getAttribute('id'),'page-'+name);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}/${width} overflow`);
        await active.locator('img').evaluateAll(async els=>{for(const el of els){el.loading='eager';await el.decode().catch(()=>{});}});
        const broken=await active.locator('img').evaluateAll(els=>els.filter(el=>!el.complete||!el.naturalWidth).map(el=>el.src));
        assert.deepEqual(broken,[],`${name}/${width} images`);
        assert.equal(await page.locator('.mt-wall-marks').evaluate(el=>getComputedStyle(el,'::before').backgroundRepeat),'no-repeat');
        if(name==='home') {
          assert.equal(await page.locator('#page-home').evaluate(el=>getComputedStyle(el,'::before').backgroundRepeat),'no-repeat');
          assert.equal(await page.locator('.mt-home-hero .mt-overline').evaluate(el=>getComputedStyle(el,'::after').backgroundImage.includes('underline.svg')),true);
          await page.screenshot({path:`/tmp/mt-7a-home-${width}.png`,fullPage:true});
        }
        // Exercise existing menu navigation to Home after every page.
        if(await page.locator('.menu-toggle').isVisible())await page.locator('.menu-toggle').click();
        await page.locator('.nav-tab[data-page=home]').click();
        await page.waitForFunction(()=>document.querySelector('#page-home').classList.contains('active'));
      }
      console.log(`PASS ${width}: pages, images, navigation, no overflow`);
    }
    assert.deepEqual(errors,[],'JavaScript errors');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
