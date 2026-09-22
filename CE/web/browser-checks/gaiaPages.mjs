import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await browser.newPage({viewport:{width:1920,height:1000}});
const errors=[];
page.on('pageerror', e=>errors.push(String(e)));
try {
  await page.route('**/gaia-panel.json',async route=>route.fulfill({contentType:'application/json',body:await readFile(process.env.GAIA_PANEL_PATH || new URL('../../panels/Roland GAIA SH-01.cepanel',import.meta.url),'utf8')}));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(()=>!!window.__gaia,null,{timeout:90000});
  const size=await page.evaluate(()=>window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1000);
  assert.ok((await page.evaluate(()=>window.__gaia.actions())).includes('gaiaNamesScan'),
    'ordinary preview must initialize embedded panel scripts without a script editor or manual Run');
  async function control(name) {
    const id=await page.evaluate(n=>window.__gaia.id(n),name);
    return page.locator(`[data-control-id="${id}"]`).first();
  }
  async function select(name,index,count) {
    const rect=await (await control(name)).boundingBox();
    await page.mouse.click(rect.x+rect.width*(index+0.5)/count,rect.y+12);
    await page.waitForTimeout(180);
    const session=await page.evaluate(n=>window.__gaia.session(n),name);
    assert.equal(session.sectionValues.TabContainer.pageIndex,index,`${name} switched by pointer`);
  }
  async function shot(name,clip={x:0,y:0,...size}) {
    if(!process.env.GAIA_PAGES_OUT) return;
    await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,name),clip});
  }
  assert.equal(await (await control('common.patchName')).count(),0);
  assert.equal(await (await control('system.masterTune')).count(),0);
  if (!process.env.GAIA_END_STEP_ONLY) await shot('GAIA-controls-arpeggiator.png');
  assert.deepEqual(size,{width:1920,height:1000});
  assert.ok(await (await control('distortion.type')).isVisible(),'effects are always visible beside the tones');
  assert.ok(await (await control('common.effectsMasterSwitch')).isVisible(),'output controls remain with effects');
  if (!process.env.GAIA_END_STEP_ONLY) await shot('GAIA-1920x1000.png');
  await select('bottom_pages',2,4);
  const grid = await control('arp_pattern_grid');
  const lowerBounds = await (await control('bottom_pages')).boundingBox();
  const sendBounds = await grid.getByText('SEND PATTERN',{exact:true}).boundingBox();
  assert.ok(sendBounds.y+sendBounds.height<=lowerBounds.y+lowerBounds.height,'the pattern toolbar fits inside the lower page');
  assert.equal(await page.evaluate(() => window.__gaia.id('arp.endStep')), undefined, 'no separate END STEP knob');
  const initialPattern = await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.arpPattern);
  const gridRect = await grid.boundingBox();
  const background = await (await control('box_ARPEGGIO PATTERN')).boundingBox();
  const output = await (await control('box_EFFECTS / OUTPUT')).boundingBox();
  assert.ok(gridRect.y + gridRect.height <= background.y + background.height, 'grid and toolbar stay inside their background');
  assert.ok(Math.abs(output.y + output.height - lowerBounds.y - lowerBounds.height) < 1, 'output aligns with the lower pages');
  assert.ok(Math.abs(background.y + background.height - lowerBounds.y - lowerBounds.height) < 1, 'arpeggio background fills the page');
  assert.ok(sendBounds.height <= 18.1, 'compact action row');
  await page.mouse.click(gridRect.x + gridRect.width - 39, gridRect.y + gridRect.height - 13);
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /Ruler: click or drag to set END STEP/);
  await shot('GAIA-arpeggio-help.png');
  await page.getByRole('button', {name:'Close', exact:true}).click();
  assert.deepEqual(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.arpPattern), initialPattern, 'help does not alter notes');
  await shot('GAIA-arpeggio-compact.png', {x:0,y:lowerBounds.y,width:1920,height:1000-lowerBounds.y});
  const rulerX = step => gridRect.x + 44 + (step - 0.5) * (gridRect.width - 52) / 32;
  for (const end of [16, 1, 32, 16]) {
    await page.mouse.click(rulerX(end), gridRect.y + 12);
    await grid.getByText(`END ${end}`, { exact: true }).waitFor({ timeout: 10000 });
    assert.match(await grid.innerText(), new RegExp(`END ${end}\\b`));
    assert.deepEqual(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.arpPattern), initialPattern);
  }
  await shot('GAIA-end-step-16.png', { x: gridRect.x, y: gridRect.y, width: gridRect.width, height: gridRect.height });
  await shot('GAIA-ruler-panel.png');
  await page.mouse.move(rulerX(16), gridRect.y + 12);
  await page.mouse.down();
  await page.mouse.move(rulerX(24), gridRect.y + 12, { steps: 8 });
  await page.mouse.up();
  const movedEnd = await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.arpEndStep);
  assert.equal(movedEnd, 24, 'real ruler drag changes END STEP');
  await grid.getByText(`END ${movedEnd}`, { exact: true }).waitFor({ timeout: 10000 });
  assert.deepEqual(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.arpPattern), initialPattern);
  const parameterValues = await page.evaluate(() => window.__gaia.parameterValues());
  assert.notEqual(parameterValues['Roland GAIA SH-01']?.['arp.endStep'], 24, 'ruler stages locally until Send Pattern');
  await page.evaluate(() => window.__gaia.endStep(12));
  await grid.getByText('END 24', { exact: true }).waitFor();
  if (process.env.GAIA_END_STEP_ONLY) {
    assert.deepEqual(errors, []);
    console.log('END STEP: staged ruler clicks 1/16/32, drag to 24, guarded inbound update and preserved notes passed.');
    process.exitCode = 0;
  } else {
  await select('bottom_pages',1,4);
  assert.ok(await (await control('common.patchName')).isVisible(),'Patch controls share the bank page');
  for(let i=0;i<4;i++) {
    await select('patch_banks',i,4);
    const names=['recall_preset_A1','recall_user_H8','recall_usb_H8','recall_preset_pcm_A8'];
    assert.ok(await (await control(names[i])).isVisible());
    const buttons=await page.locator('[data-control-id*="gaia_recall_"]').count();
    assert.equal(buttons,i===3?8:64);
  }
  await select('patch_banks',1,4);
  await select('bottom_pages',3,4);
  assert.equal(await (await control('arp_pattern_grid')).count(),0);
  assert.ok(await (await control('system.masterTune')).isVisible());
  const lock=await control('system.writeProtectH8');
  await lock.click();
  await page.waitForTimeout(150);
  const locked=await page.evaluate(()=>window.__gaia.session('system.writeProtectH8'));
  assert.equal(locked.checked,true,'nested write-protection toggle remains interactive');
  await select('bottom_pages',2,4);
  assert.ok(await (await control('arp_pattern_grid')).isVisible());
  await select('bottom_pages',3,4);
  assert.equal((await page.evaluate(()=>window.__gaia.session('system.writeProtectH8'))).checked,true,'switching pages preserves values');
  for(const tone of [1,2,3]) assert.ok(await (await control(`tone${tone}.osc.wave`)).isVisible());
  // Restore the test toggle before showing the neutral preview.
  await lock.click();
  await shot('GAIA-banks-system.png');
  const bottom=await (await control('bottom_pages')).boundingBox();
  await shot('GAIA-system-closeup.png',bottom);
  await select('bottom_pages',1,4);
  await shot('GAIA-banks-closeup.png',bottom);
  // Simulated hardware, through the actual generated scripts and inbound dispatcher.
  // These names are TEST DATA, never presented as names fetched from a physical synth.
  await (await control('names_read_user')).click();
  await page.waitForTimeout(120);
  await page.evaluate(()=>window.__gaia.receive([240,126,19,6,2,65,65,2,0,0,0,0,0,0,247]));
  await page.waitForTimeout(100);
  for(let slot=0;slot<64;slot++) {
    await page.evaluate(slot=>{
      const text=('TEST NAME '+slot).padEnd(12).slice(0,12);
      const body=[32,slot,0,0,...Array.from(text,c=>c.charCodeAt(0))];
      window.__gaia.receive([240,65,19,0,0,65,18,...body,(128-body.reduce((a,b)=>a+b,0)%128)%128,247]);
    },slot);
    await page.waitForTimeout(90);
  }
  assert.match(await (await control('recall_user_A1')).innerText(),/A-1\s+TEST NAME 0/);
  assert.match(await (await control('recall_user_H8')).innerText(),/H-8\s+TEST NAME 63/);
  const textLeft=await (await control('recall_user_H8')).locator('.text-span').evaluate(el=>parseFloat(el.style.left));
  assert.ok(textLeft>=0 && textLeft<=12,'bank names share a left-aligned text inset');
  assert.match(await (await control('names_status_user')).innerText(),/64 patch names read/);
  await shot('GAIA-bank-names-SIMULATED-TEST.png',bottom);
  assert.deepEqual(errors,[]);
  console.log('GAIA pages: 4 bank sources, page switches, nested controls and 64 simulated SysEx names rendered through real script dispatch passed.');
  }
} finally { await browser.close(); await server.close(); }
