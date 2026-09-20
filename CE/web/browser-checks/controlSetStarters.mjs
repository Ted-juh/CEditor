import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
const out = process.env.CONTROL_SET_SHOT_DIR;
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2' };
const server = createServer(async (req, res) => {
  try { const path = decodeURIComponent(req.url.split('?')[0]); res.setHeader('content-type', mime[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(join(root, path))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage({ viewport: { width:1280, height:1000 }, deviceScaleFactor:1 });
  const errors=[];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/controlSetShot.html`);
  await page.waitForFunction(() => !!window.__controlSetShot);
  if (out) await mkdir(out, { recursive:true });
  const ids=await page.evaluate(() => window.__controlSetShot.starterIds);
  assert.equal(ids.length,48);
  async function checkPerformance(id) {
    const number=page.locator('[data-control-id][role="spinbutton"]').first();
    const field=number.locator('input').first();
    const before=Number(await field.inputValue());
    const increment=number.locator('.interactive-part').filter({hasText:/^\s*\+\s*$/}).first();
    const plus=await increment.boundingBox();
    await page.mouse.click(plus.x+plus.width/2,plus.y+plus.height/2);
    await page.waitForTimeout(30);
    assert.ok(Number(await field.inputValue())>before,`${id}: reshaped increment hit region`);
    const decrement=number.locator('.interactive-part').filter({hasText:/^\s*-\s*$/}).first();
    const minus=await decrement.boundingBox();
    await page.mouse.click(minus.x+minus.width/2,minus.y+minus.height/2);
    await page.waitForTimeout(30);
    assert.equal(Number(await field.inputValue()),before,`${id}: relocated decrement reverses increment`);
    const pad=page.locator('.drumpads [data-performance-form]').first();
    assert.equal(await page.locator('.drumpads [data-performance-form]').count(),4);
    const box=await pad.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.waitForTimeout(35);
    assert.equal(await pad.getAttribute('data-active'),'true',`${id}: visible pad centre triggers`);
    await page.mouse.up();
    await page.waitForTimeout(35);
    assert.equal(await pad.getAttribute('data-active'),'false',`${id}: released pad stops`);
    await page.mouse.move(box.x+1,box.y+1);
    await page.mouse.down();
    await page.waitForTimeout(25);
    assert.equal(await page.locator('.drumpads [data-active="true"]').count(),0,`${id}: empty pad corner does not trigger`);
    await page.mouse.up();
    assert.equal(await page.locator('.seq [data-performance-form]').count(),16,`${id}: shaped sequence cells`);
    assert.equal(await page.locator('.seq [data-active="true"]').count(),6,`${id}: authored pattern retained`);
  }
  for (const id of ids) {
    const size=await page.evaluate(id => window.__controlSetShot.showStarter(id), id);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-control-id]').count(),size.controls);
    const mechanisms=page.locator('svg.anatomy');
    assert.equal(await mechanisms.count(),5,`${id}: two rotary faces, button, switch and meter`);
    const rotary=mechanisms.nth(0);
    const rotaryControl=rotary.locator('..').locator('..');
    const valueBefore=Number(await rotary.getAttribute('data-position'));
    await rotaryControl.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(30);
    assert.ok(Number(await rotary.getAttribute('data-position'))>valueBefore,`${id}: rotary follows keyboard value`);
    const switchFace=page.locator('[data-control-id]').filter({has:page.locator('svg.anatomy')}).filter({hasText:'HOLD'}).first();
    const switchSvg=switchFace.locator('svg.anatomy');
    const oldState=await switchSvg.getAttribute('data-active');
    await switchFace.click();
    await page.waitForTimeout(30);
    assert.notEqual(await switchSvg.getAttribute('data-active'),oldState,`${id}: switch mechanism follows state`);
    await switchFace.click();
    const actionFace=page.locator('[data-control-id]').filter({has:page.locator('svg.anatomy')}).filter({hasText:'TRIGGER'}).first();
    const actionBox=await actionFace.boundingBox();
    await page.mouse.move(actionBox.x+actionBox.width/2,actionBox.y+actionBox.height/2);
    await page.mouse.down();
    await page.waitForTimeout(25);
    assert.equal(await actionFace.locator('svg.anatomy').getAttribute('data-active'),'true',`${id}: pressed face responds`);
    await page.mouse.up();
    await page.waitForTimeout(25);
    assert.equal(await actionFace.locator('svg.anatomy').getAttribute('data-active'),'false',`${id}: released face resets`);
    // The new cap geometry keeps the original hit/drag behavior.
    const fader=page.locator('.xfader').first();
    assert.ok(await fader.count());
    if(ids.indexOf(id)>=12) await checkPerformance(id);
    if(ids.indexOf(id)>=24) {
      assert.equal(size.faders.length,4,`${id}: four envelope faders`);
      for(const faderId of size.faders) {
        const slider=page.locator(`[data-control-id="${faderId}"]`);
        const value=Number(await slider.getAttribute('aria-valuenow'));
        await slider.focus();await page.keyboard.press('ArrowUp');
        assert.ok(Number(await slider.getAttribute('aria-valuenow'))>value,`${id}: vertical fader keyboard value`);
        await page.keyboard.press('ArrowDown');
      }
    }
    await page.evaluate(()=>document.activeElement?.blur());
    if(out) await page.screenshot({ path:join(out,`${id}.png`),clip:{x:0,y:0,width:size.width,height:size.height} });
    if(out) {
      await page.locator('.frame').evaluate(el=>el.style.filter='grayscale(1)');
      await page.screenshot({path:join(out,`${id}-grayscale.png`),clip:{x:0,y:0,width:size.width,height:size.height}});
      await page.locator('.frame').evaluate(el=>el.style.filter='');
    }
    const before = await fader.evaluate(el => el.innerHTML);
    const box = await fader.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2, { steps:4 });
    await page.waitForTimeout(50);
    assert.notEqual(await fader.evaluate(el => el.innerHTML), before, `${id}: styled cap follows drag`);
    await page.mouse.up();
    console.log(`${id}: ${size.controls} rendered editor controls`);
  }
  await page.evaluate(() => window.__controlSetShot.showStarter('satellite',{materialize:false}));
  await page.waitForTimeout(100);
  await checkPerformance('satellite following set without materialization');
  await page.evaluate(() => window.__controlSetShot.showStarter('tolex',{disabled:true}));
  const disabledKnob=page.locator('svg.anatomy').first();
  await disabledKnob.waitFor();
  const disabledValue=await disabledKnob.getAttribute('data-position');
  await disabledKnob.locator('..').locator('..').click({force:true});
  await page.keyboard.press('ArrowUp');
  assert.equal(await disabledKnob.getAttribute('data-position'),disabledValue,'disabled anatomy cannot change values');
  await page.evaluate(() => window.__controlSetShot.showStarter('tolex',{original:true}));
  await page.waitForTimeout(50);
  assert.equal(await page.locator('svg.anatomy').count(),0,'original parts explicitly restores legacy drawing');
  await page.evaluate(() => window.__controlSetShot.gallery());
  const dialog=page.getByRole('dialog',{name:'Control set gallery'});
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('navigation').getByRole('button').count(),24);
  await dialog.getByRole('button',{name:/Precision Instrument/}).click();
  await dialog.getByRole('checkbox',{name:'Compare shapes in grayscale'}).check();
  assert.equal(await dialog.locator('.viewport').evaluate(el=>getComputedStyle(el).filter),'grayscale(1)');
  await page.evaluate(() => document.fonts.ready);
  if(out) await page.screenshot({path:join(out,'gallery.png')});
  await dialog.getByRole('button',{name:'Open editable starter'}).click();
  await page.waitForFunction(() => window.__controlSetShot.active().set==='chronograph');
  const state=await page.evaluate(() => window.__controlSetShot.active());
  assert.ok(state.pins.every(id => id==='chronograph'));
  assert.match(state.name,/Precision/);
  await page.evaluate(() => window.__controlSetShot.gallery());
  await page.locator('dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.deepEqual(errors,[]);
  console.log('gallery: twenty-four synthesizer choices, new editable panel, portable designs and Escape passed');
} finally { await browser?.close(); server.close(); }
