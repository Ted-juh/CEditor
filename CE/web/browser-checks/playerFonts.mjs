/**
 * playerFonts.mjs — the player draws a panel's text in the imported face the panel carries.
 *
 * The exported plug-in's player has no Settings: before, a label in a font the author imported drew
 * in a fallback face there. This loads a panel the way the plug-in hands one over
 * (window.__CE_LOAD_PANEL__), carrying a monospace face (Liberation Mono) under a made-up family name
 * nothing else could supply, and measures the label: in the carried face "iiii" and "WWWW" are the
 * same width; in any fallback they are not. And the same panel without the face, to show the
 * measurement would catch it; and with the face subset in the page as packaging subsets it.
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/playerFonts.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.CE_BEHAVIOUR_URL ?? 'http://127.0.0.1:5199/';
const mono = `data:font/woff2;base64,${readFileSync(new URL('../src/assets/fonts/liberation-mono-regular.woff2', import.meta.url)).toString('base64')}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

async function widths(carry) {
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${base}player.html`);
  await page.waitForFunction(() => typeof window.__CE_LOAD_PANEL__ === 'function', null, { timeout: 30000 });
  const run = async (content) => {
    await page.evaluate(async ({ content, carry, mono }) => {
      const { createControl } = await import('/src/CE_Application/models/componentTypes.js');
      const { createPanel } = await import('/src/CE_Application/stores/panelModel.js');
      const panel = { ...createPanel('Fonts'), width: 600, height: 300 };
      const label = createControl('Label');
      Object.assign(label._children.Transform, { x: 20, y: 20, width: 500, height: 80 });
      label._children.Text.content = content;
      Object.assign(label._children.Text._children.Font, { family: 'Carried Mono', size: 40, letterSpacing: 0 });
      label._children.Core.setOverrides = ['Text.Font.family', 'Text.Font.letterSpacing'];
      panel.controls = [label];
      if (carry) {
        let data = mono;
        if (carry === 'subset') {
          // As packaging does it (utils/fontSubset.js): HarfBuzz in WebAssembly, in the page.
          const { panelCharacters, subsetFontDataUrl } = await import('/src/CE_Application/utils/fontSubset.js');
          data = await subsetFontDataUrl(mono, panelCharacters(panel));
          window.__subsetSizes = [mono.length, data.length];
        }
        panel.fonts = [{ family: 'Carried Mono', weight: '400', style: 'normal', data }];
      }
      window.__CE_LOAD_PANEL__(panel);
    }, { content, carry, mono });
    await page.waitForTimeout(1200);
    return page.evaluate(() => {
      const glyphs = document.querySelector('.text-glyphs');
      if (!glyphs) return null;
      const range = document.createRange();
      range.selectNodeContents(glyphs);
      return range.getBoundingClientRect().width;
    });
  };
  const narrow = await run('iiii');
  const wide = await run('WWWW');
  const loaded = await page.evaluate(() => document.fonts.check('40px "Carried Mono"') && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Carried Mono' && f.status === 'loaded'));
  const sizes = await page.evaluate(() => window.__subsetSizes ?? null);
  await page.close();
  return { narrow, wide, loaded, sizes, errors };
}

try {
  const carried = await widths(true);
  const bare = await widths(false);
  const subset = await widths('subset');
  check('a label in a carried face draws in it: a monospace face measures iiii and WWWW alike', () => {
    assert.ok(carried.narrow > 0 && carried.wide > 0, JSON.stringify(carried));
    assert.equal(carried.loaded, true, 'the face is registered and loaded');
    assert.ok(Math.abs(carried.narrow - carried.wide) < 1, JSON.stringify(carried));
  });
  check('without the face the same label falls back, which the measurement catches', () => {
    assert.ok(Math.abs(bare.narrow - bare.wide) > 10, JSON.stringify(bare));
  });
  check('a face subset for carrying, as packaging cuts it, still draws the label, at a fraction of the size', () => {
    assert.equal(subset.loaded, true);
    assert.ok(Math.abs(subset.narrow - subset.wide) < 1, JSON.stringify(subset));
    assert.ok(Math.abs(subset.narrow - carried.narrow) < 0.5, 'and measures as the whole font does');
    assert.ok(subset.sizes[1] < subset.sizes[0] / 3, `carried ${subset.sizes[1]} of ${subset.sizes[0]} characters of data URL`);
  });
  check('no page errors', () => assert.deepEqual([...carried.errors, ...bare.errors, ...subset.errors], []));
} finally {
  await browser.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('player fonts: all checks passed');
