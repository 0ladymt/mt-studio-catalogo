/* Integration QA for the local store. Run with Playwright and a Chromium executable. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const key = 'mt-studio-product-drafts-v1';
const legacy = { id:'legacy-product', name:'Produto anterior', price:99.9, category:'Roupas', description:'Rascunho anterior preservado.', image:'assets/produtos/ausente.jpg', availability:'coming', kind:'ready', status:'draft' };
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
    await page.addInitScript(({key,legacy})=>{if(sessionStorage.getItem("mtStoreQASeed")!==location.search){localStorage.setItem(key,JSON.stringify([legacy]));sessionStorage.setItem("mtStoreQASeed",location.search);}sessionStorage.setItem('mtIntroSeen','1');},{key,legacy});
    page.on('dialog',d=>d.accept());
    const url=`http://127.0.0.1:${server.address().port}/`;
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});await page.goto(url+'?qa='+width+'#admin');
      const skip=page.locator('.mt-intro__skip');if(await skip.isVisible())await skip.click();
      await page.waitForFunction(()=>document.querySelector('#adminProductCount').textContent==='1');
      await page.locator('#mtProductForm [name=name]').fill('Uniforme de teste');await page.locator('#mtProductForm [name=price]').fill('179.90');
      await page.locator('#mtProductForm [name=category]').selectOption('Uniformes');await page.locator('#mtProductForm [name=description]').fill('Produto de teste para validar a prévia local.');
      await page.locator('#mtProductForm [name=status]').selectOption('preview');await page.locator('#mtProductForm [name=availability]').selectOption('available');
      await page.locator('#mtProductForm [name=featured]').check();await page.locator('#mtProductForm [name=stock]').fill('4');
      await page.locator('#productImageUpload').setInputFiles({name:'teste.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBp8AAAAASUVORK5CYII=','base64')});
      await page.waitForFunction(()=>document.querySelector('#draftStatus').textContent.includes('Imagem pronta'));
      await page.locator('#productFileUpload').setInputFiles({name:'pacote-teste.zip',mimeType:'application/zip',buffer:Buffer.from('reference')});
      await page.locator('#mtProductForm [type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('#adminProductCount').textContent==='2');
      await page.reload();await page.waitForFunction(()=>document.querySelector("#adminProductCount").textContent==="2");
      let data=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
      for(const field of Object.keys(legacy))assert.equal(data[0][field],legacy[field],'existing data '+field);
      assert.equal(data[1].featured,true);assert.equal(data[1].stock,4);assert.equal(data[1].fileMeta.name,'pacote-teste.zip');assert(data[1].image.startsWith('data:image/png'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'admin overflow '+width);
      if(process.env.MT_STORE_QA_CAPTURE){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`/tmp/mt-admin-${width}.png`,fullPage:true});}
      await page.locator('#page-admin [data-page-link=loja]').click();await page.waitForFunction(()=>document.querySelector('#page-loja').classList.contains('active'));
      assert.equal(await page.locator('#mtShopDrafts article').count(),2);assert.equal(await page.locator('#mtShopDrafts h4').first().textContent(),'Uniforme de teste');
      await page.locator('#mtShopDrafts .product-no-image').waitFor();assert.equal(await page.locator('#shopEmpty').isVisible(),false);
      assert.equal(await page.locator('#mtShopDrafts button:not([disabled])').count(),0,'no checkout enabled');
      await page.locator('[data-shop-category=Props]').click();assert.equal(await page.locator('#shopNoResults').isVisible(),true);
      await page.locator('[data-shop-category=Uniformes]').click();assert.equal(await page.locator('#mtShopDrafts article').count(),1);
      await page.locator('[data-shop-category=""]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'store overflow '+width);
      if(process.env.MT_STORE_QA_CAPTURE){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`/tmp/mt-loja-${width}.png`,fullPage:true});}
      await page.evaluate(()=>window.mtOpenPage('admin'));await page.waitForFunction(()=>document.querySelector('#page-admin').classList.contains('active'));
      await page.locator('#mtDraftProducts article').nth(1).getByRole('button',{name:'Editar',exact:true}).click();
      assert.equal(await page.locator('#mtProductForm [name=featured]').isChecked(),true);assert.equal(await page.locator('#mtProductForm [name=stock]').inputValue(),'4');
      await page.locator('#mtProductForm [name=name]').fill('Uniforme editado');await page.locator('#mtProductForm [name=stock]').fill('0');await page.locator('#mtProductForm [name=status]').selectOption('archived');
      await page.locator('#mtProductForm [type=submit]').click();assert.equal(await page.locator('#mtShopDrafts article').count(),1);
      data=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(data[1].name,'Uniforme editado');assert(data[1].image.startsWith('data:image/png'));
      await page.locator('#mtDraftProducts article').nth(1).getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#mtProductForm [name=status]').selectOption('preview');await page.locator('#mtProductForm [type=submit]').click();
      assert.equal(await page.locator('#mtShopDrafts button').first().textContent(),'Indisponível');
      const before=await page.evaluate(key=>localStorage.getItem(key),key);
      await page.locator('#mtImportProducts').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('[{"name":"incompleto"}]')});
      await page.waitForFunction(()=>document.querySelector('#draftStatus').textContent.includes('Arquivo inválido'));
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before,'invalid import preserved');
      const download=page.waitForEvent('download');await page.locator('#mtExportProducts').click();const exported=await download;assert.deepEqual(JSON.parse(fs.readFileSync(await exported.path(),'utf8')),JSON.parse(before));
      await page.locator('#mtDraftProducts article').nth(1).getByRole('button',{name:'Excluir',exact:true}).click();await page.locator('#mtDraftProducts article').getByRole('button',{name:'Excluir',exact:true}).click();
      assert.equal(await page.locator('#adminProductCount').textContent(),'0');await page.evaluate(()=>window.mtOpenPage('loja'));await page.waitForFunction(()=>document.querySelector('#page-loja').classList.contains('active'));
      assert.equal(await page.locator('#shopEmpty').isVisible(),true);await page.locator('#mtShopPhoto').waitFor();
      assert.equal(await page.evaluate(()=>{const i=document.querySelector('#mtShopPhoto');return i.complete&&i.naturalWidth>0}),true);
      if(process.env.MT_STORE_QA_CAPTURE){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:`/tmp/mt-loja-empty-${width}.png`,fullPage:true});}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'empty state overflow '+width);
      console.log(`PASS ${width}px: legacy preservation, create/edit/delete, uploaded image, file reference, featured/status/stock, category/empty states, image fallback, JSON export and invalid import, navigation, no overflow.`);
    }
    assert.deepEqual(errors,[],'JavaScript errors');
    console.log('PASS: no JavaScript errors; checkout remains disabled.');
  } finally { await browser.close();await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
