// CTRL49 screen lab (tools/ctrl49/screen-lab): both Lua pages render every page from payloads
// shaped as Ctrl49ScreenLab.h builds them, the JS ports of those payloads match the C++ golden,
// and nothing throws. CTRL49_LAB_SHOTS=<dir> also writes a PNG of every page.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(here, '../../..');
const shots = process.env.CTRL49_LAB_SHOTS;

// The golden lives in the C++ test; read it from there so there is exactly one copy.
const cppTest = fs.readFileSync(path.join(repo, 'CE/tests/Ctrl49ScreenLabTests.cpp'), 'utf8');
const golden = cppTest.match(/kGoldenEnvelope \{([^}]*)\}/)[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number);

const server = await createServer({ configFile: false, plugins: [svelte()], root: here,
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-ctrl49-lab', import.meta.url)),
  optimizeDeps: { entries: ['ctrl49ScreenLab.html'] },
  server: { host: '127.0.0.1', port: 18766, fs: { allow: [repo] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ctrl49ScreenLab.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });

  assert.deepEqual(await page.evaluate(() => window.lab.envelope(32, 64, 80, 40)), golden,
    'the preview builds the same envelope bytes the tool sends');

  const shot = async (name) => { if (shots) await page.locator('#screen').screenshot({ path: path.join(shots, `${name}.png`) }); };
  const names = ['faders', 'pads', 'sequencer', 'envelope', 'meters', 'animation'];
  for (let p = 0; p < names.length; p++) {
    const calls = await page.evaluate((p) => {
      const lab = window.lab;
      lab.showcase.call('set_envelope', lab.envelope(20, 70, 90, 60));
      lab.showcase.call('set_frame', lab.showcaseFrame(p, 300, [70, 30, 110, 64, 96, 50, 0, 88], 1, 6, 30, 26, 0b00010001));
      return lab.showcase.draw();
    }, p);
    const colours = await page.evaluate(() => window.lab.colours());
    assert.ok(calls.rect + calls.image + calls.text > 10, `${names[p]} draws`);
    assert.ok(colours > 20, `${names[p]} is a picture, not a flat fill (${colours} colours)`);
    await shot(`showcase-${p + 1}-${names[p]}`);
    console.log(`  ${names[p].padEnd(10)} ${calls.rect} rects, ${calls.image} images, ${calls.text} texts`);
  }

  // The animation page is a function of the frame counter: two frames apart it draws the same
  // amount of work, and a different picture — the proof it moves. A run of frames is saved as a
  // strip when screenshots are asked for, so the motion can be looked at.
  const frames = [];
  for (const f of [300, 305, 310, 330, 360, 400]) {
    frames.push(await page.evaluate((f) => {
      const lab = window.lab;
      lab.showcase.call('set_frame', lab.showcaseFrame(5, f, [80, 0, 0, 0, 0, 0, 0, 0], 0, 0, 0, 0, 0));
      lab.showcase.draw();
      return document.getElementById('screen').toDataURL();
    }, f));
    await shot(`animation-frame-${f}`);
  }
  assert.equal(new Set(frames).size, frames.length, 'every animation frame is a different picture');
  assert.equal(frames[0] === frames[3], false);
  console.log(`  animation  ${frames.length} distinct frames`);

  // The stress page at a middling load. Its first two redraws decode the early blocks (flat and
  // textured) behind a loading frame; then it draws what it is asked, and decodes E5's blocks one
  // per redraw until it has as many as asked.
  const stress = await page.evaluate(() => {
    const lab = window.lab;
    const frame = [10, 12, 20, 1, 3, 9, 0, 42];      // 160 rects, 96 sprites, 20 texts, 1 full, 3 MB late
    let calls;
    // two early, then three late, one per redraw, each drawn from nine redraws after its decode
    for (let i = 0; i < 15; i++) { lab.stress.call('set_load', frame); calls = lab.stress.draw(); }
    return calls;
  });
  assert.equal(stress.rect >= 160 && stress.text >= 20, true, 'the stress page draws the asked-for load');
  assert.equal(stress.image, 96 + 1 + 5, 'sprites, the full-screen blit and one swatch per decoded block, early and late');
  // Each swatch shows its block: the flat ones their band of colour, the textured ones orange. A
  // swatch draws the buffer its block was decoded into; a wrong id draws nothing, which on the
  // keyboard reads as a block that never decoded.
  const swatches = await page.evaluate(() => [16, 44, 96, 124, 152].map((x) =>
    Array.from(document.getElementById('screen').getContext('2d').getImageData(x + 13, 249, 1, 1).data.slice(0, 3))));
  const flatBands = { 0: [80, 120, 200], 2: [200, 192, 104], 4: [160, 168, 136] };
  for (const [b, rgb] of swatches.entries()) {
    if (flatBands[b]) assert.ok(rgb.every((v, i) => Math.abs(v - flatBands[b][i]) <= 2),
      `flat block ${b} shows its band (${rgb} against ${flatBands[b]})`);
    else assert.ok(rgb[0] > 120 && rgb[0] > rgb[1] + 40 && rgb[1] > rgb[2], `textured block ${b} shows orange (${rgb})`);
  }
  await shot('stress');
  console.log(`  stress     ${stress.rect} rects, ${stress.image} images, ${stress.text} texts`);

  // The preset's actual Lua and PNGs, at native resolution. Strict runner checks every
  // screen rectangle, sprite crop and text width, including extreme control positions.
  await page.evaluate(() => {
    document.getElementById('screen').style.cssText = 'width:480px;height:272px;display:block';
    for (let n = 0; n < 5; n++) window.lab.machined.draw();
    window.lab.machined.call('set_mode', [1]);
  });
  const presetValues = [[63,41,23,83,64,64,64,64], [99,88,109,78,120,92,106,99], [34,76,86,90,64,64,64,64]];
  for (let p = 0; p < 3; p++) {
    const pictures = [];
    for (const v of [0, 64, 127]) {
      pictures.push(await page.evaluate(({p,v}) => {
        const lab = window.lab;
        lab.machined.call('set_envelope', lab.envelope(v,v,v,v));
        lab.machined.call('set_frame', lab.showcaseFrame(p,300,Array(8).fill(v),p===1?7:3,0,0,0,0));
        lab.machined.draw();
        return document.getElementById('screen').toDataURL();
      }, {p,v}));
    }
    assert.equal(new Set(pictures).size,3,`preset page ${p}: controls change pixels at min/mid/max`);
    const budget = await page.evaluate(({p,values}) => {
      const lab = window.lab;
      lab.machined.call('set_envelope',lab.envelope(...values.slice(0,4)));
      lab.machined.call('set_frame',lab.showcaseFrame(p,300,values,p===1?2:0,0,0,0,0));
      return lab.machined.draw();
    }, {p,values:presetValues[p]});
    assert.equal(budget.decode,3,'only three images decoded, once each across page switches');
    assert.ok(budget.rect+budget.text+budget.image<600,'bounded work per redraw');
    await shot(`machined-${p+1}-${['controls','mixer','envelope'][p]}`);
    console.log(`  machined ${p+1} ${JSON.stringify(budget)}; extreme values, crops and labels pass`);
  }
  const meterFrames = await page.evaluate(() => {
    const lab=window.lab;
    return [300,311].map(f=>{
      lab.machined.call('set_frame',lab.showcaseFrame(1,f,Array(8).fill(100),2,0,0,0,0));
      lab.machined.draw(); return document.getElementById('screen').toDataURL();
    });
  });
  assert.notEqual(meterFrames[0],meterFrames[1],'demo meters animate while fader values stay fixed');
  const designs = await page.evaluate(() => Object.keys(window.lab.designs).sort());
  assert.deepEqual(designs, ['bakelite-1936','neon-glass','studio-1978']);
  for (const name of designs) {
    await page.evaluate(name => {
      const skin=window.lab.designs[name];
      for(let n=0;n<5;n++) skin.draw();
      skin.call('set_mode',[1]);
    },name);
    for(let p=0;p<3;p++) {
      const samples = await page.evaluate(({name,p})=>{
        const lab=window.lab, skin=lab.designs[name], images=[];
        // Sweep all 128 positions, covering every filmstrip crop and mixed ADSR slopes.
        for(let v=0;v<128;v++) {
          const values=[v,127-v,v,127-v,v,127-v,v,127-v];
          skin.call('set_envelope',lab.envelope(...values.slice(0,4)));
          skin.call('set_frame',lab.showcaseFrame(p,300,values,p===1?v%8:v%4,0,0,0,0));
          skin.draw();
          if(v===0||v===64||v===127) images.push(document.getElementById('screen').toDataURL());
        }
        return images;
      },{name,p});
      assert.equal(new Set(samples).size,3,`${name} page ${p} moves through its range`);
      const budget=await page.evaluate(({name,p,values})=>{
        const lab=window.lab,skin=lab.designs[name];
        skin.call('set_envelope',lab.envelope(...values.slice(0,4)));
        skin.call('set_frame',lab.showcaseFrame(p,300,values,p===1?2:0,0,0,0,0));
        return skin.draw();
      },{name,p,values:presetValues[p]});
      assert.equal(budget.decode,3,`${name} retains exactly three decoded assets`);
      assert.ok(budget.rect+budget.text+budget.image<600,`${name} redraw stays in budget`);
      await shot(`${name}-${p+1}-${['controls','mixer','envelope'][p]}`);
    }
    const meters=await page.evaluate(name=>{
      const lab=window.lab,skin=lab.designs[name];
      return [300,311].map(f=>{
        skin.call('set_frame',lab.showcaseFrame(1,f,Array(8).fill(100),0,0,0,0,0));
        skin.draw(); return document.getElementById('screen').toDataURL();
      });
    },name);
    assert.notEqual(meters[0],meters[1],`${name} meters animate`);
    console.log(`  ${name}: three pages, all 128 positions, sprite/text bounds, decode reuse, animated meters PASS`);
  }
  assert.deepEqual(errors, []);
  console.log('CTRL49 screen lab checks passed: golden payload, seven original pages, twelve preset pages, animation and bounds.');
} finally { await browser.close(); await server.close(); }
