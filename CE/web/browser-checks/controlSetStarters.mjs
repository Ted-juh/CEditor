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
  assert.equal(ids.length,12);
  for (const id of ids) {
    const size=await page.evaluate(id => window.__controlSetShot.showStarter(id), id);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-control-id]').count(),size.controls);
    // The new cap geometry keeps the original hit/drag behavior.
    const fader=page.locator('.xfader').first();
    assert.ok(await fader.count());
    if(out) await page.screenshot({ path:join(out,`${id}.png`),clip:{x:0,y:0,width:size.width,height:size.height} });
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
  await page.evaluate(() => window.__controlSetShot.gallery());
  const dialog=page.getByRole('dialog',{name:'Control set gallery'});
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('navigation').getByRole('button').count(),12);
  await dialog.getByRole('button',{name:/Machined Precision/}).click();
  await page.evaluate(() => document.fonts.ready);
  if(out) await page.screenshot({path:join(out,'gallery.png')});
  await dialog.getByRole('button',{name:'Open editable starter'}).click();
  await page.waitForFunction(() => window.__controlSetShot.active().set==='machined');
  const state=await page.evaluate(() => window.__controlSetShot.active());
  assert.ok(state.pins.every(id => id==='machined'));
  assert.match(state.name,/Machined/);
  await page.evaluate(() => window.__controlSetShot.gallery());
  await page.locator('dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.deepEqual(errors,[]);
  console.log('gallery: twelve choices, new editable panel, portable designs and Escape passed');
} finally { await browser?.close(); server.close(); }
