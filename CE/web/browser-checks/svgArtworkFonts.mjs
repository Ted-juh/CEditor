/**
 * svgArtworkFonts.mjs — text in imported SVG artwork draws in its own font on the panel.
 *
 * A browser draws an SVG image without the page's fonts, so artwork text in a panel face used to fall
 * back to a default font. This plans a drawing whose title is in Allerta Stencil as the import
 * command does, carries its fonts into the background (utils/svgArtworkFonts.js, through the font
 * worker), and compares the ink the background draws with the same text drawn by the page in that face, and in
 * the fallback.
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/svgArtworkFonts.mjs
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.CE_BEHAVIOUR_URL ?? 'http://127.0.0.1:5199/';
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(base);
await page.waitForFunction(() => !!document.querySelector('.menu-bar, [role="menubar"]'), null, { timeout: 60000 });

const result = await page.evaluate(async () => {
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120">
    <rect width="600" height="120" fill="#ffffff"/>
    <text x="0" y="60" font-family="Allerta Stencil" font-size="40" fill="#000">WIDE FILTER</text>
    <g id="components"><circle id="knob-cutoff" cx="500" cy="60" r="20" fill="#888"/></g>
  </svg>`;
  const { planSvgPanelImport, svgDataUrl } = await import('/src/CE_Application/utils/svgPanelImport.js');
  const { embedSvgFonts } = await import('/src/CE_Application/utils/svgArtworkFonts.js');
  // What the import command puts behind the controls, before and after the fonts are carried.
  const plan = planSvgPanelImport(art);
  const before = plan.background.dataUrl;
  const outcome = await embedSvgFonts(plan.background.svg);
  const after = svgDataUrl(outcome.svg);

  async function ink(src) {
    const img = new Image(); img.src = src; await img.decode();
    await new Promise((r) => setTimeout(r, 300));
    const c = document.createElement('canvas'); c.width = 600; c.height = 120;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, 600, 120).data;
    let maxX = 0;
    for (let y = 0; y < 100; y += 1) for (let x = 0; x < 450; x += 1) if (px[(y * 600 + x) * 4] < 128) maxX = Math.max(maxX, x);
    return maxX;
  }
  return { outcome: { embedded: outcome.embedded, missing: outcome.missing }, carried: outcome.svg.includes('@font-face'), before: await ink(before), after: await ink(after) };
});

console.log(`   ink width: before ${result.before}px, after ${result.after}px`);
check('the face was carried into the background', () => {
  assert.deepEqual(result.outcome.embedded, ['Allerta Stencil']);
  assert.ok(result.carried);
});
check('and the text now draws in it, not the fallback', () => assert.notEqual(result.after, result.before));
check('no page errors', () => assert.deepEqual(errors, []));

await browser.close();
if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nsvg artwork fonts: all checks passed');
