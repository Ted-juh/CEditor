// The Strum and Humanize editors in the HoSTage MIDI chain, in a real browser: the pictures draw
// what the engines would play, the controls change the module, and the collapsed row names it.
// (The arithmetic itself is pinned to the engine in test/noteModuleViews.test.js.)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-note-modules-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18772, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

async function settledBox(locator) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const box = await locator.boundingBox();
    if (last && box && Math.abs(box.x - last.x) < 0.5 && Math.abs(box.y - last.y) < 0.5) return box;
    last = box;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return last;
}

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Rack', exact: true }).first().click();
  await page.getByRole('button', { name: 'MIDI', exact: true }).first().click();
  const add = page.getByLabel('Add a MIDI module');

  // Arpeggiator: the lane
  const arpRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: /^Arpeggiator/ });
  await arpRow.click();
  const arpEd = page.getByTestId('arp-editor');
  await arpEd.getByRole('switch', { name: 'Arpeggiator' }).click();
  await arpEd.locator('[data-testid=arp-mode] [data-value=pattern]').click();
  assert.equal(await arpEd.getByTestId('arp-melody').count(), 1, 'Drawn mode puts the melody on the lane');
  const cellsOf = (row) => arpEd.locator(`[data-row=${row}] .cell`);
  assert.equal(await cellsOf('repeats').count(), 16, 'sixteen steps to start');
  await cellsOf('repeats').nth(2).click();
  await cellsOf('repeats').nth(2).click();
  assert.equal(await cellsOf('repeats').nth(2).locator('.dots i').count(), 3, 'clicking a step adds repeats');
  await cellsOf('octave').nth(1).click();
  assert.equal(await cellsOf('octave').nth(1).innerText(), '+1');
  await cellsOf('chance').nth(3).click();
  assert.equal(await cellsOf('chance').nth(3).innerText(), '75');
  assert.match(await arpEd.getByTestId('arp-lane').innerText(), /as played/, 'untouched velocities read as played');
  const vbox = await arpEd.getByTestId('arp-velocity').boundingBox();
  await page.mouse.move(vbox.x + 4, vbox.y + 4);
  await page.mouse.down();
  await page.mouse.move(vbox.x + vbox.width - 4, vbox.y + vbox.height - 2, { steps: 12 });
  await page.mouse.up();
  assert.doesNotMatch(await arpEd.getByTestId('arp-lane').innerText(), /as played/, 'dragging draws the velocities');
  assert.ok(await arpEd.locator('.vcol.rest').count() > 0, 'and the bottom band draws rests');
  await arpEd.getByTestId('arp-length').press('ArrowDown');
  assert.equal(await cellsOf('repeats').count(), 12, 'the lane shortens as one');
  assert.equal(await cellsOf('repeats').nth(2).locator('.dots i').count(), 3, 'keeping what was drawn');
  await arpEd.locator('[data-testid=arp-patterns] [data-value=rolls]').click();
  assert.equal(await cellsOf('repeats').nth(15).locator('.dots i').count(), 4, 'a pattern fills the lane');
  assert.equal(await cellsOf('chance').nth(3).innerText(), '', 'and clears the rows it does not use');
  await arpEd.locator('[data-testid=arp-feel] [data-value=triplet]').click();
  assert.match(await arpRow.innerText(), /1\/16T.*repeats/, 'the collapsed row names the feel and the repeats');
  await add.selectOption('strum');
  await add.selectOption('humanize');

  // Velocity & Expression: drag the curve, learn from played notes, save a profile
  await add.selectOption('velocity');
  const velRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: /^Velocity/ });
  await velRow.click();
  const resp = page.getByTestId('response-editor');
  const curve = resp.getByTestId('velocity-curve');
  assert.equal(await resp.locator('[data-testid=velocity-shape] [aria-pressed=true]').innerText(), 'linear');
  const point = curve.locator('[data-point="4"]');
  await curve.scrollIntoViewIfNeeded();
  // The dock re-fits a moment after an editor opens; press where the point has settled, not
  // where it was a frame ago (that lands on the band behind it).
  const pbox = await settledBox(point);
  await page.mouse.move(pbox.x + pbox.width / 2, pbox.y + pbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pbox.x + pbox.width / 2, pbox.y - 60, { steps: 6 });
  await page.mouse.up();
  assert.equal(await resp.locator('[data-testid=velocity-shape] [aria-pressed=true]').innerText(), 'custom',
    'dragging a point of a named curve makes it custom');
  assert.ok(Number(await point.getAttribute('aria-valuenow')) > 70, 'and moves that point up');
  const grip = curve.locator('[data-grip=inputMin]');
  const gbox = await grip.boundingBox();
  await page.mouse.move(gbox.x + gbox.width / 2, gbox.y + gbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gbox.x + 80, gbox.y + gbox.height / 2, { steps: 6 });
  await page.mouse.up();
  assert.ok(Number(await grip.getAttribute('aria-valuenow')) > 10, 'the softest-used edge drags');

  // Played notes arrive through the same store the host's touch readout fills.
  const touch = (list) => page.evaluate(async (t) => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.hostMidiActivity.update((a) => ({ ...a, touch: t, seq: a.seq + 1 }));
  }, list);
  await resp.getByTestId('response-learn').click();
  await touch([[0, 60, 22], [0, 64, 35]]);
  await touch([[0, 67, 96], [1, 1, 40]]);
  await touch([[0, 72, 118]]);
  assert.ok(await curve.locator('.dot').count() >= 4, 'played notes show as dots on the curve');
  assert.match(await resp.getByTestId('response-learn-text').innerText(), /softest 22, hardest 118 \(4\)/,
    'learning counts the notes, not the controller');
  await resp.getByTestId('response-learn').click();
  assert.equal(await curve.locator('[data-grip=inputMin]').getAttribute('aria-valuenow'), '22',
    'done: the used range is what was played');
  assert.equal(await curve.locator('[data-grip=inputMax]').getAttribute('aria-valuenow'), '118');

  await resp.getByTestId('response-save').click();
  await resp.getByLabel('Profile name').fill('My keys');
  await resp.getByLabel('Keyboard port name').fill('CTRL49');
  await resp.getByLabel('Keyboard port name').press('Enter');
  assert.equal(await resp.locator('[data-testid=response-profiles] .chip[data-name="My keys"]').count(), 1,
    'a profile is saved and listed');
  await resp.locator('[data-testid=response-which] [data-value=expression]').click();
  assert.equal(await resp.getByTestId('expression-curve').isVisible(), true, 'the expression tab has its own curve');

  // Key: the song key and this module's transpose and scale
  await page.locator('[data-testid=midi-slot] .slot-name', { hasText: /^Note shaping/ }).click();
  const keyEd = page.getByTestId('key-editor');
  await keyEd.locator('[data-testid=song-key-root] [data-value="9"]').click();
  await keyEd.locator('[data-testid=song-key-scale] [data-value=minor]').click();
  assert.match(await keyEd.innerText(), /for the whole part: A minor/, 'the song key is set on the part');
  assert.ok(await keyEd.locator('[data-testid=key-readers] .chip').count() >= 2, 'and lists the modules that read a key');
  const readerArp = keyEd.locator('[data-testid=key-readers] .chip', { hasText: 'Arpeggiator' });
  const before = await readerArp.getAttribute('aria-pressed');
  await readerArp.click();
  assert.notEqual(await readerArp.getAttribute('aria-pressed'), before, 'a module can be switched to or from the song key here');
  await keyEd.locator('[data-testid=key-follows] [data-value=true]').click();
  assert.equal(await keyEd.getByTestId('key-keys').locator('rect.root').count(), 3, 'the keyboard lights the song key root (A) in each octave');
  await keyEd.locator('[data-testid=key-fold] [data-value=drop]').click();
  await keyEd.getByTestId('key-transpose').press('ArrowUp');
  assert.equal(await keyEd.locator('[data-testid=key-fold] [aria-pressed=true]').innerText(), 'drop',
    'notes outside the key can be dropped');
  assert.equal(await keyEd.getByTestId('key-transpose').innerText(), '+1', 'and the transpose sits beside it');
  // Back to C major, which the checks below are written in.
  await keyEd.locator('[data-testid=song-key-root] [data-value="0"]').click();
  await keyEd.locator('[data-testid=song-key-scale] [data-value=major]').click();

  // Echo, Chance, Length, Latch
  const rowOf = (name) => page.locator('[data-testid=midi-slot] .slot-name', { hasText: new RegExp(`^${name}`) });
  await add.selectOption('echo');
  await rowOf('Echo').click();
  const echoEd = page.getByTestId('echo-editor');
  await echoEd.getByTestId('echo-repeats').press('ArrowUp');
  await echoEd.getByTestId('echo-repeats').press('ArrowUp');
  assert.equal(await echoEd.locator('circle.hit').count(), 3, 'the note and two repeats are drawn');
  await echoEd.locator('[data-testid=echo-feel] [data-value=dotted]').click();
  await echoEd.locator('[data-testid=echo-climb-by] [data-value=true]').click();
  await echoEd.getByTestId('echo-climb').press('ArrowUp');
  await echoEd.getByTestId('echo-climb').press('ArrowUp');
  const echoLabels = await echoEd.locator('text.label').allTextContents();
  assert.deepEqual(echoLabels.map((t) => t.split(' ')[0]), ['C', 'E', 'G'], 'climbing in the scale is drawn C, E, G');
  assert.match(await rowOf('Echo').innerText(), /2× · 1\/8 dotted · \+2 steps/, 'the collapsed row reads it back');

  await add.selectOption('chance');
  await rowOf('Chance').click();
  const chanceEd = page.getByTestId('chance-editor');
  for (let i = 0; i < 20; i++) await chanceEd.getByTestId('chance-amount').press('ArrowDown');
  await chanceEd.getByRole('switch', { name: 'Notes on the beat' }).click();
  assert.match(await chanceEd.getByTestId('chance-picture').textContent(), /4 of 16 play/, 'at no chance only the four beats play');

  await add.selectOption('length');
  await rowOf('Note length').click();
  const lengthEd = page.getByTestId('length-editor');
  await lengthEd.locator('[data-testid=length-mode] [data-value="at most"]').click();
  assert.equal(await lengthEd.getByTestId('length-value').count(), 1, 'a length appears for "at most"');
  assert.match(await rowOf('Note length').innerText(), /at most 1\/16/);

  // Eight modules is the most a chain holds: make room by removing the ones already checked.
  const removeSlot = async (name) => {
    const slot = page.locator('[data-testid=midi-slot]').filter({ has: page.locator('.slot-name', { hasText: new RegExp(`^${name}`) }) });
    await slot.getByRole('button', { name: 'Remove this module' }).click();
    await slot.getByRole('button', { name: 'Confirm: Remove this module' }).click();
  };
  await removeSlot('Chance');
  await add.selectOption('latch');
  await rowOf('Latch').click();
  const latchEd = page.getByTestId('latch-editor');
  await latchEd.getByRole('switch', { name: 'Latch held notes' }).click();
  await latchEd.locator('[data-testid=latch-mode] [data-value=add]').click();
  await latchEd.getByRole('switch', { name: 'With the sustain pedal' }).click();
  assert.equal(await latchEd.locator('rect.key.held').count(), 5, 'adds: the picture holds all five notes');
  assert.match(await rowOf('Latch').innerText(), /holding · adds · pedal lets go/);
  await removeSlot('Latch');
  await removeSlot('Note length');

  // Strum
  const strumRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: 'Strum' });
  await strumRow.click();
  const picture = page.getByTestId('strum-picture');
  assert.equal(await picture.locator('rect.note').count(), 6, 'the example chord has six notes');
  const spread = page.getByTestId('strum-spread');
  assert.equal(await spread.innerText(), 'off');
  for (let i = 0; i < 3; i++) await spread.press('ArrowUp');
  assert.equal(await spread.innerText(), '1/16', 'arrow keys step the spread through the beat values');
  await page.locator('[data-testid=strum-stroke] [data-value=descending]').click();
  const onsets = async () => (await picture.locator('rect.onset').evaluateAll((rs) => rs.map((r) => ({
    y: Number(r.getAttribute('y')), x: Number(r.getAttribute('x')) }))));
  const down = await onsets();
  const highest = down.reduce((a, b) => (b.y < a.y ? b : a));
  const lowest = down.reduce((a, b) => (b.y > a.y ? b : a));
  assert.ok(highest.x < lowest.x, 'a down-stroke plays the highest note first');
  await page.locator('[data-testid=strum-stroke] [data-value=ascending]').click();
  const up = await onsets();
  assert.ok(up.reduce((a, b) => (b.y > a.y ? b : a)).x < up.reduce((a, b) => (b.y < a.y ? b : a)).x,
    'and an up-stroke the lowest');
  assert.equal(await picture.locator('circle.handle').count(), 1, 'the feel has a handle on the curve');
  assert.match(await strumRow.innerText(), /1\/16/, 'the collapsed row says what the strum does');
  await page.getByTestId('strum-editor').getByRole('switch', { name: 'Six strings' }).click();
  assert.equal(await picture.locator('rect.note').count(), 5,
    'guitar mode draws C on the keys as the five strings of the open C chord');

  // Humanize
  const humanRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: 'Humanize' });
  await humanRow.click();
  await page.locator('[data-testid=humanize-feel] [data-value=human]').click();
  assert.equal(await page.locator('[data-testid=humanize-feel] [aria-pressed=true]').innerText(), 'Human');
  assert.equal(await page.getByTestId('humanize-velocity').innerText(), '±18', 'a feel sets its amounts');
  assert.match(await humanRow.innerText(), /Human/, 'and the collapsed row names it');
  await page.getByTestId('humanize-velocity').press('ArrowUp');
  assert.equal(await page.locator('[data-testid=humanize-feel] [aria-pressed=true]').count(), 0,
    'changing an amount by hand leaves the named feels');
  assert.equal(await page.getByTestId('humanize-picture').locator('rect.stem').count(), 16, 'a bar of sixteen notes');
  // Humanize extras: freeze picks a fixed roll that "another roll" steps through.
  const humanEd = page.getByTestId('humanize-editor');
  await humanEd.getByRole('switch', { name: 'Freeze the roll' }).click();
  assert.match(await humanEd.getByTestId('humanize-reroll').innerText(), /another roll \(#1\)/);
  await humanEd.getByTestId('humanize-reroll').click();
  assert.match(await humanEd.getByTestId('humanize-reroll').innerText(), /#2/, 'frozen, the button steps to the next roll');
  await humanEd.getByTestId('humanize-swing').press('ArrowUp');
  assert.equal(await humanEd.getByTestId('humanize-swing').innerText(), '1%');

  // Every module: presets, A/B, Amount and the light (on the Strum module)
  await strumRow.click();
  const strumSlot = page.locator('[data-testid=midi-slot]').filter({ has: page.locator('.slot-name', { hasText: /^Strum/ }) });
  const bar = strumSlot.getByTestId('module-bar');
  const spreadNow = () => strumSlot.getByTestId('strum-spread').innerText();
  await bar.getByTestId('module-save').click();
  await bar.getByLabel('Preset name').fill('Folk');
  await bar.getByLabel('Preset name').press('Enter');
  assert.equal(await bar.locator('.chip[data-name=Folk]').count(), 1, 'a preset is saved for the Strum type');
  const saved = await spreadNow();
  await strumSlot.getByTestId('strum-spread').press('ArrowUp');
  assert.notEqual(await spreadNow(), saved);
  await bar.locator('.chip[data-name=Folk]').click();
  assert.equal(await spreadNow(), saved, 'loading the preset brings its settings back');

  await bar.locator('[data-testid=module-ab] [data-value=B]').click();
  await strumSlot.getByTestId('strum-spread').press('ArrowUp');
  const onB = await spreadNow();
  await bar.locator('[data-testid=module-ab] [data-value=A]').click();
  assert.equal(await spreadNow(), saved, 'A is what it was');
  await bar.locator('[data-testid=module-ab] [data-value=B]').click();
  assert.equal(await spreadNow(), onB, 'and B is the version changed on B');

  await bar.getByTestId('module-amount').press('ArrowDown');
  assert.equal(await bar.getByTestId('module-amount').getAttribute('aria-valuenow'), '95', 'the Amount scrubs');

  await strumSlot.locator('[data-testid=strum-stroke] [data-value="by velocity"]').click();
  await strumSlot.locator('[data-testid=strum-repeat] [data-value="4"]').click();
  assert.match(await strumSlot.innerText(), /the held chord, 4× a beat/, 're-strum is set per beat');

  const strumId = await strumSlot.evaluate(async () => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    let state; store.hostState.subscribe((v) => { state = v; })();
    const part = state.rack.parts[0];
    return [part.partId, part.midiChain.find((s) => s.type === 'strum').slotId];
  });
  const light = strumSlot.getByTestId('slot-light');
  await page.evaluate(async ([partId, slotId]) => {
    const store = await import('/src/CE_Application/stores/instrumentHost.js');
    store.hostModuleActivity.set({ [partId]: { [slotId]: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 40));
    store.hostModuleActivity.set({ [partId]: { [slotId]: 2 } });
    await new Promise((resolve) => setTimeout(resolve, 10));
  }, strumId);
  assert.match(await light.getAttribute('class'), /busy/, 'the light flickers when the module changes a note');

  // Chords: the set, the builder, and the two layers
  await add.selectOption('chord');
  const chordRow = page.locator('[data-testid=midi-slot] .slot-name', { hasText: /^Chords/ });
  await chordRow.click();
  const editor = page.getByTestId('chords-editor');
  await editor.getByTestId('chord-add').click();
  const cards = editor.locator('[data-testid=chord-set] .set-card');
  assert.equal(await cards.count(), 1, 'a new chord joins the set');
  assert.match(await cards.first().innerText(), /^C\b/, 'a C major triad to start from');
  await editor.locator('[data-testid=chord-shape] [data-shape=m7]').click();
  await editor.getByTestId('chord-root').press('ArrowUp');
  await editor.getByTestId('chord-root').press('ArrowUp');
  assert.match(await cards.first().innerText(), /^Dm7/, 'shape and root rebuild the chord, and its name follows');
  assert.equal(await editor.getByTestId('chord-builder-keys').locator('rect.on').count(), 4,
    'the builder keyboard shows the four notes');
  await editor.getByTestId('chord-fill').click();
  assert.equal(await cards.count(), 8, 'the seven chords of the key join it');

  await editor.locator('[data-testid=follow-shape] [data-shape=minor]').click();
  assert.equal(await editor.getByTestId('layer-light-follow').getAttribute('aria-pressed'), 'true',
    'picking a follow shape lights the layer');
  assert.match(await editor.getByTestId('follow-preview').innerText(), /C4 plays Cm/);
  await editor.getByTestId('follow-high').click();
  await editor.getByTestId('follow-high').fill('B3');
  await editor.getByTestId('follow-high').press('Enter');
  await editor.getByTestId('follow-keys').locator('rect[data-note="48"]').click();
  assert.match(await editor.getByTestId('follow-preview').innerText(), /C3 plays Cm/);
  await editor.getByTestId('follow-keys').locator('rect[data-note="60"]').click();
  assert.match(await editor.getByTestId('follow-preview').innerText(), /C4 plays itself/,
    'above the follow range a key plays alone');

  await editor.getByTestId('layer-tab-keys').click();
  await editor.getByTestId('chord-learn').click();
  const badges = editor.locator('[data-testid=key-chords] .key-badge');
  assert.equal(await badges.count(), 1, 'learning maps a key');
  assert.match(await badges.first().innerText(), /C4 → C/);
  assert.equal(await editor.getByTestId('layer-light-keys').getAttribute('aria-pressed'), 'true');
  await editor.getByTestId('keymap-keys').locator('rect[data-note="62"]').click();
  await editor.locator('[data-testid=keymap-assign] .tile[data-index="0"]').click();
  assert.equal(await badges.count(), 2, 'a clicked key can be pointed at any set chord');
  assert.match(await chordRow.innerText(), /follow min.*2 mapped keys/, 'the collapsed row names both layers');
  // Pads: fill a bank, hear a pad light while held, point an empty pad at a chord.
  await editor.getByTestId('layer-tab-pads').click();
  await editor.getByTestId('pad-fill').click();
  const pads = editor.locator('[data-testid=pad-grid] .pad');
  assert.equal(await pads.locator('xpath=self::*[not(contains(@class, "empty"))]').count(), 8,
    'filling bank A puts the first eight set chords on its pads');
  const firstPad = editor.locator('[data-testid=pad-grid] .pad[data-pad="0"]');
  const box = await firstPad.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  assert.equal(await editor.locator('[data-testid=pad-grid] .pad.lit').count(), 1, 'a held pad lights');
  await page.mouse.up();
  assert.equal(await editor.locator('[data-testid=pad-grid] .pad.lit').count(), 0, 'and goes out when let go');
  await editor.locator('[data-testid=pad-bank] [data-value="1"]').click();
  assert.equal(await editor.locator('[data-testid=pad-grid] .pad.empty').count(), 8, 'bank B starts empty');
  await editor.locator('[data-testid=pad-grid] .pad[data-pad="8"]').click();
  await editor.locator('[data-testid=pad-assign] .tile[data-index="4"]').click();
  assert.match(await editor.locator('[data-testid=pad-grid] .pad[data-pad="8"]').innerText(), /F/,
    'an empty pad can be pointed at any set chord');

  // Progression: C, Am, F, G, stepped from the buttons.
  await editor.getByTestId('layer-tab-prog').click();
  for (const index of [1, 6, 4, 5])
    await editor.locator(`[data-testid=prog-add] .tile[data-index="${index}"]`).click();
  const steps = editor.locator('[data-testid=prog-steps] .step');
  assert.equal(await steps.count(), 4, 'four steps');
  assert.match(await steps.nth(1).innerText(), /Am/);
  assert.equal(await steps.nth(0).getAttribute('class').then((c) => c.includes('next')), true, 'step 1 plays next');
  await editor.getByTestId('prog-next').click();
  assert.equal(await steps.nth(1).getAttribute('class').then((c) => c.includes('next')), true, 'the step button moves on');
  await editor.getByTestId('prog-back').click();
  await editor.getByTestId('prog-back').click();
  assert.equal(await steps.nth(3).getAttribute('class').then((c) => c.includes('next')), true, 'and back, wrapping');
  assert.match(await chordRow.innerText(), /9 pads.*4-step progression/, 'the collapsed row counts pads and steps');

  await editor.getByTestId('layer-light-follow').click();
  assert.doesNotMatch(await chordRow.innerText(), /follow/, 'the light switches following off');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('noteModules: arp, velocity, echo, chance, length, latch, strum, humanize and chords editors draw, change and summarise');
} finally {
  await browser.close();
  await server.close();
}
