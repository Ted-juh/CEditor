import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page=await browser.newPage({viewport:{width:1920,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.route('**/gaia-panel.json',async route=>route.fulfill({contentType:'application/json',body:await readFile(process.env.GAIA_PANEL_PATH || new URL('../../panels/Roland GAIA SH-01.cepanel',import.meta.url),'utf8')}));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(()=>!!window.__gaia,null,{timeout:90000});
  await page.evaluate(()=>window.__gaia.installFeedbackTestBackend());
  await page.evaluate(()=>window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1200);
  async function ctl(name){const id=await page.evaluate(n=>window.__gaia.id(n),name);return page.locator(`[data-control-id="${id}"]`).first();}
  const lower=await(await ctl('bottom_pages')).boundingBox();
  assert.deepEqual(await page.evaluate(()=>window.__gaia.controls.find(c=>c._children.Core.name==='bottom_pages')._children.TabContainer.pages.map(p=>p.id)), ['status','banks','arpeggiator','system']);
  const selectLower=async index=>{await page.mouse.click(lower.x+lower.width*(index+.5)/4,lower.y+10);await page.waitForTimeout(150);};
  for (const [index,name] of [[1,'common.patchName'],[2,'arp_pattern_grid'],[3,'system.masterTune'],[0,'gaia_status_screen']]) {
    await selectLower(index);
    await (await ctl(name)).waitFor({state:'visible'});
    assert.ok(await (await ctl('distortion.type')).isVisible(),'effects stay visible on every page');
  }
  await selectLower(0);
  await page.waitForTimeout(150);
  const screen=await ctl('gaia_status_screen');
  await screen.getByRole('button',{name:'INFO',exact:true}).click();
  const text=()=>screen.locator('canvas.lcd-graphic').getAttribute('aria-label');
  async function has(t){for(let i=0;i<50;i++){if((await text()).includes(t))return;await page.waitForTimeout(100);}assert.fail(`Expected ${t}: ${await text()}`);}
  const b=await screen.boundingBox();
  async function menu(i){await page.mouse.click(b.x+12+(i+.5)*(b.width-24)/4,b.y+b.height-22);await page.waitForTimeout(150);}
  await has('SELECTION UNKNOWN');
  const before=await page.evaluate(()=>window.__gaia.feedbackSent().length);
  await menu(1); await has('Touch a synth control');
  await menu(2); await has('END STEP:'); await has('SEND PATTERN TO APPLY');
  await menu(3); await has('CLOCK SOURCE:');
  assert.equal(await page.evaluate(()=>window.__gaia.feedbackSent().length),before,'navigation sends no native/MIDI requests');
  await menu(1);
  const knob=await(await ctl('tone1.filter.cutoff')).boundingBox();
  await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2);await page.mouse.down();await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2-28,{steps:5});await page.mouse.up();
  await has('TONE 1 /'); await has('Cutoff');
  const value=await page.evaluate(()=>window.__gaia.session('tone1.filter.cutoff').customValues.value);
  assert.ok(value>0); await has(String(value));
  // Simulate the native parser's incoming-parameter event (no physical MIDI).
  await page.evaluate(()=>window.__gaia.feedbackConnect());
  const reply=async(address,data)=>page.evaluate(([address,data])=>{const body=[...address,...data];window.__gaia.receive([240,65,19,0,0,65,18,...body,(128-body.reduce((a,b)=>a+b,0)%128)%128,247]);},[address,data]);
  await page.evaluate(()=>window.__gaia.feedbackEvent('dumpMessageParsed',{ok:true,requestId:'incoming_lcd_test',deviceRole:'Roland GAIA SH-01',values:{'tone1.filter.cutoff':99}}));
  await has('99');
  await menu(0);
  await selectLower(1);
  const banks=await(await ctl('patch_banks')).boundingBox();await page.mouse.click(banks.x+banks.width*.375,banks.y+12);
  await(await ctl('recall_user_C3')).click();await selectLower(0);await has('Requested User Patch C-3');await selectLower(1);
  await(await ctl('names_check_user')).click();
  await page.evaluate(()=>window.__gaia.receive([240,126,19,6,2,65,65,2,0,0,0,0,0,0,247]));
  await reply([1,0,0,0],[87,0,18]);await selectLower(0);await has('Confirmed User Patch C-3');
  if(process.env.GAIA_PAGES_OUT){await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});await page.mouse.move(1795,180);await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-bottom-display.png'),clip:{x:lower.x,y:lower.y,width:lower.width,height:lower.height}});}
  assert.deepEqual(errors,[]);
  console.log('Dot matrix: all four soft-key pages, read-only navigation, custom knob + incoming MIDI, patch requested/confirmed state passed.');
} catch(error) {
  if(process.env.GAIA_PAGES_OUT)await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-dot-matrix-debug.png'),clip:{x:10,y:10,width:1580,height:434}});
  throw error;
} finally {await browser.close();await server.close();}
