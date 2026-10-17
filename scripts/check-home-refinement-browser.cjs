/* Group 7B browser QA: Home project preview, portrait and existing galleries. */
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
      await page.setViewportSize({width,height:900});await page.goto(url);
      const skip=page.locator('.mt-intro__skip');if(await skip.isVisible())await skip.click();
      const cards=page.locator('#mtHomeProjects .mt-project');assert.equal(await cards.count(),4);
      const expected=['Projeto Kings','Projeto Alemanha','Projeto Shelby','Projeto Montenegro'];
      assert.deepEqual(await cards.locator('h3').allTextContents(),expected);
      await page.locator('#page-home img').evaluateAll(async els=>{for(const el of els){el.loading='eager';await el.decode().catch(()=>{});}});
      assert.deepEqual(await page.locator('#page-home img').evaluateAll(els=>els.filter(el=>!el.complete||!el.naturalWidth).map(el=>el.src)),[]);
      const grid=await cards.evaluateAll(els=>els.map(el=>({x:Math.round(el.getBoundingClientRect().x),w:Math.round(el.getBoundingClientRect().width),y:Math.round(el.getBoundingClientRect().y)})));
      assert.equal(new Set(grid.map(el=>el.x)).size,width>=768?2:1);
      assert.equal(new Set(grid.map(el=>el.w)).size,1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.locator('#mtRafaJoy').evaluate(el=>Math.abs(el.getBoundingClientRect().width/el.getBoundingClientRect().height-590/695)<.001),true);
      assert.equal(await page.locator('#mtHuman .mt-human__photo').evaluate(el=>getComputedStyle(el,'::before').content),'none');
      assert.equal(await page.locator('#mtHuman .mt-title-end').evaluate(el=>getComputedStyle(el,'::after').display),'inline-block');
      await page.locator('.topbar').evaluate(el=>el.style.visibility='hidden');
      await page.locator('#mtHomeProjects').screenshot({path:`/tmp/mt-7b-projects-${width}.png`});
      await page.locator('#mtHuman').screenshot({path:`/tmp/mt-7b-portrait-${width}.png`});
      await page.locator('#page-home .mt-cta').screenshot({path:`/tmp/mt-7b-cta-${width}.png`});
      await page.locator('.topbar').evaluate(el=>el.style.visibility='');
      for(let i=0;i<4;i++) {
        assert.equal(await cards.nth(i).getAttribute('href'),'#projetos');await cards.nth(i).click();
        await page.waitForFunction(()=>document.querySelector('#projectModal').getAttribute('aria-hidden')==='false');
        assert.equal(await page.locator('#projectTitle').textContent(),expected[i]);
        await page.locator('#projectMainImage').evaluate(el=>el.decode());
        assert.equal(await page.locator('#projectMainImage').evaluate(el=>el.naturalWidth>0),true);
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>document.querySelector('#projectModal').getAttribute('aria-hidden')==='true');
      }
      await page.locator('#mtHuman a').click();await page.waitForFunction(()=>document.querySelector('#page-sobre').classList.contains('active'));
      console.log(`PASS ${width}: four projects, galleries, portrait ratio, links, images, no overflow`);
    }
    assert.deepEqual(errors,[],'JavaScript errors');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
