import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const page=await browser.newPage({viewport:{width:1800,height:2200}}), errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.route('**/gaia-panel.json',async route=>route.fulfill({contentType:'application/json',body:await readFile(process.env.GAIA_PANEL_PATH || new URL('../../panels/Roland GAIA SH-01.cepanel',import.meta.url),'utf8')}));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(()=>!!window.__gaia,null,{timeout:90000});
  await page.evaluate(()=>window.__gaia.installFeedbackTestBackend());
  await page.evaluate(()=>window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1200);
  await page.evaluate(()=>window.__gaia.feedbackConnect());
  async function ctl(name){const id=await page.evaluate(n=>window.__gaia.id(n),name);return page.locator(`[data-control-id="${id}"]`).first();}
  async function textHas(name,text){
    const c=await ctl(name);
    for(let i=0;i<60;i++){if((await c.textContent()).includes(text))return; await page.waitForTimeout(100);}
    assert.fail(`${name}: expected ${text}, actual ${await c.textContent()}`);
  }
  await textHas('arp.velocity.caption','REAL (played)');
  for(const [name,label,count,wire] of [['arp.grid','1/16 heavy shuffle',9,'16h'],['arp.duration','Full (legato)',10,'ful'],['arp.motif','Up/down · keep low+high',12,'updownlh']]){
    await (await ctl(name)).click();
    assert.equal(await page.getByRole('option').count(),count);
    await page.getByRole('option',{name:label,exact:true}).click();
    await textHas(name,label);
    const sent=await page.evaluate(n=>window.__gaia.feedbackSent().filter(e=>e.name==='setDeviceParameter'&&e.payload.parameterId===n).at(-1),name);
    assert.equal(sent.payload.value,wire,'human-friendly labels must not become wire values');
  }
  await page.evaluate(()=>window.__gaia.feedbackEvent('dumpMessageParsed',{ok:true,requestId:'incoming_arp_labels',deviceRole:'Roland GAIA SH-01',values:{'arp.velocity':127,'arp.accentRate':100,'arp.octaveRange':61}}));
  await textHas('arp.velocity.caption','127 (fixed)'); await textHas('arp.accentRate.caption','100% (pattern)'); await textHas('arp.octaveRange.caption','-3 octaves');
  await page.evaluate(()=>window.__gaia.feedbackEvent('dumpMessageParsed',{ok:true,requestId:'incoming_arp_labels_real',deviceRole:'Roland GAIA SH-01',values:{'arp.velocity':0}}));
  await textHas('arp.velocity.caption','REAL (played)');
  assert.equal(await page.getByRole('textbox',{name:'arp.velocity value',exact:true}).count(),0);
  assert.match(await (await ctl('arp.duration')).getAttribute('title'),/not simply 100%/);
  assert.match(await (await ctl('arp.motif')).getAttribute('title'),/L&H/);
  assert.deepEqual(errors,[]);
  if(process.env.GAIA_PAGES_OUT){
    await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});
    const box=await(await ctl('box_ARPEGGIO')).boundingBox();
    const lower=await(await ctl('bottom_pages')).boundingBox();
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-arpeggio-complete.png'),clip:lower});
    const fx=await(await ctl('box_DISTORTION')).boundingBox();
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-effects-complete.png'),clip:{x:16,y:fx.y,width:1672,height:196}});
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-readable-arpeggio.png'),clip:box});
    await(await ctl('arp.motif')).click();
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-readable-motif-menu.png'),clip:{x:box.x,y:box.y,width:box.width,height:430}});
  }
  console.log('Readable arpeggio: all 31 options accessible, stable outgoing values, live incoming captions, special values, no duplicate inputs, tooltips and layout passed. Simulated MIDI only.');
} finally {await browser.close();await server.close();}
