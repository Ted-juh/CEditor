import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch(chromiumLaunchOptions());
const page=await browser.newPage({viewport:{width:1920,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const out=process.env.GAIA_PAGES_OUT;
if(out)await mkdir(out,{recursive:true});
try {
  await page.route('**/gaia-panel.json',async route=>route.fulfill({contentType:'application/json',body:await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel',import.meta.url),'utf8')}));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(()=>!!window.__gaia,null,{timeout:90000});
  await page.evaluate(()=>window.__gaia.installFeedbackTestBackend());
  await page.evaluate(()=>window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(800);
  await page.evaluate(()=>window.__gaia.feedbackConnect());
  const ctl=async name=>page.locator(`[data-control-id="${await page.evaluate(n=>window.__gaia.id(n),name)}"]`).first();
  const value=name=>page.evaluate(n=>window.__gaia.session(n).customValues.value,name);
  const sends=()=>page.evaluate(()=>window.__gaia.feedbackSent().filter(e=>e.name==='setDeviceParameter'));
  const incoming=values=>page.evaluate(values=>window.__gaia.feedbackEvent('dumpMessageParsed',{ok:true,requestId:'incoming_parameter_editor_test',deviceRole:'Roland GAIA SH-01',values}),values);
  const lower=await(await ctl('bottom_pages')).boundingBox();
  const tab=async i=>{await page.mouse.click(lower.x+lower.width*(i+.5)/4,lower.y+16);await page.waitForTimeout(100);};
  await tab(0);
  const editor=page.locator('.status-editor'), tile=id=>editor.locator(`[data-parameter-value="${id}"]`);
  const until=async(fn)=>{for(let i=0;i<40;i++){if(await fn())return;await page.waitForTimeout(100);}assert.fail('Parameter editor timed out');};
  const start=(await sends()).length;
  await incoming({'tone1.filter.cutoff':32});await until(async()=>await value('tone1.filter.cutoff')===32);
  await editor.getByText('HARDWARE CONFIRMED',{exact:false}).waitFor();
  await tile('tone1.filter.cutoff').dblclick();
  await editor.getByRole('textbox',{name:'Exact parameter value'}).fill('85');
  await editor.getByRole('textbox',{name:'Exact parameter value'}).press('Enter');
  await until(async()=>await value('tone1.filter.cutoff')===85);
  assert.ok((await sends()).slice(start).every(e=>e.payload.parameterId==='tone1.filter.cutoff'));
  await editor.getByText('LOCAL / UNCONFIRMED',{exact:false}).waitFor();
  // Cancel exact entry without sending or changing the parameter.
  const beforeCancel=(await sends()).length;
  await tile('tone1.filter.cutoff').dblclick();
  await editor.getByRole('textbox',{name:'Exact parameter value'}).fill('12');
  await editor.getByRole('textbox',{name:'Exact parameter value'}).press('Escape');
  assert.equal(await value('tone1.filter.cutoff'),85);assert.equal((await sends()).length,beforeCancel);
  // Display units map back to wire values, and enumerations use their original choices.
  await(await ctl('tone1.osc.detune')).click();
  await tile('tone1.osc.detune').dblclick();
  await editor.getByRole('textbox',{name:'Exact parameter value'}).fill('0');
  await editor.getByRole('textbox',{name:'Exact parameter value'}).press('Enter');
  assert.equal(await value('tone1.osc.detune'),64);
  await(await ctl('tone1.osc.wave')).click();
  await editor.getByRole('combobox',{name:'Parameter choice',exact:true}).selectOption('6');
  assert.equal(await value('tone1.osc.wave'),6);
  assert.equal((await sends()).at(-1).payload.parameterId,'tone1.osc.wave');
  await editor.locator('[data-recent-parameter="tone1.filter.cutoff"]').click();
  // Pin survives changes in another tone, and page switches.
  await editor.getByRole('button',{name:'PIN',exact:true}).click();
  await(await ctl('tone2.filter.cutoff')).click();
  assert.ok(await tile('tone1.filter.cutoff').isVisible());
  await tab(3);await tab(0);
  assert.ok(await tile('tone1.filter.cutoff').isVisible());
  await editor.getByRole('button',{name:'PINNED',exact:true}).click();
  assert.ok(await tile('tone2.filter.cutoff').isVisible());
  await editor.locator('[data-recent-parameter="tone1.filter.cutoff"]').click();
  assert.ok(await tile('tone1.filter.cutoff').isVisible());
  // Editing a related range writes its original binding, without rebuilding it mid-drag.
  const resonance=editor.locator('[data-related-parameter="tone1.filter.resonance"] input');
  await resonance.focus();await resonance.press('ArrowRight');
  await until(async()=>await value('tone1.filter.resonance')>0);
  // A fader selects its live envelope curve. Display drags edit the same source.
  await(await ctl('tone1.filter.envAttackTime')).click();
  await editor.getByText('ENVELOPE',{exact:true}).waitFor();
  const r=await tile('tone1.filter.envAttackTime').boundingBox(), initial=await value('tone1.filter.envAttackTime');
  await page.mouse.move(r.x+50,r.y+40);await page.mouse.down();await page.mouse.move(r.x+50,r.y+25,{steps:5});await page.mouse.up();
  assert.ok(await value('tone1.filter.envAttackTime')>initial);
  // Info remains available and navigation itself does not transmit MIDI.
  const navigation=(await sends()).length;
  await editor.getByRole('button',{name:'INFO',exact:true}).click();
  assert.ok(await editor.locator('canvas.lcd-graphic').isVisible());
  await editor.getByRole('button',{name:'EDIT PARAMETER',exact:true}).click();
  assert.equal((await sends()).length,navigation);
  await tab(3);await(await ctl('system.masterTune')).click();await tab(0);
  await tile('system.masterTune').dblclick();
  await editor.getByRole('textbox',{name:'Exact parameter value'}).fill('1');
  await editor.getByRole('textbox',{name:'Exact parameter value'}).press('Enter');
  assert.equal(await page.evaluate(()=>window.__gaia.session('system.masterTune').valueOverride),1034);
  await editor.locator('[data-recent-parameter="tone1.filter.envAttackTime"]').click();
  if(out){await page.mouse.move(1900,700);await page.screenshot({path:join(out,'GAIA-interactive-status.png'),clip:lower});}
  assert.deepEqual(errors,[]);
  console.log('Interactive status: exact edit/cancel, correct MIDI target, feedback confirmation, pin across pages, recent selection, related edit, envelope context, drag and Info passed.');
}catch(error){if(out)await page.screenshot({path:join(out,'GAIA-interactive-status-debug.png'),fullPage:true});throw error;}
finally {await browser.close();await server.close();}
