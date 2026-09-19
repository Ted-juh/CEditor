import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1800, height: 2200 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
try {
  await page.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(process.env.GAIA_PANEL_PATH || new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => !!window.__gaia, null, { timeout: 90000 });
  await page.evaluate(() => window.__gaia.installFeedbackTestBackend());
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__gaia.feedbackConnect());
  const id = await page.evaluate(() => window.__gaia.id('arp_pattern_grid'));
  const grid = page.locator(`[data-control-id="${id}"]`).first();
  const box = await grid.boundingBox();
  const values = () => page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues);
  const sends = () => page.evaluate(() => window.__gaia.feedbackSent().filter(e => e.name === 'setDeviceParameter'));
  const button = async x => { await page.mouse.click(box.x + x, box.y + box.height - 15); await page.waitForTimeout(100); };
  const initial = await values();
  // Ruler now stages the complete pattern, including loop length.
  await page.mouse.click(box.x + 44 + 15.5 * (box.width - 52) / 32, box.y + 12);
  assert.equal((await values()).arpEndStep,16);
  await button(75); assert.equal((await values()).arpEndStep,32);
  await button(143); assert.equal((await values()).arpEndStep,16);
  await page.evaluate(() => window.__gaia.endStep(8));
  assert.equal((await values()).arpEndStep,16,'individual replies cannot overwrite a staged pattern');
  await grid.focus(); await page.keyboard.press('Home');
  const selected = (await values()).__arpeggiator.selectedBlock;
  await button(235); assert.equal((await values()).arpPattern.length,initial.arpPattern.length+1);
  await page.keyboard.press('Control+z'); assert.equal((await values()).arpPattern.length,initial.arpPattern.length);
  await page.keyboard.press('Control+y'); assert.equal((await values()).arpPattern.length,initial.arpPattern.length+1);
  await button(338); assert.equal((await values()).arpPattern.length,initial.arpPattern.length);
  // Numeric edit and a real multi-move velocity gesture each undo as one operation.
  const velocity=page.getByRole('textbox',{name:'Selected note velocity',exact:true});
  await velocity.fill('85'); await velocity.press('Enter');
  const beforeDrag = await values(), block=beforeDrag.arpPattern.find(b=>b.id===beforeDrag.__arpeggiator.selectedBlock);
  const stepWidth=(box.width-52)/32, rowHeight=(box.height-88)/12;
  const x=box.x+44+(block.step+block.length/2)*stepWidth;
  const y=box.y+24+(beforeDrag.__arpeggiator.viewNote+11-block.note+0.5)*rowHeight;
  await page.mouse.move(x,y); await page.mouse.down();
  await page.mouse.move(x,y-20,{steps:5}); await page.mouse.move(x,y-35,{steps:5}); await page.mouse.up();
  assert.notEqual((await values()).arpPattern.find(b=>b.id===block.id).velocity,85);
  await page.keyboard.press('Control+z'); assert.deepEqual((await values()).arpPattern,beforeDrag.arpPattern);
  assert.deepEqual(await sends(),[],'ruler, duplicate, delete, numeric edit and undo must not autosend');
  const beforeRead=await values();
  // Fake incoming native block replies. No real MIDI port is touched.
  await page.evaluate(() => {
    const raw=window.__gaia.expectedArp(); raw['arp.endStep']=12;
    // Change a velocity, and reverse lane ordering to exercise exact import preservation.
    const first=Object.keys(raw).find(k=>k.endsWith('step1Data')&&raw[k]>0&&raw[k]<128);
    if(first)raw[first]=59;
    window.__gaia.readFixture=Object.fromEntries(Object.entries(raw).map(([id,value])=>[id.replace(/note(\d+)\./,(_,n)=>`note${17-Number(n)}.`),value]));
    window.__gaia.onFeedbackSend=(name,p)=>{
      if(name!=='startDeviceSync')return;
      setTimeout(()=>{
        const fixture=window.__gaia.readFixture;
        const ids=p.request==='requestArpeggioCommon'?['arp.endStep']:Object.keys(fixture).filter(id=>id.startsWith(`arpPattern.note${p.request.replace('requestArpPattern','')}.`));
        window.__gaia.feedbackEvent('dumpMessageParsed',{ok:true,requestId:`incoming_test_${Date.now()}`,deviceRole:p.deviceRole,values:Object.fromEntries(ids.map(id=>[id,fixture[id]]))});
        window.__gaia.feedbackEvent('deviceRequestResolved',{ok:true,deviceRole:p.deviceRole,correlationId:p.correlationId,requestId:p.request});
      },30);
    };
  });
  async function waitMessage(text, attempts=120) {
    for(let i=0;i<attempts;i++) { if((await values()).__arpEditState?.message?.includes(text))return; await page.waitForTimeout(100); }
    assert.fail(`${text}: ${JSON.stringify((await values()).__arpEditState)}; sent=${JSON.stringify(await page.evaluate(()=>window.__gaia.feedbackSent().slice(-4)))}`);
  }
  await button(473); await waitMessage('READ COMPLETE');
  let imported=await values();
  assert.equal(imported.arpEndStep,12); assert.equal(imported.__arpPatternSource.kind,'hardware');
  assert.deepEqual(await sends(),[],'Read must not echo the imported pattern back');
  const status=page.locator('[data-control-id="gaia_hardware_sync_status"]').first();
  assert.match(await status.textContent(),/GAIA-READ PATTERN · SYNCED/);
  await button(75); assert.deepEqual((await values()).arpPattern,beforeRead.arpPattern); assert.equal((await values()).arpEndStep,16);
  await button(143); assert.deepEqual((await values()).arpPattern,imported.arpPattern);
  await button(601); await waitMessage('QUEUED',250);
  const outgoing=await sends(); assert.equal(outgoing.length,529);
  assert.deepEqual(Object.fromEntries(outgoing.map(e=>[e.payload.parameterId,e.payload.value])),imported.__arpPatternSource.raw);
  assert.doesNotMatch(await status.textContent(),/SYNCED/,'queued writes are not readback');
  await button(473); await waitMessage('READ COMPLETE');
  if(process.env.GAIA_PAGES_OUT){
    await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-pattern-editing-SIMULATED.png'),clip:{x:16,y:box.y-44,width:1560,height:box.height+52}});
  }
  // Cancellation keeps editor data; the timeout path does too.
  await page.evaluate(()=>{window.__gaia.onFeedbackSend=null;});
  await button(473); await button(473); await waitMessage('READ STOPPED');
  assert.doesNotMatch(await status.textContent(),/READING/,'cancel must retire the pending read');
  assert.deepEqual((await values()).arpPattern,imported.arpPattern);
  await button(473); await waitMessage('No complete reply');
  assert.doesNotMatch(await status.textContent(),/READING/,'timeout must retire the pending read');
  assert.deepEqual((await values()).arpPattern,imported.arpPattern);
  assert.deepEqual(errors,[]);
  if(process.env.GAIA_PAGES_OUT){
    await mkdir(process.env.GAIA_PAGES_OUT,{recursive:true});
    await grid.focus(); await page.keyboard.press('Home');
    await page.screenshot({path:join(process.env.GAIA_PAGES_OUT,'GAIA-pattern-editing.png'),clip:{x:16,y:box.y-44,width:1560,height:box.height+52}});
  }
  console.log('Pattern toolbar: staged edits, drag undo, redo, duplicate/delete, atomic read, exact lane preservation, 529 explicit writes, cancel/timeout, and no MIDI autosend passed (simulated backend).');
} finally { await browser.close(); await server.close(); }
