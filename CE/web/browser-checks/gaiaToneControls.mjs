import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { applyToneControls } from '../../../tools/scripts/gaia-panel/tone-controls.mjs';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { PATCH_TONE } from '../../../tools/scripts/qa/roland-gaia/address-map.mjs';

const saved=deserializePanel(await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel',import.meta.url),'utf8'));
const panel=applyToneControls(saved);
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try {
  const page=await browser.newPage({viewport:{width:1800,height:2200}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/gaia-panel.json',route=>route.fulfill({contentType:'application/json',body:serializePanel(panel)}));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(()=>!!window.__gaia,null,{timeout:90000});
  await page.evaluate(()=>window.__gaia.installFeedbackTestBackend());
  await page.evaluate(()=>window.__gaia.load('/gaia-panel.json'));
  await page.evaluate(()=>window.__gaia.feedbackConnect());
  await page.waitForFunction(()=>window.__gaia.actions().includes('gaiaToneCopy'));
  const ctl=async name=>page.locator(`[data-control-id="${await page.evaluate(n=>window.__gaia.id(n),name)}"]`).first();
  const incoming=values=>page.evaluate(values=>window.__gaia.feedbackEvent('dumpMessageParsed',{ok:true,requestId:'incoming_tone_test',deviceRole:'Roland GAIA SH-01',values}),values);
  for(const tone of [1,2,3]) {
    for(const [suffix,colour] of [['Select','rgb(35, 115, 72)'],['Switch','rgb(170, 52, 69)']]) {
      const name=`common.tone${tone}${suffix}`,control=await ctl(name);
      await incoming({[name]:'off'});await page.waitForTimeout(60);
      await control.click();await page.waitForTimeout(60);
      const sent=await page.evaluate(n=>window.__gaia.feedbackSent().filter(e=>e.name==='setDeviceParameter'&&e.payload.parameterId===n).at(-1),name);
      assert.equal(sent.payload.value,true,name);
      await incoming({[name]:'on'});await page.waitForTimeout(60);
      assert.equal(await page.evaluate(n=>window.__gaia.session(n).checked,name),true);
      assert.ok((await control.innerHTML()).toLowerCase().includes(colour),`${name} selected colour: ${(await control.innerHTML()).slice(0,3500)}`);
      await incoming({[name]:'off'});await page.waitForTimeout(60);
      assert.equal(await page.evaluate(n=>window.__gaia.session(n).checked,name),false);
    }
    await (await ctl(`tone${tone}.copy`)).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.match(await dialog.innerText(),new RegExp('Copy Tone '+tone));
    for(const dest of [1,2,3].filter(t=>t!==tone))assert.ok(await dialog.getByRole('button',{name:'Tone '+dest,exact:true}).isVisible());
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  await (await ctl('tone1.copy')).click();
  await page.getByRole('dialog').getByRole('button',{name:'Tone 2',exact:true}).click();
  await page.evaluate(()=>window.__gaia.receive([240,126,19,6,2,65,65,2,0,0,0,0,0,0,247]));
  const data=Array(62).fill(0);for(const p of PATCH_TONE)data[parseInt(p.offset.split(' ')[1],16)]=Math.floor((p.min+p.max)/2);
  const reply=async tone=>page.evaluate(({tone,data})=>{const body=[16,0,tone,0,...data];window.__gaia.receive([240,65,19,0,0,65,18,...body,(128-body.reduce((a,b)=>a+b,0)%128)%128,247]);},{tone,data});
  await reply(1);await page.waitForTimeout(160);await reply(2);
  await (await ctl('tone1_copy_status')).getByText('Copied to Tone 2',{exact:true}).waitFor();
  await incoming({'common.tone1Select':'on','common.tone1Switch':'on'});
  if(process.env.GAIA_TONES_OUT){await mkdir(process.env.GAIA_TONES_OUT,{recursive:true});await page.screenshot({path:join(process.env.GAIA_TONES_OUT,'gaia-tone-controls.png'),clip:{x:0,y:170,width:1740,height:670}});}
  assert.deepEqual(errors,[]);
  console.log('Tone controls: six two-way controls, green/red states, three Copy dialogs and verified simulated copy passed.');
} finally {await browser.close();await server.close();}
