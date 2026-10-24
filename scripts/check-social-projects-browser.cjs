/* Group 6 browser QA: social destinations, editorial gallery and existing dialogs. */
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
    const links=['https://discord.gg/MAPubH3vRw','https://www.instagram.com/mt_studiocriativo/','https://www.tiktok.com/@mt_studiocriativo','https://www.youtube.com/@mtstudiocriativo','https://www.pinterest.com/mt_studiocriativo/','https://x.com/mt_studiobr'];
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});await page.goto(url+'?qa='+width+'#redes');
      const skip=page.locator('.mt-intro__skip');if(await skip.isVisible())await skip.click();
      const social=page.locator('#page-redes .social-row');assert.equal(await social.count(),6);
      assert.deepEqual(await social.evaluateAll(els=>els.map(el=>el.href)),links);
      const layout=await social.evaluateAll(els=>els.map(el=>({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,h:el.getBoundingClientRect().height,color:getComputedStyle(el.querySelector('.social-icon')).color,svg:el.querySelector('svg').getBoundingClientRect().height})));
      const columns=new Set(layout.map(el=>Math.round(el.x))).size;
      assert.equal(columns,width===1440?3:width===768?2:1);
      assert.equal(new Set(layout.map(el=>el.color)).size,1);assert.equal(layout[0].color,'rgb(216, 139, 255)');
      assert.equal(new Set(layout.map(el=>el.svg)).size,1);
      if(width===1440){assert.equal(new Set(layout.map(el=>el.h)).size,1);assert.equal(new Set(layout.map(el=>Math.round(el.y))).size,2);}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'social overflow');
      await page.emulateMedia({reducedMotion:'no-preference'});await social.first().hover();await page.waitForTimeout(250);
      assert.equal(await social.first().evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(159, 113, 186)');
      await page.emulateMedia({reducedMotion:'reduce'});
      if(process.env.MT_SOCIAL_PROJECTS_QA_CAPTURE){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`/tmp/mt-redes-${width}.png`,fullPage:true});}
      if(await page.locator('.menu-toggle').isVisible())await page.locator('.menu-toggle').click();
      await page.locator('.nav-tab[data-page=projetos]').click();await page.waitForFunction(()=>document.querySelector('#page-projetos').classList.contains('active'));
      const cards=page.locator('#projectsGrid .project-card');const count=await cards.count();assert.equal(count,7);
      assert.equal(await page.locator('#page-projetos .mt-projects-crown').evaluate(el=>el.complete&&el.naturalWidth>0),true);
      const names=await page.evaluate(()=>window.PROJETOS_MT.map(p=>p.titulo));assert.deepEqual(await cards.locator('h3').allTextContents(),names);
      for(let i=0;i<count;i++) {
        const card=cards.nth(i);await card.scrollIntoViewIfNeeded();
        await card.locator('img').evaluate(img=>img.decode());assert.equal(await card.locator('img').evaluate(el=>getComputedStyle(el).objectFit),'contain');
        if(i===0){await card.focus();await page.keyboard.press('Enter');}else await card.click();
        await page.waitForFunction(()=>document.querySelector('#projectModal').getAttribute('aria-hidden')==='false');
        await page.locator('#projectMainImage').evaluate(img=>img.decode());assert.equal(await page.locator('#projectTitle').textContent(),names[i]);
        const thumbs=page.locator('#projectThumbs button');const expected=await page.evaluate(i=>window.PROJETOS_MT[i].fotos.length,i);assert.equal(await thumbs.count(),expected);
        if(expected>1){await thumbs.nth(1).click();await page.locator('#projectMainImage').evaluate(img=>img.decode());assert.equal(await thumbs.nth(1).getAttribute('class'),'project-thumb active');}
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'modal overflow');
        if(i===0)await page.keyboard.press('Escape');else await page.locator('#closeProjectModal').click();
        assert.equal(await page.locator('#projectModal').getAttribute('aria-hidden'),'true');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'projects overflow');
      if(width===1440){const sizes=await cards.evaluateAll(els=>els.slice(0,3).map(el=>el.getBoundingClientRect().width));assert(sizes[0]>sizes[1]&&sizes[1]>sizes[2],'featured and asymmetric hierarchy');}
      if(process.env.MT_SOCIAL_PROJECTS_QA_CAPTURE){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`/tmp/mt-projetos-${width}.png`,fullPage:true});}
      console.log(`PASS ${width}px: six URLs, grid columns ${columns}, lilac icons, hover, navigation, seven covers, all galleries and thumbnail switches, Enter/Escape, no overflow.`);
    }
    assert.deepEqual(errors,[],'JavaScript errors');console.log('PASS: no JavaScript errors.');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
