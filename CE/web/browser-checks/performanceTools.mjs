// The Performance tools, drawn and dragged, in a real browser: an LFO's shape, rate and range; an
// envelope set by dragging its picture; MSEG bends; a random modulator's character and range; and
// a pattern lane's step values drawn in rows under it.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-performance-tools-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18774, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

async function drag(page, locator, dx, dy, steps = 8) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
}

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  const state = () => page.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let value; store.hostState.subscribe((v) => { value = v; })();
    return value;
  });
  const rack = async () => (await state()).rack;
  await page.getByRole('button', { name: 'Performance', exact: true }).first().click();
  const tool = async (group, id) => {
    await page.getByTestId(`perf-group-${group}`).click();
    await page.getByTestId(`perf-tab-${id}`).click();
  };

  // LFO: shapes as pictures, the rate free or synced, the range on the wave, the phase.
  await tool('modulation', 'lfos');
  await page.getByRole('button', { name: '+ LFO', exact: true }).click();
  const lfoCard = page.getByTestId('lfo-card').last();
  const lfo = async () => (await rack()).midiLfos.at(-1);
  assert.equal(await lfoCard.locator('[data-testid=lfo-shape] button svg').count(), 6, 'every shape button draws its wave');
  await lfoCard.locator('[data-testid=lfo-shape] [data-value=square]').click();
  assert.equal((await lfo()).shape, 'square');
  const wave = await lfoCard.locator('.wave').getAttribute('d');
  assert.match(wave, /^M0\.00,/, 'the wave is drawn');
  await lfoCard.locator('[data-testid=lfo-rate-sync] [data-value=true]').click();
  assert.equal((await lfo()).sync, true, 'synced to the beat');
  const beats = (await lfo()).syncBeats;
  await lfoCard.getByTestId('lfo-rate-beats').press('ArrowUp');
  assert.ok((await lfo()).syncBeats > beats, 'the synced rate steps through note lengths');
  await lfoCard.locator('[data-testid=lfo-rate-sync] [data-value=false]').click();
  const hz = (await lfo()).rateHz;
  await lfoCard.getByTestId('lfo-rate-hz').press('ArrowUp');
  assert.ok(Math.abs((await lfo()).rateHz - hz * 1.06) < 0.02, 'a free rate steps by ratio');
  await drag(page, lfoCard.getByTestId('lfo-scope-max'), 0, 30);
  assert.ok((await lfo()).maximum < 0.9, `dragging the top line down lowers the maximum (${(await lfo()).maximum})`);
  assert.notEqual(await lfoCard.locator('.wave').getAttribute('d'), wave, 'and the wave is squeezed with it');
  await lfoCard.getByTestId('lfo-phase').press('ArrowUp');
  assert.ok((await lfo()).phaseOffset > 0, 'phase steps');
  assert.equal(await lfoCard.locator('input[type=range], select:not(.target)').count(), 0, 'no sliders or small dropdowns left');
  const shot = async (locator, name) => {
    if (process.env.PERF_SCREENSHOTS) await locator.screenshot({ path: `${process.env.PERF_SCREENSHOTS}/${name}.png` });
  };
  await shot(lfoCard, 'lfo');

  // Envelope: drag the picture.
  await tool('modulation', 'envelopes');
  await page.getByRole('button', { name: '+ Envelope', exact: true }).click();
  const envCard = page.getByTestId('envelope-card').last();
  const env = async () => (await rack()).envelopes.at(-1);
  const before = await env();
  await drag(page, envCard.getByTestId('envelope-release'), 60, 0);
  assert.ok((await env()).releaseMs > before.releaseMs, `dragging the release end right lengthens it (${before.releaseMs} -> ${(await env()).releaseMs})`);
  await drag(page, envCard.getByTestId('envelope-decay'), 0, 40);
  assert.ok((await env()).sustain < before.sustain, 'dragging the decay corner down lowers the sustain');
  await drag(page, envCard.getByTestId('envelope-bend'), 0, -40);
  assert.ok((await env()).curve < before.curve, 'pulling the bend up makes the stages linger');
  await envCard.getByTestId('envelope-attack').press('ArrowRight');
  assert.ok((await env()).attackMs > before.attackMs, 'arrow keys move a focused handle');
  assert.match(await envCard.getByTestId('envelope-times').innerText(), /R\s+\d/);
  await envCard.getByTestId('envelope-note-low').press('ArrowUp');
  assert.equal((await env()).noteLow, before.noteLow + 1);
  assert.equal(await envCard.locator('input[type=range], input[type=number], select').count(), 0, 'no sliders, number boxes or dropdowns left');
  await shot(envCard, 'envelope');

  // MSEG: add a point, bend a segment, and no slider rows repeating the curve.
  await tool('modulation', 'msegs');
  await page.getByRole('button', { name: '+ MSEG', exact: true }).click();
  const msegCard = page.getByTestId('mseg-card').last();
  const mseg = async () => (await rack()).msegs.at(-1);
  const points = (await mseg()).points.length;
  const editor = msegCard.getByTestId('mseg-editor');
  const ebox = await editor.boundingBox();
  await page.mouse.dblclick(ebox.x + ebox.width * 0.62, ebox.y + ebox.height * 0.3);
  assert.equal((await mseg()).points.length, points + 1, 'a double-click adds a point');
  const curvesBefore = (await mseg()).points.map((p) => p.curve).join();
  await drag(page, msegCard.getByTestId('mseg-bend').first(), 0, -30);
  assert.notEqual((await mseg()).points.map((p) => p.curve).join(), curvesBefore, 'dragging a bend handle bends its segment');
  assert.equal(await msegCard.locator('input[type=range], input[type=number], select').count(), 0, 'the duplicate slider rows are gone');
  assert.match(await msegCard.getByTestId('mseg-picked').innerText(), /Point \d/);
  await shot(msegCard, 'mseg');

  // Random: character toggles, its own amount, the range on the preview.
  await tool('modulation', 'random');
  await page.getByRole('button', { name: '+ Random', exact: true }).click();
  const randomCard = page.getByTestId('random-card').last();
  const random = async () => (await rack()).randomModulators.at(-1);
  await randomCard.locator('[data-testid=random-mode] [data-value=chaos]').click();
  assert.equal((await random()).mode, 'chaos');
  assert.equal(await randomCard.getByTestId('random-amount').count(), 1, 'chaos has its own amount');
  await drag(page, randomCard.getByTestId('random-scope-min'), 0, -25);
  assert.ok((await random()).minimum > 0.1, 'dragging the bottom line up raises the minimum');
  await randomCard.getByTestId('random-chance').press('ArrowDown');
  assert.ok((await random()).probability < 1);
  assert.equal(await randomCard.locator('input[type=range], select').count(), 0);
  await shot(randomCard, 'random');

  // Pattern steps: rows under the selected lane, drawn with a drag.
  await tool('playback', 'patterns');
  await page.getByTestId('perf-add-pattern').click();
  await page.locator('.pattern-row .pattern-name').last().click();
  await page.getByRole('combobox', { name: 'Add a lane' }).selectOption('drum');
  const perf = async () => (await state()).performance;
  const pattern = async () => (await perf()).patterns.at(-1);
  const drumLane = async () => (await pattern()).lanes.find((lane) => lane.type === 'drum');
  const lane = page.locator('.lane').filter({ has: page.locator('.step-grid') }).last();
  for (const index of [0, 4, 8, 12]) await lane.locator('.step').nth(index).click();
  await lane.locator('.lane-name').click();
  const laneId = (await drumLane()).laneId;
  const rows = page.getByTestId(`step-rows-${laneId}`);
  assert.equal(await rows.locator('.bars').count(), 5, 'a drum lane gets velocity, length, chance, nudge and ratchet rows');
  const gateRow = rows.getByTestId('step-row-gate');
  const gbox = await gateRow.boundingBox();
  await page.mouse.move(gbox.x + 2, gbox.y + gbox.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(gbox.x + gbox.width - 2, gbox.y + gbox.height * 0.9, { steps: 16 });
  await page.mouse.up();
  const gates = (await drumLane()).steps.filter((s) => s.active).map((s) => s.gate);
  assert.ok(gates.every((g) => g < 0.5), `drawing low across the length row shortens every played step (${gates})`);
  const chanceRow = rows.getByTestId('step-row-probability');
  const cbox = await chanceRow.boundingBox();
  await page.mouse.move(cbox.x + 2, cbox.y + cbox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(cbox.x + cbox.width * 0.3, cbox.y + cbox.height * 0.5, { steps: 6 });
  await page.mouse.up();
  const chances = (await drumLane()).steps.map((s) => s.probability);
  assert.ok(chances[0] >= 45 && chances[0] <= 55, `the first step is drawn at half chance (${chances[0]})`);
  assert.equal(chances[12], 100, 'steps the drag did not reach keep theirs');
  assert.equal((await drumLane()).steps[1].active, false, 'a rest stays a rest');
  await shot(page.locator('.pattern-editor'), 'pattern');
  await page.locator('[data-testid=lane-rate] [data-value="2"]').click();
  assert.equal((await drumLane()).stepsPerBeat, 2, 'the lane rate is a toggle row');
  await page.getByTestId('lane-steps').press('ArrowUp');
  assert.equal((await drumLane()).stepCount, 17);
  await page.getByTestId('pattern-swing').press('ArrowUp');
  assert.ok((await pattern()).swing > 0, 'swing drags or steps');
  // The target part stays a list: it has as many entries as the rack has parts.
  assert.equal(await page.locator('[data-testid=perf-lane-options] input[type=number]').count(), 0, 'no number boxes in the lane options');
  assert.equal(await page.locator('[data-testid=perf-lane-options] select').count(), 1, 'and one list, the target part');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('performanceTools: LFO, envelope, MSEG, random and pattern step rows draw and drag');
} finally {
  await browser.close();
  await server.close();
}
