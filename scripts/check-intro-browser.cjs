/* Group 7G: real Chromium intro progression and interaction QA. */
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
    const page=await browser.newPage();
    await page.route('https://**/*',r=>r.abort());
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}/`;
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.goto(url+'#sobre');
      const replay=page.locator('.replay-intro');await replay.click();
      await page.waitForSelector('.mt-intro');
      assert.equal(await page.locator('.mt-intro__skip').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Tab');assert.equal(await page.locator('.mt-intro__skip').evaluate(el=>el===document.activeElement),true);
      const frames=[];
      for(const delay of [250,350,450]) {
        await page.waitForTimeout(delay);
        assert.equal(await page.locator('.mt-intro').evaluate(el=>el.classList.contains('is-signed')),false);
        frames.push(await page.locator('.mt-intro canvas').evaluate(el=>el.toDataURL()));
        await page.screenshot({path:`/tmp/mt-7g-${width}-${frames.length}.png`});
      }
      assert.equal(new Set(frames).size,3,'progressive pigment deposition');
      await page.waitForFunction(()=>document.querySelector('.mt-intro')?.classList.contains('is-signed'));
      await page.waitForTimeout(350);
      assert.ok(Number(await page.locator('.mt-intro__signature').evaluate(el=>getComputedStyle(el).opacity))>.5,'signature visible only after paint');
      await page.screenshot({path:`/tmp/mt-7g-${width}-signed.png`});
      await page.waitForSelector('.mt-intro',{state:'detached'});
      assert.equal(await replay.evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await replay.click();await page.locator('.mt-intro__skip').click();await page.waitForSelector('.mt-intro',{state:'detached'});
      assert.equal(await replay.evaluate(el=>el===document.activeElement),true);
      await replay.click();await page.keyboard.press('Escape');await page.waitForSelector('.mt-intro',{state:'detached'});
      await page.emulateMedia({reducedMotion:'reduce'});await replay.click();assert.equal(await page.locator('.mt-intro').count(),0);
      await page.emulateMedia({reducedMotion:'no-preference'});await replay.click();
      await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('.mt-intro',{state:'detached'});
      await page.emulateMedia({reducedMotion:'no-preference'});
      if(await page.locator('.menu-toggle').isVisible())await page.locator('.menu-toggle').click();
      await page.locator('.nav-tab[data-page=home]').click();await page.waitForFunction(()=>document.querySelector('#page-home').classList.contains('active'));
      const skip=page.locator('.mt-intro__skip');if(await skip.isVisible())await skip.click();
      console.log(`PASS ${width}: progressive paint, delayed signature, skip, Escape, Tab/focus, replay, reduced motion, navigation, no overflow`);
    }
    assert.deepEqual(errors,[],'JavaScript errors');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
